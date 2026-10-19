import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";

import { appDb, seedNote, seedParticipant, seedPerson, seedTag, seedTranscript } from "./fixtures/app-db";
import {
  getMeeting,
  listActionItems,
  listFolders,
  listTags,
  listTemplates,
  LockedNoteError,
  searchMeetings,
  searchPeople,
} from "./library";

let db: Database;

beforeEach(async () => {
  db = await appDb();
  seedPerson(db, { id: "me", name: "Falta" });
  db.run(`INSERT INTO organizations (id, name) VALUES ('org-lumen', 'Lumen')`);
  seedPerson(db, { id: "sara", name: "Sara Haddad", email: "sara@lumen.test", organization: "org-lumen", title: "CFO" });
  seedNote(db, {
    id: "pricing",
    title: "Lumen pricing",
    folder: "Clients/Lumen",
    startedAt: "2026-10-10T10:00:00.000Z",
    body: ["Decided annual billing at 40 seats", "Sara wants a discount"],
  });
  seedParticipant(db, "pricing", "sara");
  seedParticipant(db, "pricing", "me");
  seedTag(db, "pricing", "pricing");
  seedTranscript(db, "pricing", [
    { text: " Can we do annual?", start_ms: 0, channel: 1 },
    { text: " Yes, at forty seats.", start_ms: 4_000, channel: 0 },
  ]);
  seedNote(db, { id: "standup", title: "Standup", folder: "Team", startedAt: "2026-09-01T09:00:00.000Z", body: ["Nothing on billing"] });
  seedNote(db, {
    id: "secret",
    title: "Board prep",
    startedAt: "2026-10-12T09:00:00.000Z",
    locked: true,
    body: ["Decided annual billing for the board"],
  });
  seedParticipant(db, "secret", "sara");
});

describe("searchMeetings", () => {
  test("matches note content and title and returns id, title, date, folder, participants and a snippet", () => {
    const hits = searchMeetings(db, { query: "annual billing", limit: 10 });

    expect(hits.map((hit) => hit.id)).toEqual(["pricing"]);
    expect(hits[0]).toEqual({
      id: "pricing",
      title: "Lumen pricing",
      date: "2026-10-10T10:00:00.000Z",
      folder: "Clients/Lumen",
      participants: ["Sara Haddad"],
      snippet: "Decided annual billing at 40 seats\nSara wants a discount",
      locked: false,
    });
  });

  test("a locked note is found by its title only and never shows its content", () => {
    const byTitle = searchMeetings(db, { query: "board prep", limit: 10 });
    const byContent = searchMeetings(db, { query: "for the board", limit: 10 });
    const unlockedControl = searchMeetings(db, { query: "40 seats", limit: 10 });

    expect(byTitle).toEqual([
      { id: "secret", title: "Board prep", date: "2026-10-12T09:00:00.000Z", folder: "", participants: ["Sara Haddad"], snippet: null, locked: true },
    ]);
    expect(byContent).toEqual([]);
    expect(unlockedControl.map((hit) => hit.id)).toEqual(["pricing"]);
  });

  test("filters by folder (with subfolders), participant, dates and limit", () => {
    const ids = (input: Parameters<typeof searchMeetings>[1]) => searchMeetings(db, input).map((hit) => hit.id);

    expect(ids({ folder: "Clients", limit: 10 })).toEqual(["pricing"]);
    expect(ids({ participant: "sara@lumen", limit: 10 })).toEqual(["secret", "pricing"]);
    expect(ids({ from: "2026-09-01", to: "2026-09-30", limit: 10 })).toEqual(["standup"]);
    expect(ids({ limit: 2 })).toEqual(["secret", "pricing"]);
    expect(ids({ limit: 10 })).toEqual(["secret", "pricing", "standup"]);
  });
});

describe("getMeeting", () => {
  test("returns details, notes as markdown and a speaker-labelled transcript clipped to max_chars", () => {
    const meeting = getMeeting(db, { id: "pricing", include: "both", max_chars: 50 });

    expect(meeting).toEqual({
      id: "pricing",
      title: "Lumen pricing",
      date: "2026-10-10T10:00:00.000Z",
      folder: "Clients/Lumen",
      tags: ["pricing"],
      participants: [{ name: "Sara Haddad", email: "sara@lumen.test" }],
      notes: "Decided annual billing at 40 seats\nSara wants a di…",
      transcript: "[00:00] Sara Haddad: Can we do annual?\n[00:04] You…",
    });
    expect(getMeeting(db, { id: "pricing", include: "notes", max_chars: 4_000 })).not.toHaveProperty("transcript");
  });

  test("a locked note's content is refused while an unlocked one is readable", () => {
    expect(() => getMeeting(db, { id: "secret", include: "notes", max_chars: 4_000 })).toThrow(LockedNoteError);
    expect(getMeeting(db, { id: "pricing", include: "notes", max_chars: 4_000 }).notes).toContain("annual billing");
  });

  test("an unknown id is an error, not an empty meeting", () => {
    expect(() => getMeeting(db, { id: "nope", include: "both", max_chars: 4_000 })).toThrow("There is no note with id nope");
  });
});

describe("library lists", () => {
  test("folders include catalog folders, implicit parents and note counts", () => {
    db.run(`INSERT INTO folders (id, path) VALUES ('folder-empty', 'Archive')`);

    expect(listFolders(db)).toEqual([
      { path: "Archive", id: "folder-empty", notes: 0 },
      { path: "Clients", id: null, notes: 1 },
      { path: "Clients/Lumen", id: null, notes: 1 },
      { path: "Team", id: null, notes: 1 },
    ]);
  });

  test("tags list with how many notes use them", () => {
    expect(listTags(db)).toEqual([{ name: "pricing", notes: 1 }]);
  });

  test("people search matches name, email and organization and lists matching organizations", () => {
    expect(searchPeople(db, { query: "lumen", limit: 10 })).toEqual({
      people: [{ id: "sara", name: "Sara Haddad", email: "sara@lumen.test", organization: "Lumen", title: "CFO" }],
      organizations: [{ id: "org-lumen", name: "Lumen" }],
    });
    expect(searchPeople(db, { query: "nobody", limit: 10 })).toEqual({ people: [], organizations: [] });
  });

  test("templates come with their sections", () => {
    db.run(
      `INSERT INTO templates (id, title, description, sections_json) VALUES ('tpl', 'Discovery', 'First call', '[{"title":"Pain","description":"What hurts"}]')`,
    );

    expect(listTemplates(db)).toEqual([
      { id: "tpl", title: "Discovery", description: "First call", sections: [{ title: "Pain", description: "What hurts" }] },
    ]);
  });

  test("action items from locked notes stay hidden", () => {
    const items: Array<[string, string, string]> = [
      ["a1", "pricing", "Send the sheet"],
      ["a2", "secret", "Board deck"],
    ];
    for (const [id, session, text] of items) {
      db.run(`INSERT INTO action_items (id, session_id, text, status, assignee_human_id) VALUES (?, ?, ?, 'todo', 'sara')`, [id, session, text]);
    }

    expect(listActionItems(db, { status: "todo", limit: 10 })).toEqual([
      { task_id: "a1", text: "Send the sheet", status: "todo", note_id: "pricing", note_title: "Lumen pricing", assignee: "Sara Haddad", due: null },
    ]);
  });
});
