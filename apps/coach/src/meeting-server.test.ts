import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { meetingTools } from "./meeting-server";
import type { Word } from "./transcript";

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
    CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT, started_at TEXT, ended_at TEXT);
    CREATE TABLE transcripts (
      id TEXT PRIMARY KEY, session_id TEXT, owner_user_id TEXT DEFAULT '', words_json TEXT,
      speaker_hints_json TEXT, started_at_ms INTEGER, ended_at_ms INTEGER, deleted_at TEXT
    );
    CREATE TABLE transcript_live_deltas (id TEXT, transcript_id TEXT, sequence INTEGER, delta_json TEXT, created_at TEXT);
    CREATE TABLE session_participants (
      id TEXT, session_id TEXT, human_id TEXT, display_name TEXT, email TEXT, created_at TEXT, deleted_at TEXT
    );
    CREATE TABLE humans (id TEXT PRIMARY KEY, name TEXT, email TEXT, deleted_at TEXT);
  `);
  return database;
}

describe("transcript edit context tool", () => {
  test("is read-only and returns stable word references for a finalized transcript", async () => {
    const database = db();
    database.run(`INSERT INTO sessions VALUES ('s1', 'Kickoff', NULL, NULL)`);
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
