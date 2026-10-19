import type { Database } from "bun:sqlite";

import { renderNote } from "./notes";
import { readLiveTranscript, renderLines } from "./transcript";

export class LockedNoteError extends Error {
  constructor(title: string) {
    super(`“${title || "Untitled"}” is locked in the app; its notes and transcript stay private.`);
  }
}

type NoteRow = {
  id: string;
  title: string;
  date: string;
  folder_path: string;
  locked: number;
  owner_user_id: string;
  body: string;
  body_format: string;
};

const NOTE_DATE = `COALESCE(NULLIF(s.started_at, ''), s.created_at)`;

const NOTE_ROWS = `
  SELECT s.id, s.title, ${NOTE_DATE} AS date, s.folder_path, s.locked, s.owner_user_id,
         COALESCE(d.body, '') AS body, COALESCE(d.body_format, '') AS body_format
  FROM sessions s
  LEFT JOIN session_documents d ON d.id = s.id AND d.kind = 'note' AND d.deleted_at IS NULL
  WHERE s.deleted_at IS NULL`;

const SNIPPET_BEFORE = 60;
const SNIPPET_AFTER = 100;
const SEARCH_CANDIDATES = 200;

function noteText(row: Pick<NoteRow, "body" | "body_format">): string {
  if (!row.body.trim()) return "";
  if (row.body_format !== "prosemirror_json") return row.body.trim();
  try {
    return renderNote(row.body);
  } catch {
    return "";
  }
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function snippet(text: string, query: string): string | null {
  if (!text) return null;
  const at = query ? text.toLowerCase().indexOf(query) : 0;
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = Math.min(text.length, Math.max(at, 0) + query.length + SNIPPET_AFTER);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

function participantsOf(db: Database, sessionId: string, ownerId: string) {
  return db
    .query<{ name: string; email: string }, [string, string]>(
      `SELECT COALESCE(NULLIF(h.name, ''), NULLIF(p.display_name, ''), NULLIF(h.email, ''), p.email) AS name,
              COALESCE(NULLIF(h.email, ''), p.email) AS email
       FROM session_participants p LEFT JOIN humans h ON h.id = p.human_id AND h.deleted_at IS NULL
       WHERE p.session_id = ? AND p.deleted_at IS NULL AND p.source <> 'excluded' AND p.human_id <> ?
       ORDER BY p.created_at, p.id`,
    )
    .all(sessionId, ownerId);
}

export type SearchInput = {
  query?: string;
  from?: string;
  to?: string;
  folder?: string;
  participant?: string;
  tag?: string;
  limit: number;
};

export type MeetingHit = {
  id: string;
  title: string;
  date: string;
  folder: string;
  participants: string[];
  snippet: string | null;
  locked: boolean;
};

export function searchMeetings(db: Database, input: SearchInput): MeetingHit[] {
  const where: string[] = [];
  const params: Array<string | number> = [];
  const folder = input.folder?.trim();
  if (folder) {
    where.push("(s.folder_path = ? OR s.folder_path LIKE ?)");
    params.push(folder, `${folder}/%`);
  }
  if (input.from) {
    where.push(`substr(${NOTE_DATE}, 1, 10) >= ?`);
    params.push(input.from);
  }
  if (input.to) {
    where.push(`substr(${NOTE_DATE}, 1, 10) <= ?`);
    params.push(input.to);
  }
  const participant = input.participant?.trim().toLowerCase();
  if (participant) {
    where.push(`EXISTS (
      SELECT 1 FROM session_participants p LEFT JOIN humans h ON h.id = p.human_id AND h.deleted_at IS NULL
      WHERE p.session_id = s.id AND p.deleted_at IS NULL AND p.source <> 'excluded'
        AND lower(COALESCE(h.name, '') || char(10) || COALESCE(h.email, '') || char(10) || p.display_name || char(10) || p.email) LIKE ?)`);
    params.push(`%${participant}%`);
  }
  const tag = input.tag?.trim().toLowerCase();
  if (tag) {
    where.push(`EXISTS (
      SELECT 1 FROM session_tags st LEFT JOIN tags t ON t.id = st.tag_id
      WHERE st.session_id = s.id AND st.deleted_at IS NULL AND (lower(st.tag_id) = ? OR lower(t.name) = ?))`);
    params.push(tag, tag);
  }
  const query = input.query?.trim().toLowerCase() ?? "";
  if (query) {
    where.push("(lower(s.title) LIKE ? OR (s.locked = 0 AND lower(COALESCE(d.body, '')) LIKE ?))");
    params.push(`%${query}%`, `%${query}%`);
  }
  const rows = db
    .query<NoteRow, Array<string | number>>(
      `${NOTE_ROWS}${where.map((clause) => ` AND ${clause}`).join("")}
       ORDER BY date DESC, s.id LIMIT ?`,
    )
    .all(...params, query ? SEARCH_CANDIDATES : input.limit);

  const hits: MeetingHit[] = [];
  for (const row of rows) {
    const locked = row.locked !== 0;
    const text = locked ? "" : noteText(row);
    if (query && !row.title.toLowerCase().includes(query) && !text.toLowerCase().includes(query)) continue;
    hits.push({
      id: row.id,
      title: row.title,
      date: row.date,
      folder: row.folder_path,
      participants: participantsOf(db, row.id, row.owner_user_id).map((person) => person.name),
      snippet: locked ? null : snippet(text, text.toLowerCase().includes(query) ? query : ""),
      locked,
    });
    if (hits.length >= input.limit) break;
  }
  return hits;
}

export type MeetingDetail = {
  id: string;
  title: string;
  date: string;
  folder: string;
  tags: string[];
  participants: Array<{ name: string; email: string }>;
  notes?: string;
  transcript?: string;
};

export function getMeeting(
  db: Database,
  input: { id: string; include: "notes" | "transcript" | "both"; max_chars: number },
): MeetingDetail {
  const row = db.query<NoteRow, [string]>(`${NOTE_ROWS} AND s.id = ?`).get(input.id);
  if (!row) throw new Error(`There is no note with id ${input.id}.`);
  if (row.locked !== 0) throw new LockedNoteError(row.title);
  const tags = db
    .query<{ name: string }, [string]>(
      `SELECT COALESCE(t.name, st.tag_id) AS name
       FROM session_tags st LEFT JOIN tags t ON t.id = st.tag_id AND t.deleted_at IS NULL
       WHERE st.session_id = ? AND st.deleted_at IS NULL ORDER BY name`,
    )
    .all(row.id)
    .map((tag) => tag.name);
  const detail: MeetingDetail = {
    id: row.id,
    title: row.title,
    date: row.date,
    folder: row.folder_path,
    tags,
    participants: participantsOf(db, row.id, row.owner_user_id),
  };
  if (input.include !== "transcript") detail.notes = clip(noteText(row), input.max_chars);
  if (input.include !== "notes") {
    const transcript = readLiveTranscript(db, { sessionId: row.id });
    detail.transcript = clip(transcript ? renderLines(transcript.lines) : "", input.max_chars);
  }
  return detail;
}

export type FolderEntry = { path: string; id: string | null; notes: number };

export function listFolders(db: Database): FolderEntry[] {
  const known = db
    .query<{ folder_path: string }, []>(
      `SELECT folder_path FROM sessions WHERE deleted_at IS NULL AND folder_path <> ''
       UNION SELECT folder_path FROM folder_attachments WHERE deleted_at IS NULL AND folder_path <> ''
       UNION SELECT path FROM folders WHERE deleted_at IS NULL AND path <> ''`,
    )
    .all()
    .map((row) => row.folder_path);
  const paths = new Set<string>();
  for (const path of known) {
    const segments = path.split("/").filter(Boolean);
    for (let depth = 1; depth <= segments.length; depth += 1) paths.add(segments.slice(0, depth).join("/"));
  }
  const ids = new Map(
    db
      .query<{ id: string; path: string }, []>(`SELECT id, path FROM folders WHERE deleted_at IS NULL ORDER BY updated_at, id`)
      .all()
      .map((row) => [row.path, row.id]),
  );
  const notes = db.query<{ count: number }, [string, string]>(
    `SELECT count(*) AS count FROM sessions WHERE deleted_at IS NULL AND (folder_path = ? OR folder_path LIKE ?)`,
  );
  return [...paths]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => ({ path, id: ids.get(path) ?? null, notes: notes.get(path, `${path}/%`)?.count ?? 0 }));
}

export function listTags(db: Database): Array<{ name: string; notes: number }> {
  return db
    .query<{ name: string; notes: number }, []>(
      `SELECT COALESCE(t.name, st.tag_id) AS name, count(DISTINCT st.session_id) AS notes
       FROM session_tags st
       JOIN sessions s ON s.id = st.session_id AND s.deleted_at IS NULL
       LEFT JOIN tags t ON t.id = st.tag_id AND t.deleted_at IS NULL
       WHERE st.deleted_at IS NULL
       GROUP BY name ORDER BY name`,
    )
    .all();
}

export function searchPeople(db: Database, input: { query: string; limit: number }) {
  const query = `%${input.query.trim().toLowerCase()}%`;
  const people = db
    .query<{ id: string; name: string; email: string; organization: string; title: string }, [string, number]>(
      `SELECT h.id, h.name, h.email, COALESCE(o.name, '') AS organization, h.job_title AS title
       FROM humans h LEFT JOIN organizations o ON o.id = h.organization_id AND o.deleted_at IS NULL
       WHERE h.deleted_at IS NULL AND h.name <> ''
         AND lower(h.name || char(10) || h.email || char(10) || h.job_title || char(10) || h.memo || char(10) || COALESCE(o.name, '')) LIKE ?
       ORDER BY h.name, h.id LIMIT ?`,
    )
    .all(query, input.limit)
    .map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email || null,
      organization: person.organization || null,
      title: person.title || null,
    }));
  const organizations = db
    .query<{ id: string; name: string }, [string, number]>(
      `SELECT id, name FROM organizations
       WHERE deleted_at IS NULL AND lower(name || char(10) || memo) LIKE ?
       ORDER BY name, id LIMIT ?`,
    )
    .all(query, input.limit);
  return { people, organizations };
}

