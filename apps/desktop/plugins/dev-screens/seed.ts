// Writes a dataset (dataset.ts) into a freshly migrated database.
import type { DatabaseSync } from "node:sqlite";

import {
  type CalendarEvent,
  type Dataset,
  doc,
  MINUTE,
  paragraph,
  SELF_ID,
  type Session,
} from "./dataset";

const WORKSPACE = "local";

function at(offsetMs: number) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function insertTranscript(
  db: DatabaseSync,
  session: Session & { transcript: NonNullable<Session["transcript"]> },
  startedAt: number,
) {
  const words: unknown[] = [];
  const hints: unknown[] = [];
  const turns = session.transcript;
  const wordCount = turns.reduce(
    (sum, [, line]) => sum + line.split(" ").length,
    0,
  );
  // Spread the turns over the meeting so long meetings get long timestamps.
  const pause = Math.max(
    1_400,
    ((session.duration ?? 45 * MINUTE) - wordCount * 360) / turns.length,
  );
  let ms = 0;
  turns.forEach(([speaker, line], turn) => {
    const ids = line.split(" ").map((word, index) => {
      const id = `w-${turn}-${index}`;
      words.push({
        id,
        text: ` ${word}`,
        start_ms: ms,
        end_ms: ms + 320,
        channel: speaker === SELF_ID ? 0 : 1,
      });
      ms += 360;
      return id;
    });
    if (typeof speaker === "string")
      hints.push({
        id: `${ids[0]}:user_speaker_assignment`,
        word_id: ids[0],
        type: "user_speaker_assignment",
        value: JSON.stringify({
          human_id: speaker,
          scope: "segment",
          word_ids: ids,
        }),
      });
    else if (typeof speaker === "number")
      for (const id of ids)
        hints.push({
          id: `${id}:provider_speaker_index`,
          word_id: id,
          type: "provider_speaker_index",
          value: JSON.stringify({ speaker_index: speaker, channel: 1 }),
        });
    ms += Math.round(pause);
  });
  db.prepare(
    `INSERT INTO transcripts (id, workspace_id, owner_user_id, session_id, source, provider, model, language, started_at_ms, ended_at_ms, words_json, speaker_hints_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'live', 'soniox', 'stt-rt', 'en', ?, ?, ?, ?, ?, ?)`,
  ).run(
    `transcript-${session.id}`,
    WORKSPACE,
    SELF_ID,
    session.id,
    startedAt,
    startedAt + ms,
    JSON.stringify(words),
    JSON.stringify(hints),
    new Date(startedAt).toISOString(),
    new Date(startedAt).toISOString(),
  );
}

