import { expect, test } from "bun:test";

import { appDb, seedNote, seedTranscript } from "./fixtures/app-db";
import { meetingTools } from "./meeting-server";

test("library tools use an explicit searched note and never fall back to the latest recording", async () => {
  const db = await appDb();
  try {
    seedNote(db, { id: "first", title: "First", body: ["First notes"] });
    seedNote(db, { id: "second", title: "Second", body: ["Second notes"] });
    seedTranscript(db, "second", [
      { text: "Second transcript", start_ms: 0, channel: 0 },
    ]);
    const tools = meetingTools(db, () => "first");
    const notes = tools.find((tool) => tool.name === "meeting_notes")!;
    expect(
      JSON.stringify(await notes.handler({ note_id: "second" })),
    ).toContain("Second notes");
    const detached = meetingTools(db, () => undefined).find(
      (tool) => tool.name === "live_transcript",
    )!;
    expect(
      JSON.stringify(await detached.handler({ note_id: "second" })),
    ).toContain("Second transcript");
    const missing = await detached.handler({});
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing)).not.toContain("Second transcript");
  } finally {
    db.close();
  }
});

test("locking the selected note prevents every content tool from disclosing it", async () => {
  const db = await appDb();
  try {
    seedNote(db, {
      id: "private",
      title: "Planning",
      body: ["Private forecast"],
    });
    seedTranscript(db, "private", [
      { text: "Private forecast", start_ms: 0, channel: 0 },
    ]);
    const tools = meetingTools(db, () => "private").filter((tool) =>
      ["meeting_notes", "live_transcript", "transcript_edit_context"].includes(
        tool.name,
      ),
    );
    for (const tool of tools)
      expect(JSON.stringify(await tool.handler({}))).toContain(
        "Private forecast",
      );
    db.run("UPDATE sessions SET locked = 1 WHERE id = 'private'");
    for (const tool of tools) {
      const result = await tool.handler({});
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain("Private forecast");
    }
  } finally {
    db.close();
  }
});
