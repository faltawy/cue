import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { meetingChange, meetingPointer } from "@anlg/assistant/meeting-state";

import { appDb, seedNote } from "./fixtures/app-db";
import {
  foldDeltas,
  type LiveDelta,
  ParticipantResolutionStatus,
  readLiveTranscript,
  readMeetingInfo,
  readMeetingStatus,
  readMeetingPointer,
  readSelfName,
  readTranscriptEditContext,
  renderTranscript,
  resolveMeetingParticipant,
  toLines,
  TranscriptEditStatus,
  type Word,
} from "./transcript";

const noLabels = new Map<string, string>();

const word = (
  id: string,
  text: string,
  start_ms: number,
  channel = 1,
): Word => ({
  id,
  text,
  start_ms,
  end_ms: start_ms + 300,
  channel,
});

function schema() {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY NOT NULL, title TEXT, started_at TEXT, ended_at TEXT
  )`);
  db.run(`CREATE TABLE transcripts (
    id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL DEFAULT '', owner_user_id TEXT NOT NULL DEFAULT '',
    started_at_ms INTEGER NOT NULL DEFAULT 0, ended_at_ms INTEGER,
    words_json TEXT NOT NULL DEFAULT '[]', speaker_hints_json TEXT NOT NULL DEFAULT '[]', deleted_at TEXT
  )`);
  db.run(`CREATE TABLE transcript_live_deltas (
    id TEXT PRIMARY KEY, transcript_id TEXT NOT NULL, sequence INTEGER NOT NULL, delta_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  db.run(`CREATE TABLE session_participants (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, human_id TEXT NOT NULL DEFAULT '', display_name TEXT, email TEXT,
    created_at TEXT NOT NULL DEFAULT '', deleted_at TEXT, source TEXT NOT NULL DEFAULT ''
  )`);
  db.run(`CREATE TABLE humans (
    id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', deleted_at TEXT
  )`);
  return db;
}

function delta(
  new_words: Word[],
  replaced_ids: string[] = [],
  partials: LiveDelta["partials"] = [],
): string {
  return JSON.stringify({ new_words, replaced_ids, partials });
}

describe("foldDeltas", () => {
  test("applies deltas in order: replacements drop words, re-sent ids replace, result stays time-ordered", () => {
    const base = [word("a", " hello", 0), word("b", " wrold", 400)];
    const folded = foldDeltas(base, [
      { new_words: [word("c", " world", 400)], replaced_ids: ["b"] },
      {
        new_words: [word("a", " Hello", 0), word("d", " again", 800)],
        replaced_ids: [],
      },
    ]);
    expect(folded.map((w) => w.text)).toEqual([" Hello", " world", " again"]);
  });
});

describe("toLines", () => {
  test("renders multilingual speech with its timestamp and named speaker", () => {
    const transcript = {
      sessionId: "s1",
      transcriptId: "t1",
      title: "Planning",
      live: false,
      startedAtMs: 0,
      endedAtMs: 70_000,
      lines: toLines(
        [word("ar-1", " الاجتماع يبدأ الآن", 65_000)],
        new Map([["ar-1", "ليلى"]]),
      ),
      pending: "",
    };

    expect(renderTranscript(transcript)).toContain(
      "[01:05] ليلى: الاجتماع يبدأ الآن",
    );
  });

  test("groups consecutive words per speaker and splits on speaker change or a 2s pause", () => {
    const lines = toLines(
      [
        word("1", " What's", 0, 1),
        word("2", " the", 300, 1),
        word("3", " ETA?", 600, 1),
        word("4", " Next", 1_000, 0),
        word("5", " week.", 1_300, 0),
        word("6", " Thanks.", 5_000, 0),
      ],
      noLabels,
    );
    expect(lines).toEqual([
      {
        speaker: "Them",
        channel: 1,
        start_ms: 0,
        end_ms: 900,
        text: "What's the ETA?",
      },
      {
        speaker: "You",
        channel: 0,
        start_ms: 1_000,
        end_ms: 1_600,
        text: "Next week.",
      },
      {
        speaker: "You",
        channel: 0,
        start_ms: 5_000,
        end_ms: 5_300,
        text: "Thanks.",
      },
    ]);
  });

  test("since_ms keeps only speech that ends after the offset", () => {
    const lines = toLines(
      [word("1", " old", 0), word("2", " new", 10_000)],
      noLabels,
      5_000,
    );
    expect(lines.map((line) => line.text)).toEqual(["new"]);
  });
});

