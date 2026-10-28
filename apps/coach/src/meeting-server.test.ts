import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import {
  type AppBridge,
  type CoachEdit,
  CoachEditKind,
  RecordingPauseAction,
} from "@anlg/assistant/app-bridge";

import { meetingTools } from "./meeting-server";
import { type Word } from "./transcript";

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

function db() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, started_at TEXT, ended_at TEXT, locked INTEGER DEFAULT 0, deleted_at TEXT);
    CREATE TABLE transcripts (
      id TEXT PRIMARY KEY, session_id TEXT, owner_user_id TEXT DEFAULT '', words_json TEXT,
      speaker_hints_json TEXT, started_at_ms INTEGER, ended_at_ms INTEGER, deleted_at TEXT
    );
    CREATE TABLE transcript_live_deltas (id TEXT, transcript_id TEXT, sequence INTEGER, delta_json TEXT, created_at TEXT);
    CREATE TABLE session_participants (
      id TEXT, session_id TEXT, human_id TEXT, display_name TEXT, email TEXT, created_at TEXT, deleted_at TEXT, source TEXT DEFAULT ''
    );
    CREATE TABLE humans (id TEXT PRIMARY KEY, name TEXT, email TEXT, deleted_at TEXT);
  `);
  return database;
}

describe("transcript edit context tool", () => {
  test("is read-only and returns stable word references for a finalized transcript", async () => {
    const database = db();
    database.run(
      `INSERT INTO sessions (id, title, started_at, ended_at) VALUES ('s1', 'Kickoff', NULL, NULL)`,
    );
    database.run(
      `INSERT INTO transcripts VALUES ('t1', 's1', 'me', ?, '[]', 0, 1000, NULL)`,
      [JSON.stringify([word("w1", " Hello", 0)])],
    );
    const entry = meetingTools(database, () => "s1").find(
      (item) => item.name === "transcript_edit_context",
    );

    expect(entry?.options?.annotations.readOnlyHint).toBe(true);
    expect(await entry?.handler({})).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: "ready",
              lines: [
                {
                  start_ms: 0,
                  end_ms: 300,
                  text: "Hello",
                  word_ids: ["w1"],
                  channel: 1,
                  speaker_index: null,
                  speaker: "Them",
                },
              ],
            },
            null,
            2,
          ),
        },
      ],
    });
  });
});

describe("explicit transcript edit tools", () => {
  function edit(
    kind: CoachEditKind.AssignSpeaker | CoachEditKind.CorrectTranscript,
  ): CoachEdit {
    return {
      id: "edit-1",
      session_id: "s1",
      kind,
      summary: "Changed transcript",
      task_id: null,
      target_id: null,
    };
  }

  function appEdits(calls: unknown[]) {
    const bridge = {
      assignTranscriptSpeaker: async (...args: unknown[]) => {
        calls.push(["speaker", ...args]);
        return edit(CoachEditKind.AssignSpeaker);
      },
      correctTranscript: async (...args: unknown[]) => {
        calls.push(["correction", ...args]);
        return edit(CoachEditKind.CorrectTranscript);
      },
    } as unknown as AppBridge;
    return { bridge, onEdit: () => {}, onUndo: () => {} };
  }

  test("names only a unique current participant and refuses ambiguous or absent people", async () => {
    const database = db();
    database.run(
      `INSERT INTO sessions (id, title, started_at, ended_at) VALUES ('s1', 'Kickoff', NULL, NULL)`,
    );
    database.run(
      `INSERT INTO humans (id, name, email) VALUES ('sara-1', 'Sara', ''), ('sara-2', 'Sara', ''), ('omar', 'Omar', '')`,
    );
    database.run(
      `INSERT INTO session_participants (id, session_id, human_id, created_at) VALUES ('p1', 's1', 'sara-1', '1')`,
    );
    database.run(
      `INSERT INTO transcripts (id, session_id, owner_user_id, words_json, speaker_hints_json, started_at_ms, ended_at_ms, deleted_at) VALUES
      ('t1', 's1', 'me', ?, '[]', 1, NULL, NULL)`,
      [JSON.stringify([{ ...word("w1", " hello", 0), speaker_index: 2 }])],
    );
    const calls: unknown[] = [];
    const tools = meetingTools(database, () => "s1", appEdits(calls));
    const assign = tools.find((entry) => entry.name === "assign_speaker");
    expect(assign?.description).toContain("only when the user explicitly asks");
    expect(assign?.description).toContain("Never create a person");

    const allowed = await assign?.handler({
      channel: 1,
      speaker_index: 2,
      person_name: "Sara",
    });
    expect(allowed?.isError).toBeUndefined();
    expect(calls).toEqual([
      ["speaker", "s1", { channel: 1, speaker_index: 2, human_id: "sara-1" }],
    ]);

    database.run(
      `INSERT INTO session_participants (id, session_id, human_id, created_at) VALUES ('p2', 's1', 'sara-2', '2')`,
    );
    const ambiguous = await assign?.handler({
      channel: 1,
      speaker_index: 2,
      person_name: "Sara",
    });
    expect(ambiguous?.isError).toBe(true);
    const absent = await assign?.handler({
      channel: 1,
      speaker_index: 2,
      person_name: "Omar",
    });
    expect(absent?.isError).toBe(true);
    expect(calls).toHaveLength(1);
  });

  test("correction refuses live words and writes only from finalized transcript context", async () => {
    const database = db();
    database.run(
      `INSERT INTO sessions (id, title, started_at, ended_at) VALUES ('s1', 'Kickoff', NULL, NULL)`,
    );
    database.run(
      `INSERT INTO transcripts (id, session_id, owner_user_id, words_json, speaker_hints_json, started_at_ms, ended_at_ms, deleted_at) VALUES
      ('t1', 's1', 'me', ?, '[]', 1, NULL, NULL)`,
      [JSON.stringify([word("w1", " We", 0), word("w2", " ship", 300)])],
    );
    const calls: unknown[] = [];
    const correct = meetingTools(database, () => "s1", appEdits(calls)).find(
      (entry) => entry.name === "correct_transcript",
    );
    expect(correct?.description).toContain("only after this meeting has ended");
    const live = await correct?.handler({
      word_ids: ["w1", "w2"],
      expected_text: "We ship",
      replacement: "We go",
    });
    expect(live?.isError).toBe(true);
    expect(calls).toEqual([]);

    database.run(`UPDATE transcripts SET ended_at_ms = 2000 WHERE id = 't1'`);
    const ended = await correct?.handler({
      word_ids: ["w1", "w2"],
      expected_text: "We ship",
      replacement: "We go",
    });
    expect(ended?.isError).toBeUndefined();
    expect(calls).toEqual([
      [
        "correction",
        "s1",
        {
          word_ids: ["w1", "w2"],
          expected_text: "We ship",
          replacement: "We go",
        },
      ],
    ]);
  });
});

test("stop recording targets the attached meeting and cannot stop another meeting from an old chat", async () => {
  const database = db();
  database.exec(
    "INSERT INTO sessions (id, title) VALUES ('live', 'Live'), ('old', 'Old')",
  );
  let selected: string | undefined = "old";
  let active = "live";
  const bridge = {
    stopRecording: async (sessionId: string) => {
      if (sessionId !== active)
        throw new Error("This meeting is not recording");
      active = "";
      return { stopped: true };
    },
  } as unknown as AppBridge;
  const entry = meetingTools(database, () => selected, {
    bridge,
    onEdit() {},
    onUndo() {},
  }).find((item) => item.name === "stop_recording");
  expect(entry).toBeDefined();
  expect((await entry!.handler({})).isError).toBe(true);
  expect(active).toBe("live");
  selected = "live";
  const result = await entry!.handler({});
  expect(
    result.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(""),
  ).toContain("Recording stopped");
  expect(active).toBe("");
  selected = undefined;
  expect((await entry!.handler({})).isError).toBe(true);
  database.close();
});

test("pause and resume keep the selected meeting open and reject an older chat", async () => {
  const database = db();
  database.exec(
    "INSERT INTO sessions (id, title) VALUES ('live', 'Live'), ('old', 'Old')",
  );
  let selected = "live";
  let paused = false;
  const bridge = {
    setRecordingPaused: async (
      sessionId: string,
      action: RecordingPauseAction,
    ) => {
      if (sessionId !== "live")
        throw new Error("This meeting is not open for recording");
      paused = action === RecordingPauseAction.Pause;
      return { paused };
    },
  } as unknown as AppBridge;
  const tools = meetingTools(database, () => selected, {
    bridge,
    onEdit() {},
    onUndo() {},
  });
  const pause = tools.find((entry) => entry.name === "pause_recording")!;
  const resume = tools.find((entry) => entry.name === "resume_recording")!;
  expect(
    (await pause.handler({})).content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(""),
  ).toContain("Recording paused");
  expect(paused).toBe(true);
  selected = "old";
  expect((await resume.handler({})).isError).toBe(true);
  expect(paused).toBe(true);
  selected = "live";
  expect(
    (await resume.handler({})).content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(""),
  ).toContain("Recording resumed");
  expect(paused).toBe(false);
  database.close();
});

test("browser context returns images only when requested and honors locked meeting access", async () => {
  const database = db();
  database.exec("INSERT INTO sessions (id, title) VALUES ('live', 'Live')");
  const bridge = {
    browserContext: async () => ({
      meeting_url: "https://meet.google.com/abc-defg-hij",
      sequence: 1,
      context: {
        title: "Demo",
        participants: [],
        events: [],
        captions: "available",
        chat: "unavailable",
        presentation: { timestamp_ms: 1000, jpeg_base64: "image-data" },
      },
    }),
  } as unknown as AppBridge;
  const entry = meetingTools(database, () => "live", {
    bridge,
    onEdit() {},
    onUndo() {},
  }).find((item) => item.name === "browser_meeting_context")!;
  const withImage = await entry.handler({ include_presentation: true });
  expect(withImage.content).toContainEqual({
    type: "image",
    mimeType: "image/jpeg",
    data: "image-data",
  });
  const withoutImage = await entry.handler({});
  expect(withoutImage.content).toHaveLength(1);
  expect(withoutImage.content[0]).toMatchObject({
    type: "text",
    text: expect.stringContaining('"title":"Demo"'),
  });
  expect(JSON.stringify(withoutImage)).not.toContain("image-data");
  database.exec("UPDATE sessions SET locked = 1 WHERE id = 'live'");
  const locked = await entry.handler({ include_presentation: true });
  expect(locked.isError).toBe(true);
  expect(JSON.stringify(locked)).not.toContain("image-data");
  database.close();
});
