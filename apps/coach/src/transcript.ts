import { Database } from "bun:sqlite";

import { assignmentsFrom, type SpeakerHint, speakerLabels, withProviderSpeakers } from "./speakers";
import { formatTimestamp } from "./timestamp";

export type Word = {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  channel: number;
  speaker_index?: number | null;
};

export type LiveDelta = {
  new_words: Word[];
  replaced_ids: string[];
  partials?: Array<{ text: string; start_ms: number; end_ms: number; channel: number }>;
};

export type TranscriptLine = {
  speaker: string;
  channel: number;
  start_ms: number;
  end_ms: number;
  text: string;
};

export type LiveTranscript = {
  sessionId: string;
  transcriptId: string;
  title: string | null;
  live: boolean;
  startedAtMs: number | null;
  endedAtMs: number | null;
  lines: TranscriptLine[];
  pending: string;
};

export function foldDeltas(base: Word[], deltas: LiveDelta[]): Word[] {
  let words = base;
  for (const delta of deltas) {
    const removed = new Set([
      ...delta.replaced_ids,
      ...delta.new_words.map((word) => word.id),
    ]);
    words = [...words.filter((word) => !removed.has(word.id)), ...delta.new_words];
    words.sort((a, b) => a.start_ms - b.start_ms);
  }
  return words;
}

export function toLines(words: Word[], labels: Map<string, string>, sinceMs = 0): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const word of words) {
    if (word.end_ms <= sinceMs) continue;
    const speaker = labels.get(word.id) ?? (word.channel === 0 ? "You" : "Them");
    const last = lines.at(-1);
    if (last && last.speaker === speaker && word.start_ms - last.end_ms < 2_000) {
      last.text += word.text;
      last.end_ms = word.end_ms;
    } else {
      lines.push({
        speaker,
        channel: word.channel,
        start_ms: word.start_ms,
        end_ms: word.end_ms,
        text: word.text.trimStart(),
      });
    }
  }
  return lines;
}

export function renderLines(lines: readonly TranscriptLine[]): string {
  return lines.map((line) => `[${formatTimestamp(line.start_ms)}] ${line.speaker}: ${line.text.trim()}`).join("\n");
}

export function renderTranscript(transcript: LiveTranscript): string {
  const header = `Meeting: ${transcript.title ?? "Untitled"} (${transcript.live ? "recording" : "ended"})`;
  const body = renderLines(transcript.lines);
  const pending = transcript.pending ? `\n(still being spoken: ${transcript.pending.trim()})` : "";
  return `${header}\n${body || "(no speech yet)"}${pending}`;
}

type TranscriptRow = {
  id: string;
  session_id: string;
  owner_user_id: string;
  words_json: string | null;
  speaker_hints_json: string | null;
  started_at_ms: number | null;
  ended_at_ms: number | null;
  title: string | null;
  recording: number;
};

const RECENT_SPEECH_MS = 5 * 60_000;

const RECORDING = `t.ended_at_ms IS NULL AND CASE
  WHEN $recording IS NOT NULL THEN t.session_id IN (SELECT value FROM json_each($recording))
  ELSE t.started_at_ms >= $activeSinceMs OR (
    SELECT MAX(d.created_at) FROM transcript_live_deltas d WHERE d.transcript_id = t.id
  ) >= $activeSinceIso
END`;

const TRANSCRIPT_COLUMNS = `t.id, t.session_id, t.owner_user_id, t.words_json, t.speaker_hints_json, t.started_at_ms, t.ended_at_ms, s.title,
  (${RECORDING}) AS recording`;

type RecordingParams = { $recording: string | null; $activeSinceMs: number; $activeSinceIso: string };

function recordingParams(recording: ReadonlySet<string> | undefined, nowMs: number): RecordingParams {
  const since = nowMs - RECENT_SPEECH_MS;
  return {
    $recording: recording ? JSON.stringify([...recording]) : null,
    $activeSinceMs: since,
    $activeSinceIso: new Date(since).toISOString(),
  };
}