function insertSession(db: DatabaseSync, session: Session) {
  const created = at(session.offset);
  db.prepare(
    `INSERT INTO sessions (id, workspace_id, owner_user_id, title, created_at, updated_at, started_at, ended_at, folder_path, locked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    WORKSPACE,
    SELF_ID,
    session.title,
    created,
    created,
    created,
    at(session.offset + (session.duration ?? 45 * MINUTE)),
    session.folder ?? "",
    session.locked ? 1 : 0,
  );
  db.prepare(
    `INSERT INTO session_documents (id, workspace_id, session_id, kind, title, body_format, body, created_at, updated_at)
     VALUES (?, ?, ?, 'note', '', 'prosemirror_json', ?, ?, ?)`,
  ).run(
    session.id,
    WORKSPACE,
    session.id,
    JSON.stringify(session.note ?? doc(paragraph(""))),
    created,
    created,
  );
  if (session.summary)
    db.prepare(
      `INSERT INTO session_documents (id, workspace_id, session_id, kind, template_id, title, body_format, body, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 'summary', '', 'Summary', 'prosemirror_json', ?, 0, ?, ?)`,
    ).run(
      `summary-${session.id}`,
      WORKSPACE,
      session.id,
      JSON.stringify(session.summary),
      created,
      created,
    );
  session.people.forEach((human, index) => {
    db.prepare(
      `INSERT INTO session_participants (id, workspace_id, owner_user_id, session_id, human_id, role, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'attendee', 'manual', ?, ?)`,
    ).run(
      `participant-${session.id}-${index}`,
      WORKSPACE,
      SELF_ID,
      session.id,
      human,
      created,
      created,
    );
  });
  for (const tag of session.tags ?? [])
    db.prepare(
      `INSERT INTO session_tags (id, workspace_id, owner_user_id, session_id, tag_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `session-tag-${session.id}-${tag}`,
      WORKSPACE,
      SELF_ID,
      session.id,
      `tag-${tag}`,
      created,
      created,
    );
  if (session.transcript)
    insertTranscript(
      db,
      { ...session, transcript: session.transcript },
      Date.now() + session.offset,
    );
}

function insertEvent(db: DatabaseSync, event: CalendarEvent, now: string) {
  db.prepare(
    `INSERT INTO events (id, tracking_id_event, calendar_id, title, started_at, ended_at, location, meeting_link, is_all_day, provider, participants_json, created_at, updated_at)
     VALUES (?, ?, 'calendar-work', ?, ?, ?, ?, ?, ?, 'apple', ?, ?, ?)`,
  ).run(
    event.id,
    event.id,
    event.title,
    event.start.toISOString(),
    new Date(event.start.getTime() + event.minutes * MINUTE).toISOString(),
    event.location ?? "",
    event.link ?? "https://meet.google.com/abc-defg-hij",
    event.allDay ? 1 : 0,
    JSON.stringify(event.participants ?? []),
    now,
    now,
  );
}

export function seed(db: DatabaseSync, dataset: Dataset) {
  const now = at(0);
  db.exec("BEGIN");
  for (const org of dataset.organizations)
    db.prepare(
      `INSERT INTO organizations (id, workspace_id, owner_user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(org.id, WORKSPACE, SELF_ID, org.name, now, now);
  for (const person of dataset.people)
    db.prepare(
      `INSERT INTO humans (id, workspace_id, owner_user_id, organization_id, name, email, job_title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      person.id,
      WORKSPACE,
      SELF_ID,
      person.org,
      person.name,
      person.email,
      person.title,
      now,
      now,
    );
  for (const path of dataset.folders)
    db.prepare(
      `INSERT INTO folders (id, workspace_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(`folder-${path}`, WORKSPACE, path, now, now);
  const tags = dataset.sessions.flatMap((s) => s.tags ?? []);
  tags
    .filter((tag, index) => tags.indexOf(tag) === index)
    .forEach((tag) =>
      db
        .prepare(
          `INSERT INTO tags (id, workspace_id, owner_user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(`tag-${tag}`, WORKSPACE, SELF_ID, tag, now, now),
    );

  for (const session of dataset.sessions) insertSession(db, session);

  db.prepare(
    `INSERT INTO calendars (id, tracking_id_calendar, name, enabled, provider, source, color, created_at, updated_at)
     VALUES ('calendar-work', 'work', 'Work', 1, 'apple', 'ahmad@open.cx', '#5b8def', ?, ?)`,
  ).run(now, now);
  for (const event of dataset.events) insertEvent(db, event, now);

  for (const template of dataset.templates ?? [])
    db.prepare(
      `INSERT INTO templates (id, title, description, sections_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      template.id,
      template.title,
      template.description,
      JSON.stringify(template.sections),
      now,
      now,
    );

  const settings: Record<string, unknown> = {
    cloudsync_workspace_binding: { workspace_id: WORKSPACE },
    current_stt_provider: "anarlog",
    current_stt_model: "cloud",
    self_name_backfilled: true,
    ...dataset.settings,
  };
  for (const [key, value] of Object.entries(settings))
    db.prepare(
      `INSERT OR REPLACE INTO app_settings (id, value_json, updated_at) VALUES (?, ?, ?)`,
    ).run(key, JSON.stringify(value), now);
  db.exec("COMMIT");
}
