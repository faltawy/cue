import { Database } from "bun:sqlite";
import path from "node:path";

const MIGRATIONS = path.join(import.meta.dir, "../../../../crates/db-app/migrations");

const SCHEMA = [
  "20260413020000_templates.sql",
  "20260712170000_template_icons.sql",
  "20260710223922_canonical_data_model.sql",
  "20260815100100_transcript_live_deltas.sql",
  "20260820120000_session_locked.sql",
  "20260830120000_folder_attachments.sql",
  "20260830140000_folders.sql",
  "20260830160000_folder_instructions.sql",
  "20260831120000_folder_icons.sql",
];

export async function appDb(): Promise<Database> {
  const db = new Database(":memory:");
  for (const file of SCHEMA) db.exec(await Bun.file(path.join(MIGRATIONS, file)).text());
  return db;
}

export const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

export function seedNote(
  db: Database,
  note: { id: string; title: string; folder?: string; startedAt?: string; locked?: boolean; body?: string[]; owner?: string },
) {
  db.run(
    `INSERT INTO sessions (id, owner_user_id, title, folder_path, started_at, created_at, locked) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      note.id,
      note.owner ?? "me",
      note.title,
      note.folder ?? "",
      note.startedAt ?? "",
      note.startedAt ?? "2026-10-01T09:00:00.000Z",
      note.locked ? 1 : 0,
    ],
  );
  if (note.body) {
    db.run(`INSERT INTO session_documents (id, session_id, kind, body_format, body) VALUES (?, ?, 'note', 'prosemirror_json', ?)`, [
      note.id,
      note.id,
      JSON.stringify({ type: "doc", content: note.body.map(paragraph) }),
    ]);
  }
}

export function seedPerson(db: Database, person: { id: string; name: string; email?: string; organization?: string; title?: string }) {
  db.run(`INSERT INTO humans (id, name, email, organization_id, job_title) VALUES (?, ?, ?, ?, ?)`, [
    person.id,
    person.name,
    person.email ?? "",
    person.organization ?? "",
    person.title ?? "",
  ]);
}

export function seedParticipant(db: Database, sessionId: string, humanId: string, source = "manual") {
  db.run(`INSERT INTO session_participants (id, session_id, human_id, source) VALUES (?, ?, ?, ?)`, [
    `${sessionId}:${humanId}`,
    sessionId,
    humanId,
    source,
  ]);
}

export function seedTag(db: Database, sessionId: string, tag: string) {
  db.run(`INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)`, [tag, tag]);
  db.run(`INSERT INTO session_tags (id, session_id, tag_id) VALUES (?, ?, ?)`, [`${sessionId}:${tag}`, sessionId, tag]);
}

export function seedTranscript(db: Database, sessionId: string, words: Array<{ text: string; start_ms: number; channel: number }>) {
  db.run(`INSERT INTO transcripts (id, session_id, owner_user_id, started_at_ms, ended_at_ms, words_json) VALUES (?, ?, 'me', 1, 2, ?)`, [
    `t-${sessionId}`,
    sessionId,
    JSON.stringify(words.map((word, index) => ({ id: `${sessionId}-w${index}`, ...word, end_ms: word.start_ms + 300 }))),
  ]);
}