function readSpeakerContext(db: Database, sessionId: string, selfHumanId: string) {
  const names = new Map(
    db
      .query<{ id: string; name: string }, []>(`SELECT id, name FROM humans WHERE deleted_at IS NULL`)
      .all()
      .map((human) => [human.id, human.name]),
  );
  const participantHumanIds = db
    .query<{ human_id: string }, [string]>(
      `SELECT human_id FROM session_participants
       WHERE session_id = ? AND deleted_at IS NULL AND human_id <> ''`,
    )
    .all(sessionId)
    .map((participant) => participant.human_id);
  return { names, selfHumanId, participantHumanIds };
}

export function openAppDb(path: string): Database {
  return new Database(path, { readonly: true });
}

export function readLiveTranscript(
  db: Database,
  options: { sessionId?: string; sinceMs?: number; recording?: ReadonlySet<string>; nowMs?: number } = {},
): LiveTranscript | null {
  const params = recordingParams(options.recording, options.nowMs ?? Date.now());
  return db.transaction(() => {
    const row = options.sessionId
      ? db
          .query<TranscriptRow, [RecordingParams & { $sessionId: string }]>(
            `SELECT ${TRANSCRIPT_COLUMNS}
             FROM transcripts t LEFT JOIN sessions s ON s.id = t.session_id
             WHERE t.session_id = $sessionId AND t.deleted_at IS NULL
             ORDER BY t.started_at_ms DESC LIMIT 1`,
          )
          .get({ ...params, $sessionId: options.sessionId })
      : db
          .query<TranscriptRow, [RecordingParams]>(
            `SELECT ${TRANSCRIPT_COLUMNS}
             FROM transcripts t LEFT JOIN sessions s ON s.id = t.session_id
             WHERE t.deleted_at IS NULL
             ORDER BY recording DESC, t.started_at_ms DESC LIMIT 1`,
          )
          .get(params);
    if (!row) return null;

    const base: Word[] = row.words_json ? JSON.parse(row.words_json) : [];
    const deltas = db
      .query<{ delta_json: string }, [string]>(
        `SELECT delta_json FROM transcript_live_deltas WHERE transcript_id = ? ORDER BY sequence`,
      )
      .all(row.id)
      .map((delta): LiveDelta => JSON.parse(delta.delta_json));

    const hints: SpeakerHint[] = row.speaker_hints_json ? JSON.parse(row.speaker_hints_json) : [];
    const words = withProviderSpeakers(foldDeltas(base, deltas), hints);
    const labels = speakerLabels(
      words,
      assignmentsFrom(hints, words),
      readSpeakerContext(db, row.session_id, row.owner_user_id),
    );
    const partials = deltas.at(-1)?.partials ?? [];

    return {
      sessionId: row.session_id,
      transcriptId: row.id,
      title: row.title,
      live: row.recording === 1,
      startedAtMs: row.started_at_ms,
      endedAtMs: row.ended_at_ms,
      lines: toLines(words, labels, options.sinceMs),
      pending: partials.map((partial) => partial.text).join(""),
    };
  })();
}

export function readSelfName(db: Database, sessionId: string): string | null {
  const row = db
    .query<{ name: string | null }, [string]>(
      `SELECT h.name FROM transcripts t JOIN humans h ON h.id = t.owner_user_id
       WHERE t.session_id = ? AND t.deleted_at IS NULL AND h.deleted_at IS NULL
       ORDER BY t.started_at_ms DESC LIMIT 1`,
    )
    .get(sessionId);
  return row?.name?.trim() || null;
}

export type MeetingInfo = {
  sessionId: string;
  title: string | null;
  startedAt: string | null;
  endedAt: string | null;
  participants: Array<{ name: string | null; email: string | null }>;
};

export function readMeetingInfo(db: Database, sessionId: string): MeetingInfo | null {
  const session = db
    .query<{ id: string; title: string | null; started_at: string | null; ended_at: string | null }, [string]>(
      `SELECT id, title, started_at, ended_at FROM sessions WHERE id = ?`,
    )
    .get(sessionId);
  if (!session) return null;
  const participants = db
    .query<{ name: string | null; email: string | null }, [string]>(
      `SELECT COALESCE(NULLIF(p.display_name, ''), h.name) AS name,
              COALESCE(NULLIF(p.email, ''), h.email) AS email
       FROM session_participants p LEFT JOIN humans h ON h.id = p.human_id
       WHERE p.session_id = ? AND p.deleted_at IS NULL ORDER BY p.created_at`,
    )
    .all(sessionId);
  return {
    sessionId: session.id,
    title: session.title,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    participants,
  };
}