describe("readLiveTranscript", () => {
  test("prefers the live transcript and folds its pending deltas over the stored words", () => {
    const db = schema();
    db.run(
      `INSERT INTO sessions VALUES ('s-old', 'Old call', NULL, NULL), ('s-live', 'Pricing sync', NULL, NULL)`,
    );
    db.run(
      `INSERT INTO transcripts (id, session_id, started_at_ms, ended_at_ms, words_json) VALUES
       ('t-old', 's-old', 2000, 3000, ?), ('t-live', 's-live', 1000, NULL, ?)`,
      [
        JSON.stringify([word("o", " finished", 0)]),
        JSON.stringify([word("a", " What's", 0)]),
      ],
    );
    db.run(
      `INSERT INTO transcript_live_deltas (id, transcript_id, sequence, delta_json) VALUES ('d2', 't-live', 2, ?), ('d1', 't-live', 1, ?)`,
      [
        delta(
          [word("c", " ETA?", 600)],
          [],
          [{ text: " for", start_ms: 900, end_ms: 1_000, channel: 1 }],
        ),
        delta([word("b", " the", 300)]),
      ],
    );

    const transcript = readLiveTranscript(db);

    expect(transcript?.sessionId).toBe("s-live");
    expect(transcript?.live).toBe(true);
    expect(transcript?.lines.map((line) => line.text)).toEqual([
      "What's the ETA?",
    ]);
    expect(transcript && renderTranscript(transcript)).toBe(
      "Meeting: Pricing sync (recording)\n[00:00] Them: What's the ETA?\n(still being spoken: for)",
    );
  });

  test("reads a named ended session, ignoring deleted transcripts", () => {
    const db = schema();
    db.run(`INSERT INTO sessions VALUES ('s1', 'Kickoff', NULL, NULL)`);
    db.run(
      `INSERT INTO transcripts (id, session_id, started_at_ms, ended_at_ms, words_json, deleted_at) VALUES
       ('t-deleted', 's1', 5000, 6000, ?, '2026-01-01'), ('t1', 's1', 1000, 2000, ?, NULL)`,
      [
        JSON.stringify([word("x", " gone", 0)]),
        JSON.stringify([word("y", " kept", 0, 0)]),
      ],
    );

    const transcript = readLiveTranscript(db, { sessionId: "s1" });

    expect(transcript?.transcriptId).toBe("t1");
    expect(transcript?.live).toBe(false);
    expect(transcript?.lines).toEqual([
      { speaker: "You", channel: 0, start_ms: 0, end_ms: 300, text: "kept" },
    ]);
  });
});

