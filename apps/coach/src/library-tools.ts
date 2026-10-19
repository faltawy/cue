import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { Database } from "bun:sqlite";
import { z } from "zod";

import type { LibraryChange } from "./app-bridge";
import {
  getMeeting,
  listActionItems,
  listFolders,
  listTags,
  listTemplates,
  searchMeetings,
  searchPeople,
} from "./library";
import type { MeetingEdits } from "./meeting-server";
import { failed, text } from "./tool-result";

const id = z.string().trim().min(1).max(200);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const limit = z.number().int().min(1).max(20).default(10);
const name = z.string().trim().min(1).max(200);
const tag = z.string().trim().min(1).max(64);
const section = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(2_000) });

const shapes = {
  search_meetings: {
    query: z.string().trim().max(200).optional(),
    from: day.optional(),
    to: day.optional(),
    folder: z.string().trim().max(200).optional(),
    participant: z.string().trim().max(200).optional(),
    tag: tag.optional(),
    limit,
  },
  get_meeting: {
    id,
    include: z.enum(["notes", "transcript", "both"]).default("both"),
    max_chars: z.number().int().min(200).max(20_000).default(6_000),
  },
  search_people: { query: z.string().trim().max(200).default(""), limit },
  list_action_items: {
    status: z.enum(["todo", "done"]).optional(),
    person_id: id.optional(),
    note_id: id.optional(),
    limit,
  },
  create_note: {
    title: name,
    folder: id.optional(),
    content_markdown: z.string().max(20_000).optional(),
  },
  update_note_details: {
    note_id: id,
    title: name.optional(),
    folder: z.string().trim().max(200).optional(),
    add_tags: z.array(tag).max(10).optional(),
    remove_tags: z.array(tag).max(10).optional(),
  },
  create_folder: { path: name },
  upsert_person: {
    person_id: id.optional(),
    name: name.optional(),
    email: z.email().optional(),
    job_title: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(50).optional(),
    memo: z.string().max(2_000).optional(),
    organization: z.string().trim().max(200).optional(),
    create_organization: z.boolean().default(false),
  },
  upsert_organization: {
    organization_id: id.optional(),
    name: name.optional(),
    memo: z.string().max(2_000).optional(),
  },
  add_participant: { person_id: id, note_id: id.optional() },
  upsert_template: {
    template_id: id.optional(),
    title: name.optional(),
    description: z.string().max(2_000).optional(),
    sections: z.array(section).max(30).optional(),
  },
};

function json(value: unknown, empty: string) {
  return text(Array.isArray(value) && value.length === 0 ? empty : JSON.stringify(value, null, 2));
}

function parsed<S extends z.ZodRawShape, R>(shape: S, run: (input: z.infer<z.ZodObject<S>>) => R | Promise<R>) {
  return async (input: unknown) => {
    const result = z.object(shape).safeParse(input);
    if (!result.success) return failed(new Error(`Invalid input: ${z.prettifyError(result.error)}`));
    try {
      return await run(result.data);
    } catch (error) {
      return failed(error);
    }
  };
}

const READ = { annotations: { readOnlyHint: true } };

