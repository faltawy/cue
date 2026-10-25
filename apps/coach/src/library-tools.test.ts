import { type Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { z } from "zod";

import { appBridge, type CoachEdit, CoachEditKind } from "./app-bridge";
import { appDb, seedNote } from "./fixtures/app-db";
import { libraryTools } from "./library-tools";

let db: Database;

beforeEach(async () => {
  db = await appDb();
  seedNote(db, {
    id: "pricing",
    title: "Lumen pricing",
    body: ["Annual billing"],
  });
  seedNote(db, {
    id: "secret",
    title: "Board prep",
    locked: true,
    body: ["Private"],
  });
});

const edit = (kind: CoachEdit["kind"], summary: string): CoachEdit => ({
  id: `edit-${kind}`,
  session_id: "meeting",
  kind,
  summary,
  task_id: null,
  target_id: "target",
});

function withEdits() {
  const edits: CoachEdit[] = [];
  const bridge = {
    ...appBridge("http://127.0.0.1:9", "unused"),
    createNote: mock(async () => ({
      edit: edit(CoachEditKind.CreateNote, "Created note “Pricing follow-up”"),
      id: "n1",
      message: "Created note “Pricing follow-up”",
    })),
    updateNote: mock(async () => ({
      edit: edit(CoachEditKind.UpdateNote, "Renamed “A” to “B”"),
      id: "pricing",
      message: "Renamed “A” to “B”",
    })),
    createFolder: mock(async () => ({
      edit: null,
      id: "f1",
      message: "The folder Clients already exists",
    })),
    addParticipant: mock(async () => ({
      edit: edit(CoachEditKind.AddParticipant, "Added Sara to this meeting"),
      id: "p1",
      message: "Added Sara to this meeting",
    })),
  };
  const tools = libraryTools(db, () => "meeting", {
    bridge,
    onEdit: (change) => edits.push(change),
    onUndo: () => {},
  });
  const find = (name: string) => {
    const found = tools.find((entry) => entry.name === name);
    if (!found) throw new Error(`no tool ${name}`);
    return found;
  };
  const run = (name: string, input: Record<string, unknown>) =>
    find(name).handler(input as never, {});
  const valid = (name: string, input: Record<string, unknown>) =>
    z.object(find(name).inputSchema).safeParse(input).success;
  return { tools, bridge, edits, run, valid };
}

const textOf = (result: { content: Array<{ type: string; text?: string }> }) =>
  result.content.map((part) => part.text).join("");

describe("library tools", () => {
  test("read tools are always there; changes only with the app connected, and nothing deletes", () => {
    const readOnly = libraryTools(db, () => "meeting").map(
      (entry) => entry.name,
    );
    const all = withEdits().tools.map((entry) => entry.name);

    expect(readOnly).toEqual([
      "search_meetings",
      "get_meeting",
      "list_folders",
      "list_tags",
      "search_people",
      "list_templates",
      "list_action_items",
    ]);
    expect(all).toEqual([
      ...readOnly,
      "create_note",
      "update_note_details",
      "create_folder",
      "upsert_person",
      "upsert_organization",
      "add_participant",
      "upsert_template",
    ]);
    expect(
      all.filter((name) => /delete|remove|trash|archive|purge/.test(name)),
    ).toEqual([]);
    expect(
      Object.keys(appBridge("http://x", "t")).filter((name) =>
        /delete|remove|trash|archive|purge/i.test(name),
      ),
    ).toEqual([]);
  });

  test("inputs are validated: limits, dates, ids, include and folder paths", () => {
    const { valid } = withEdits();

    expect(valid("search_meetings", { query: "pricing", limit: 20 })).toBe(
      true,
    );
    expect(valid("search_meetings", { limit: 21 })).toBe(false);
    expect(valid("search_meetings", { from: "10/01/2026" })).toBe(false);
    expect(valid("get_meeting", { id: "pricing", include: "notes" })).toBe(
      true,
    );
    expect(valid("get_meeting", { id: "", include: "notes" })).toBe(false);
    expect(valid("get_meeting", { id: "pricing", include: "audio" })).toBe(
      false,
    );
    expect(
      valid("get_meeting", {
        id: "pricing",
        include: "both",
        max_chars: 50_000,
      }),
    ).toBe(false);
    expect(valid("create_note", { title: "Pricing" })).toBe(true);
    expect(valid("create_note", { title: "" })).toBe(false);
    expect(valid("create_folder", { path: "Clients/Lumen" })).toBe(true);
    expect(valid("create_folder", { path: "" })).toBe(false);
    expect(
      valid("update_note_details", { note_id: "pricing", add_tags: ["x"] }),
    ).toBe(true);
    expect(
      valid("update_note_details", { note_id: "pricing", add_tags: [""] }),
    ).toBe(false);
    expect(
      valid("upsert_person", { name: "Sara", email: "not-an-email" }),
    ).toBe(false);
    expect(
      valid("upsert_template", {
        title: "Discovery",
        sections: [{ title: "Pain" }],
      }),
    ).toBe(false);
  });

  test("an update with nothing to change is refused before reaching the app", async () => {
    const { run, bridge } = withEdits();

    const result = await run("update_note_details", { note_id: "pricing" });

    expect(result.isError).toBe(true);
    expect(bridge.updateNote).not.toHaveBeenCalled();
  });

  test("changes reach the app with their payloads and land in the timeline; a no-op does not", async () => {
    const { run, bridge, edits } = withEdits();

    const created = await run("create_note", {
      title: "Pricing follow-up",
      folder: "Clients/Lumen",
      content_markdown: "- send the sheet",
    });
    await run("update_note_details", {
      note_id: "pricing",
      title: "B",
      add_tags: ["pricing"],
      remove_tags: ["draft"],
    });
    const folder = await run("create_folder", { path: "Clients" });
    await run("add_participant", { person_id: "sara" });

    expect(bridge.createNote).toHaveBeenCalledWith("meeting", {
      title: "Pricing follow-up",
      folder: "Clients/Lumen",
      content_markdown: "- send the sheet",
    });
    expect(bridge.updateNote).toHaveBeenCalledWith("meeting", "pricing", {
      title: "B",
      add_tags: ["pricing"],
      remove_tags: ["draft"],
    });
    expect(bridge.createFolder).toHaveBeenCalledWith("meeting", "Clients");
    expect(bridge.addParticipant).toHaveBeenCalledWith("meeting", {
      person_id: "sara",
    });
    expect(textOf(created)).toBe("Created note “Pricing follow-up” (id n1)");
    expect(textOf(folder)).toBe("The folder Clients already exists (id f1)");
    expect(edits.map((change) => change.kind)).toEqual([
      CoachEditKind.CreateNote,
      CoachEditKind.UpdateNote,
      CoachEditKind.AddParticipant,
    ]);
  });

  test("get_meeting refuses a locked note and reads an unlocked one", async () => {
    const { run } = withEdits();

    const locked = await run("get_meeting", { id: "secret", include: "notes" });
    const open = await run("get_meeting", { id: "pricing", include: "notes" });

    expect(locked.isError).toBe(true);
    expect(textOf(locked)).not.toContain("Private");
    expect(textOf(locked)).toContain("locked");
    expect(open.isError).toBeUndefined();
    expect(textOf(open)).toContain("Annual billing");
  });
});