type Section = { title: string; description: string };

function parseSections(value: string): Section[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): Section[] => {
      if (typeof entry === "string") return [{ title: entry, description: "" }];
      if (entry && typeof entry === "object" && "title" in entry && typeof entry.title === "string") {
        const description = "description" in entry && typeof entry.description === "string" ? entry.description : "";
        return [{ title: entry.title, description }];
      }
      return [];
    });
  } catch {
    return [];
  }
}

export function listTemplates(db: Database) {
  return db
    .query<{ id: string; title: string; description: string; sections_json: string }, []>(
      `SELECT id, title, description, sections_json FROM templates ORDER BY title, id`,
    )
    .all()
    .map((row) => ({ id: row.id, title: row.title, description: row.description, sections: parseSections(row.sections_json) }));
}

export function listActionItems(
  db: Database,
  input: { status?: "todo" | "done"; person_id?: string; note_id?: string; limit: number },
) {
  const where: string[] = [];
  const params: Array<string | number> = [];
  for (const [column, value] of [
    ["a.status", input.status],
    ["a.assignee_human_id", input.person_id],
    ["a.session_id", input.note_id],
  ] as const) {
    if (!value) continue;
    where.push(`${column} = ?`);
    params.push(value);
  }
  return db
    .query<
      { task_id: string; text: string; status: string; note_id: string; note_title: string; assignee: string | null; due: string | null },
      Array<string | number>
    >(
      `SELECT a.id AS task_id, a.text, a.status, a.session_id AS note_id, s.title AS note_title,
              NULLIF(h.name, '') AS assignee, NULLIF(a.due_at, '') AS due
       FROM action_items a
       JOIN sessions s ON s.id = a.session_id AND s.deleted_at IS NULL AND s.locked = 0
       LEFT JOIN humans h ON h.id = a.assignee_human_id AND h.deleted_at IS NULL
       WHERE a.deleted_at IS NULL${where.map((clause) => ` AND ${clause}`).join("")}
       ORDER BY a.created_at DESC, a.id LIMIT ?`,
    )
    .all(...params, input.limit);
}