export function libraryTools(db: Database, current: () => string, edits?: MeetingEdits) {
  const reads = [
    tool(
      "search_meetings",
      "Search the user's notes and past meetings in the app, newest first. Filter by words in the title or notes (query), folder path (includes subfolders), participant name or email, tag, and dates (from/to as YYYY-MM-DD, inclusive). Returns up to limit (max 20) notes with id, title, date, folder, participants and a short snippet. Locked notes show their title only. Use the ids it returns with get_meeting and the change tools.",
      shapes.search_meetings,
      parsed(shapes.search_meetings, (input) => json(searchMeetings(db, input), "No matching notes.")),
      READ,
    ),
    tool(
      "get_meeting",
      "Read one note or past meeting by id (from search_meetings): title, date, folder, tags, participants, the notes as markdown and the transcript labelled by speaker. include picks notes, transcript or both; each is clipped to max_chars. Locked notes can't be read.",
      shapes.get_meeting,
      parsed(shapes.get_meeting, (input) => json(getMeeting(db, input), "")),
      READ,
    ),
    tool(
      "list_folders",
      "The user's folders as paths (e.g. Clients/Lumen), with the folder id when it has one and how many notes it holds, including subfolders.",
      {},
      parsed({}, () => json(listFolders(db), "There are no folders yet.")),
      READ,
    ),
    tool(
      "list_tags",
      "The tags used on the user's notes, with how many notes use each.",
      {},
      parsed({}, () => json(listTags(db), "No note has tags yet.")),
      READ,
    ),
    tool(
      "search_people",
      "Search the user's contacts by name, email, job title, notes or organization. Returns matching people (id, name, email, organization, title) and matching organizations (id, name).",
      shapes.search_people,
      parsed(shapes.search_people, (input) => json(searchPeople(db, input), "")),
      READ,
    ),
    tool(
      "list_templates",
      "The user's note templates with id, title, description and sections.",
      {},
      parsed({}, () => json(listTemplates(db), "There are no templates yet.")),
      READ,
    ),
    tool(
      "list_action_items",
      "Action items across the user's notes, newest first, optionally by status, assignee (person_id) or note (note_id). Items in locked notes are left out.",
      shapes.list_action_items,
      parsed(shapes.list_action_items, (input) => json(listActionItems(db, input), "No matching action items.")),
      READ,
    ),
  ];
  if (!edits) return reads;

  const report = (change: LibraryChange) => {
    if (change.edit) edits.onEdit(change.edit);
    return text(change.id ? `${change.message} (id ${change.id})` : change.message);
  };
  const bridge = edits.bridge;

  return [
    ...reads,
    tool(
      "create_note",
      "Create a new note in the app. folder is an existing folder's id or path (see list_folders; create a missing one with create_folder first, only if the user asked for it); content_markdown is the starting text. Use only when the user asks. The user sees the change with Undo.",
      shapes.create_note,
      parsed(shapes.create_note, async (input) => report(await bridge.createNote(current(), input))),
    ),
    tool(
      "update_note_details",
      "Rename a note, move it to a folder, or change its tags. note_id comes from search_meetings. title: the new title. folder: an existing folder id or path, or an empty string to take it out of its folder. Tags: add_tags adds and remove_tags removes the named tags; tags not named stay as they are. Use only when the user asks. Locked notes can't be changed.",
      shapes.update_note_details,
      parsed(shapes.update_note_details, async ({ note_id, ...payload }) => {
        if (payload.title === undefined && payload.folder === undefined && !payload.add_tags?.length && !payload.remove_tags?.length) {
          throw new Error("Nothing to change: pass a title, a folder, add_tags or remove_tags.");
        }
        return report(await bridge.updateNote(current(), note_id, payload));
      }),
    ),
    tool(
      "create_folder",
      "Create a folder by path, e.g. Clients/Lumen; missing parent folders are created too. Does nothing if it already exists. Returns the folder id. Use only when the user asks.",
      shapes.create_folder,
      parsed(shapes.create_folder, async ({ path }) => report(await bridge.createFolder(current(), path))),
    ),
    tool(
      "upsert_person",
      "Add a contact, or change one when person_id is given. When adding, an existing contact with the same email or name is returned instead of a duplicate. organization links an existing organization by name; set create_organization only when the user asked to create a new one. Use only when the user asks.",
      shapes.upsert_person,
      parsed(shapes.upsert_person, async ({ person_id, ...payload }) => {
        if (person_id) return report(await bridge.updatePerson(current(), person_id, payload));
        if (!payload.name) throw new Error("A new contact needs a name.");
        return report(await bridge.createPerson(current(), payload));
      }),
    ),
    tool(
      "upsert_organization",
      "Add an organization, or change its name or memo when organization_id is given. An existing organization with the same name is returned instead of a duplicate. Use only when the user asks.",
      shapes.upsert_organization,
      parsed(shapes.upsert_organization, async ({ organization_id, ...payload }) => {
        if (organization_id) return report(await bridge.updateOrganization(current(), organization_id, payload));
        if (!payload.name) throw new Error("A new organization needs a name.");
        return report(await bridge.createOrganization(current(), payload));
      }),
    ),
    tool(
      "add_participant",
      "Add a contact (person_id from search_people or upsert_person) as a participant of this meeting, or of the note note_id. Does nothing if they are already in it. Use only when the user asks.",
      shapes.add_participant,
      parsed(shapes.add_participant, async (input) => report(await bridge.addParticipant(current(), input))),
    ),
    tool(
      "upsert_template",
      "Create a note template, or change one when template_id is given (from list_templates). sections replaces the whole section list; each section has a title and a description of what goes in it. Use only when the user asks.",
      shapes.upsert_template,
      parsed(shapes.upsert_template, async ({ template_id, ...payload }) => {
        if (template_id) return report(await bridge.updateTemplate(current(), template_id, payload));
        if (!payload.title) throw new Error("A new template needs a title.");
        return report(await bridge.createTemplate(current(), payload));
      }),
    ),
  ];
}
