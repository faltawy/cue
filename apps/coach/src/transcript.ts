import { Database } from "bun:sqlite";

import { type MeetingPointer } from "@anlg/assistant/meeting-state";
import { formatTimestamp } from "@anlg/assistant/timestamp";

import {
  assignmentsFrom,
  type SpeakerHint,
  speakerLabels,
  withProviderSpeakers,
} from "./speakers";

export enum ParticipantResolutionStatus {
  Resolved = "resolved",
  Ambiguous = "ambiguous",
  NotFound = "not_found",
}

export enum TranscriptEditStatus {
  Ready = "ready",
  Live = "live",
  NotFound = "not_found",
}

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
  partials?: Array<{
    text: string;
    start_ms: number;
    end_ms: number;
    channel: number;
  }>;
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
    words = [
      ...words.filter((word) => !removed.has(word.id)),
      ...delta.new_words,
    ];
    words.sort((a, b) => a.start_ms - b.start_ms);
  }
  return words;
}

export function toLines(
  words: Word[],
  labels: Map<string, string>,
  sinceMs = 0,
): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const word of words) {
    if (word.end_ms <= sinceMs) continue;
    const speaker =
      labels.get(word.id) ?? (word.channel === 0 ? "You" : "Them");
    const last = lines.at(-1);
    if (
      last &&
      last.speaker === speaker &&
      word.start_ms - last.end_ms < 2_000
    ) {
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
  return lines
    .map(
      (line) =>
        `[${formatTimestamp(line.start_ms)}] ${line.speaker}: ${line.text.trim()}`,
    )
    .join("\n");
}

export function renderTranscript(transcript: LiveTranscript): string {
  const header = `Meeting: ${transcript.title ?? "Untitled"} (${transcript.live ? "recording" : "ended"})`;
  const body = renderLines(transcript.lines);
  const pending = transcript.pending
    ? `\n(still being spoken: ${transcript.pending.trim()})`
    : "";
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

type RecordingParams = {
  $recording: string | null;
  $activeSinceMs: number;
  $activeSinceIso: string;
};

function recordingParams(
  recording: ReadonlySet<string> | undefined,
  nowMs: number,
): RecordingParams {
  const since = nowMs - RECENT_SPEECH_MS;
  return {
    $recording: recording ? JSON.stringify([...recording]) : null,
    $activeSinceMs: since,
    $activeSinceIso: new Date(since).toISOString(),
  };
}

function readSpeakerContext(
  db: Database,
  sessionId: string,
  selfHumanId: string,
) {
  const names = new Map(
    db
      .query<{ id: string; name: string }, []>(
        `SELECT id, name FROM humans WHERE deleted_at IS NULL`,
      )
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

type TranscriptQuery = {
  sessionId?: string;
  recording?: ReadonlySet<string>;
  nowMs?: number;
};

function transcriptRow(
  db: Database,
  options: TranscriptQuery,
): TranscriptRow | null {
  const params = recordingParams(
    options.recording,
    options.nowMs ?? Date.now(),
  );
  const sessionId =
    options.sessionId ?? options.recording?.values().next().value;
  return sessionId
    ? db
        .query<TranscriptRow, [RecordingParams & { $sessionId: string }]>(
          `SELECT ${TRANSCRIPT_COLUMNS}
           FROM transcripts t LEFT JOIN sessions s ON s.id = t.session_id
           WHERE t.session_id = $sessionId AND t.deleted_at IS NULL
           ORDER BY t.started_at_ms DESC LIMIT 1`,
        )
        .get({ ...params, $sessionId: sessionId })
    : db
        .query<TranscriptRow, [RecordingParams]>(
          `SELECT ${TRANSCRIPT_COLUMNS}
           FROM transcripts t LEFT JOIN sessions s ON s.id = t.session_id
           WHERE t.deleted_at IS NULL
           ORDER BY recording DESC, t.started_at_ms DESC LIMIT 1`,
        )
        .get(params);
}

export type MeetingStatus = Pick<
  LiveTranscript,
  "sessionId" | "title" | "live" | "startedAtMs" | "endedAtMs"
>;

export function readMeetingStatus(
  db: Database,
  options: TranscriptQuery = {},
): MeetingStatus | null {
  const active = options.sessionId
    ? options.recording?.has(options.sessionId)
      ? options.sessionId
      : undefined
    : options.recording?.values().next().value;
  const row = transcriptRow(
    db,
    active ? { ...options, sessionId: active } : options,
  );
  if (active && row?.recording !== 1) {
    const session = db
      .query<{ title: string | null }, [string]>(
        "SELECT title FROM sessions WHERE id = ?",
      )
      .get(active);
    if (session)
      return {
        sessionId: active,
        title: session.title,
        live: true,
        startedAtMs: null,
        endedAtMs: null,
      };
  }
  return row
    ? {
        sessionId: row.session_id,
        title: row.title,
        live: row.recording === 1,
        startedAtMs: row.started_at_ms,
        endedAtMs: row.ended_at_ms,
      }
    : null;
}

export function readLiveTranscript(
  db: Database,
  options: TranscriptQuery & { sinceMs?: number } = {},
): LiveTranscript | null {
  return db.transaction(() => {
    const row = transcriptRow(db, options);
    if (!row) return null;

    const base: Word[] = row.words_json ? JSON.parse(row.words_json) : [];
    const deltas = db
      .query<{ delta_json: string }, [string]>(
        `SELECT delta_json FROM transcript_live_deltas WHERE transcript_id = ? ORDER BY sequence`,
      )
      .all(row.id)
      .map((delta): LiveDelta => JSON.parse(delta.delta_json));

    const hints: SpeakerHint[] = row.speaker_hints_json
      ? JSON.parse(row.speaker_hints_json)
      : [];
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

export type TranscriptEditLine = {
  start_ms: number;
  end_ms: number;
  text: string;
  word_ids: string[];
  channel: number;
  speaker_index: number | null;
  speaker: string;
};

export type TranscriptEditSpeaker = {
  channel: number;
  speaker_index: number;
  speaker: string;
};

export type TranscriptEditContext =
  | { status: TranscriptEditStatus.Ready; lines: TranscriptEditLine[] }
  | { status: TranscriptEditStatus.Live; speakers: TranscriptEditSpeaker[] }
  | { status: TranscriptEditStatus.NotFound };

export function readTranscriptEditContext(
  db: Database,
  sessionId: string,
): TranscriptEditContext {
  return db.transaction((): TranscriptEditContext => {
    const row = transcriptRow(db, { sessionId });
    if (!row) return { status: TranscriptEditStatus.NotFound };

    const base: Word[] = row.words_json ? JSON.parse(row.words_json) : [];
    const deltas = db
      .query<{ delta_json: string }, [string]>(
        `SELECT delta_json FROM transcript_live_deltas WHERE transcript_id = ? ORDER BY sequence`,
      )
      .all(row.id)
      .map((delta): LiveDelta => JSON.parse(delta.delta_json));
    const hints: SpeakerHint[] = row.speaker_hints_json
      ? JSON.parse(row.speaker_hints_json)
      : [];
    const words = withProviderSpeakers(foldDeltas(base, deltas), hints);
    const labels = speakerLabels(
      words,
      assignmentsFrom(hints, words),
      readSpeakerContext(db, row.session_id, row.owner_user_id),
    );
    if (row.ended_at_ms === null) {
      const speakers = new Map<string, TranscriptEditSpeaker>();
      for (const word of words) {
        if (word.speaker_index == null) continue;
        const key = `${word.channel}:${word.speaker_index}`;
        if (!speakers.has(key)) {
          speakers.set(key, {
            channel: word.channel,
            speaker_index: word.speaker_index,
            speaker:
              labels.get(word.id) ?? (word.channel === 0 ? "You" : "Them"),
          });
        }
      }
      return {
        status: TranscriptEditStatus.Live,
        speakers: [...speakers.values()],
      };
    }

    const lines: TranscriptEditLine[] = [];

    for (const word of words) {
      const speaker =
        labels.get(word.id) ?? (word.channel === 0 ? "You" : "Them");
      const last = lines.at(-1);
      if (
        last &&
        last.channel === word.channel &&
        last.speaker_index === (word.speaker_index ?? null) &&
        last.speaker === speaker &&
        word.start_ms - last.end_ms < 2_000
      ) {
        last.text += word.text;
        last.end_ms = word.end_ms;
        last.word_ids.push(word.id);
      } else {
        lines.push({
          start_ms: word.start_ms,
          end_ms: word.end_ms,
          text: word.text.trimStart(),
          word_ids: [word.id],
          channel: word.channel,
          speaker_index: word.speaker_index ?? null,
          speaker,
        });
      }
    }

    return { status: TranscriptEditStatus.Ready, lines };
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

export type ParticipantResolution =
  | {
      status: ParticipantResolutionStatus.Resolved;
      humanId: string;
      name: string;
    }
  | { status: ParticipantResolutionStatus.Ambiguous }
  | { status: ParticipantResolutionStatus.NotFound };

export function resolveMeetingParticipant(
  db: Database,
  sessionId: string,
  requestedName: string,
): ParticipantResolution {
  const requested = requestedName.trim().toLocaleLowerCase();
  if (!requested) return { status: ParticipantResolutionStatus.NotFound };
  const participants = db
    .query<{ human_id: string; name: string; human_name: string }, [string]>(
      `SELECT p.human_id,
              COALESCE(NULLIF(trim(p.display_name), ''), h.name) AS name,
              h.name AS human_name
       FROM session_participants p JOIN humans h ON h.id = p.human_id
       WHERE p.session_id = ? AND p.deleted_at IS NULL AND p.source <> 'excluded'
         AND h.deleted_at IS NULL AND p.human_id <> ''`,
    )
    .all(sessionId);
  const matches = new Map<string, string>();
  for (const participant of participants) {
    if (
      participant.name.trim().toLocaleLowerCase() === requested ||
      participant.human_name.trim().toLocaleLowerCase() === requested
    ) {
      matches.set(participant.human_id, participant.name.trim());
    }
  }
  if (matches.size > 1)
    return { status: ParticipantResolutionStatus.Ambiguous };
  const [humanId, name] = matches.entries().next().value ?? [];
  return humanId && name
    ? { status: ParticipantResolutionStatus.Resolved, humanId, name }
    : { status: ParticipantResolutionStatus.NotFound };
}

export type MeetingInfo = {
  sessionId: string;
  title: string | null;
  startedAt: string | null;
  endedAt: string | null;
  participants: Array<{ name: string | null; email: string | null }>;
};

export function readMeetingInfo(
  db: Database,
  sessionId: string,
): MeetingInfo | null {
  const session = db
    .query<
      {
        id: string;
        title: string | null;
        started_at: string | null;
        ended_at: string | null;
      },
      [string]
    >(`SELECT id, title, started_at, ended_at FROM sessions WHERE id = ?`)
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

export function readMeetingPointer(
  db: Database,
  options: TranscriptQuery = {},
): MeetingPointer | null {
  const status = readMeetingStatus(db, options);
  if (!status) return null;
  const row = transcriptRow(db, { ...options, sessionId: status.sessionId });
  return {
    sessionId: status.sessionId,
    transcriptId:
      status.live && row?.recording !== 1 ? null : (row?.id ?? null),
    live: status.live,
  };
}