describe("a recording left open by a crash", () => {
  const NOW = Date.parse("2026-10-20T12:00:00.000Z");
  const ZOMBIE_START = Date.parse("2026-10-18T21:37:00.000Z");
  const REAL_START = Date.parse("2026-10-20T11:00:00.000Z");

  async function zombieAndRealMeeting() {
    const db = await appDb();
    seedNote(db, { id: "s-zombie", title: "" });
    seedNote(db, { id: "s-real", title: "Pricing sync" });
    db.run(
      `INSERT INTO transcripts (id, session_id, owner_user_id, started_at_ms, ended_at_ms, words_json) VALUES
       ('t-zombie', 's-zombie', 'me', ?, NULL, ?), ('t-real', 's-real', 'me', ?, NULL, ?)`,
      [
        ZOMBIE_START,
        JSON.stringify([word("z", " hello", 0)]),
        REAL_START,
        JSON.stringify([word("a", " What's", 0)]),
      ],
    );
    db.run(
      `INSERT INTO transcript_live_state (transcript_id) VALUES ('t-zombie'), ('t-real')`,
    );
    db.run(
      `INSERT INTO transcript_live_deltas (id, transcript_id, sequence, delta_json, created_at) VALUES
       ('dz', 't-zombie', 0, ?, '2026-10-18T21:40:00.000Z'), ('dr', 't-real', 0, ?, '2026-10-20T11:59:30.000Z')`,
      [delta([word("y", " there", 300)]), delta([word("b", " the ETA?", 300)])],
    );
    return db;
  }

  test("connects the active meeting before its first transcript without reopening an older meeting", async () => {
    const db = await zombieAndRealMeeting();
    seedNote(db, { id: "s-new", title: "New meeting" });
    const recording = new Set(["s-new"]);
    expect(
      readLiveTranscript(db, { sessionId: "s-real", recording })?.lines[0]
        ?.text,
    ).toBe("What's the ETA?");
    expect(readLiveTranscript(db, { recording })).toBeNull();
    expect(readMeetingPointer(db, { recording })).toEqual({
      sessionId: "s-new",
      transcriptId: null,
      live: true,
    });
    expect(readMeetingStatus(db, { recording })).toEqual({
      sessionId: "s-new",
      title: "New meeting",
      live: true,
      startedAtMs: null,
      endedAtMs: null,
    });
    db.run(
      "INSERT INTO transcripts (id,session_id,owner_user_id,started_at_ms,ended_at_ms) VALUES ('t-previous','s-new','me',?,?)",
      [NOW - 5000, NOW - 1000],
    );
    expect(readMeetingPointer(db, { recording })).toEqual({
      sessionId: "s-new",
      transcriptId: null,
      live: true,
    });
    db.run(
      "INSERT INTO transcripts (id,session_id,owner_user_id,started_at_ms) VALUES ('t-new','s-new','me',?)",
      [NOW],
    );
    const next = readMeetingPointer(db, { recording });
    expect(next).toEqual({
      sessionId: "s-new",
      transcriptId: "t-new",
      live: true,
    });
    expect(
      meetingChange(
        { sessionId: "s-new", transcriptId: null, live: true },
        next,
        new Set(),
      ),
    ).toEqual({ newChat: false, wrapUp: false });
  });

  test("the meeting the user just stopped gets its wrap-up and the zombie never opens a chat", async () => {
    const db = await zombieAndRealMeeting();
    const wrapped = new Set<string>();

    const recording = readLiveTranscript(db, {
      recording: new Set(["s-real"]),
      nowMs: NOW,
    });
    const attached = meetingPointer(recording);
    expect(attached).toEqual({
      sessionId: "s-real",
      transcriptId: "t-real",
      live: true,
    });

    db.run(`UPDATE transcripts SET ended_at_ms = ? WHERE id = 't-real'`, [NOW]);
    const stopped = readLiveTranscript(db, {
      recording: new Set(),
      nowMs: NOW + 1_000,
    });
    const change = meetingChange(attached, meetingPointer(stopped), wrapped);

    expect(stopped?.transcriptId).toBe("t-real");
    expect(change).toEqual({ newChat: false, wrapUp: true });
    expect(stopped?.lines.map((line) => line.text)).toEqual([
      "What's the ETA?",
    ]);
  });

  test("with no word from the app, only an open transcript with recent speech counts as recording", async () => {
    const db = await zombieAndRealMeeting();

    const live = readLiveTranscript(db, { nowMs: NOW });
    const zombie = readLiveTranscript(db, {
      sessionId: "s-zombie",
      nowMs: NOW,
    });
    const later = readLiveTranscript(db, {
      sessionId: "s-real",
      nowMs: NOW + 10 * 60_000,
    });

    expect(meetingPointer(live)).toEqual({
      sessionId: "s-real",
      transcriptId: "t-real",
      live: true,
    });
    expect(zombie?.transcriptId).toBe("t-zombie");
    expect(zombie?.live).toBe(false);
    expect(later?.live).toBe(false);
  });

  test("a chat about one meeting can tell which other meeting the app is recording", async () => {
    const db = await zombieAndRealMeeting();
    const recording = new Set(["s-real"]);

    expect(
      readMeetingStatus(db, { sessionId: "s-zombie", recording, nowMs: NOW }),
    ).toEqual({
      sessionId: "s-zombie",
      title: "",
      live: false,
      startedAtMs: ZOMBIE_START,
      endedAtMs: null,
    });
    expect(readMeetingStatus(db, { recording, nowMs: NOW })).toEqual({
      sessionId: "s-real",
      title: "Pricing sync",
      live: true,
      startedAtMs: REAL_START,
      endedAtMs: null,
    });
  });
});

describe("readTranscriptEditContext", () => {
  test("returns finalized word ids after folding replacement deltas and only speaker coordinates while live", () => {
    const db = schema();
    db.run(
      `INSERT INTO sessions VALUES ('s1', 'Kickoff', NULL, NULL), ('s2', 'Live', NULL, NULL)`,
    );
    db.run(
      `INSERT INTO transcripts (id, session_id, started_at_ms, ended_at_ms, words_json) VALUES
       ('t1', 's1', 1000, 2000, ?), ('t2', 's2', 1000, NULL, ?)`,
      [
        JSON.stringify([word("old", " old", 0), word("keep", " text", 400)]),
        JSON.stringify([{ ...word("live", " live", 0), speaker_index: 2 }]),
      ],
    );
    db.run(
      `INSERT INTO transcript_live_deltas (id, transcript_id, sequence, delta_json) VALUES
       ('d1', 't1', 1, ?), ('d2', 't2', 1, ?)`,
      [
        delta([word("current", " corrected", 0, 1)], ["old"]),
        delta([word("new", " words", 400)]),
      ],
    );

    expect(readTranscriptEditContext(db, "s1")).toEqual({
      status: TranscriptEditStatus.Ready,
      lines: [
        {
          start_ms: 0,
          end_ms: 700,
          text: "corrected text",
          word_ids: ["current", "keep"],
          channel: 1,
          speaker_index: null,
          speaker: "Them",
        },
      ],
    });
    expect(readTranscriptEditContext(db, "s2")).toEqual({
      status: TranscriptEditStatus.Live,
      speakers: [{ channel: 1, speaker_index: 2, speaker: "Speaker 3" }],
    });
  });
});

describe("resolveMeetingParticipant", () => {
  test("resolves only a unique current participant and rejects ambiguous or absent people", () => {
    const db = schema();
    db.run(`INSERT INTO sessions VALUES ('s1', 'Kickoff', NULL, NULL)`);
    db.run(
      `INSERT INTO humans (id, name) VALUES ('ada', 'Ada'), ('sara-1', 'Sara'), ('sara-2', 'Sara'), ('omar', 'Omar')`,
    );
    db.run(
      `INSERT INTO session_participants (id, session_id, human_id, display_name, created_at, deleted_at) VALUES
       ('p1', 's1', 'ada', '', '1', NULL), ('p2', 's1', 'sara-1', 'Sara', '2', NULL),
       ('p3', 's1', 'sara-2', 'Sara', '3', NULL), ('p4', 's1', 'omar', '', '4', 'deleted')`,
    );

    expect(
      readMeetingInfo(db, "s1")?.participants.map((person) => person.name),
    ).toEqual(["Ada", "Sara", "Sara"]);
    expect(resolveMeetingParticipant(db, "s1", " ada ")).toEqual({
      status: ParticipantResolutionStatus.Resolved,
      humanId: "ada",
      name: "Ada",
    });
    expect(resolveMeetingParticipant(db, "s1", "Sara")).toEqual({
      status: ParticipantResolutionStatus.Ambiguous,
    });
    expect(resolveMeetingParticipant(db, "s1", "Omar")).toEqual({
      status: ParticipantResolutionStatus.NotFound,
    });
  });
});

describe("readMeetingInfo", () => {
  test("returns title and non-deleted participants", () => {
    const db = schema();
    db.run(
      `INSERT INTO sessions VALUES ('s1', 'Kickoff', '2026-10-18T10:00:00Z', NULL)`,
    );
    db.run(
      `INSERT INTO session_participants (id, session_id, display_name, email, created_at, deleted_at) VALUES
       ('p1', 's1', 'Dana', 'dana@example.com', '1', NULL), ('p2', 's1', 'Removed', NULL, '2', 'x')`,
    );

    expect(readMeetingInfo(db, "s1")).toEqual({
      sessionId: "s1",
      title: "Kickoff",
      startedAt: "2026-10-18T10:00:00Z",
      endedAt: null,
      participants: [{ name: "Dana", email: "dana@example.com" }],
    });
  });
});

describe("readSelfName", () => {
  test("is the meeting owner's name from Your name, not another human's; blank means none", () => {
    const db = schema();
    db.run(
      `INSERT INTO humans (id, name) VALUES ('me', ' Ahmad Falta '), ('omar', 'Omar'), ('blank', '  ')`,
    );
    db.run(
      `INSERT INTO transcripts (id, session_id, owner_user_id, started_at_ms) VALUES
       ('t1', 's1', 'me', 1000), ('t2', 's2', 'blank', 1000)`,
    );

    expect(readSelfName(db, "s1")).toBe("Ahmad Falta");
    expect(readSelfName(db, "s2")).toBeNull();
    expect(readSelfName(db, "missing")).toBeNull();
  });
});
