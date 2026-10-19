// Fixture data for the dev screen harness: a week of meetings for one person,
// with people, folders, calendar events, a summary and a transcript. Times are
// relative to now so the sidebar groups (today, yesterday, last week) fill.
import type { DatabaseSync } from "node:sqlite";

export const SELF_ID = "00000000-0000-0000-0000-000000000000";
const WORKSPACE = "local";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function at(offsetMs: number) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function today(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

const PEOPLE = [
  {
    id: SELF_ID,
    name: "Ahmad Falta",
    email: "ahmad@open.cx",
    title: "Engineer",
    org: "org-open",
  },
  {
    id: "human-omer",
    name: "Ömer Aydın",
    email: "omer@lumen.example",
    title: "Head of Product",
    org: "org-lumen",
  },
  {
    id: "human-sara",
    name: "Sara Lindqvist",
    email: "sara@northwind.example",
    title: "Operations lead",
    org: "org-northwind",
  },
  {
    id: "human-leila",
    name: "Leila Haddad",
    email: "leila@open.cx",
    title: "Customer success",
    org: "org-open",
  },
  {
    id: "human-mia",
    name: "Mia Chen",
    email: "mia@northwind.example",
    title: "Design engineer",
    org: "org-northwind",
  },
  {
    id: "human-yousef",
    name: "يوسف أحمد",
    email: "yousef@lumen.example",
    title: "مدير العمليات",
    org: "org-lumen",
  },
] as const;

const ORGANIZATIONS = [
  { id: "org-open", name: "OpenCX" },
  { id: "org-lumen", name: "Lumen" },
  { id: "org-northwind", name: "Northwind" },
] as const;

const FOLDERS = ["Clients", "Clients/Lumen", "Hiring"];

type Seeded = {
  id: string;
  title: string;
  offset: number;
  folder?: string;
  people: readonly string[];
  note?: unknown;
  summary?: unknown;
  transcript?: boolean;
  locked?: boolean;
};

const text = (value: string) => ({ type: "text", text: value });
const paragraph = (value: string) => ({
  type: "paragraph",
  content: [text(value)],
});
const heading = (value: string) => ({
  type: "heading",
  attrs: { level: 3 },
  content: [text(value)],
});
const bullets = (...items: string[]) => ({
  type: "bulletList",
  content: items.map((item) => ({
    type: "listItem",
    content: [paragraph(item)],
  })),
});
const tasks = (...items: [string, boolean][]) => ({
  type: "taskList",
  content: items.map(([item, checked]) => ({
    type: "taskItem",
    attrs: { checked },
    content: [paragraph(item)],
  })),
});
const doc = (...content: unknown[]) => ({ type: "doc", content });

export const MAIN_SESSION = "session-lumen-weekly";

const SESSIONS: Seeded[] = [
  {
    id: MAIN_SESSION,
    title: "Weekly sync with Lumen",
    offset: -2 * HOUR,
    folder: "Clients/Lumen",
    people: [SELF_ID, "human-omer", "human-yousef", "human-leila"],
    note: doc(
      paragraph("Pricing page still shows the old seat tiers."),
      bullets(
        "Bcc on outbound email is live",
        "WhatsApp sessions that stayed open: fixed on Monday",
      ),
    ),
    summary: doc(
      heading("Decisions"),
      bullets(
        "Move Lumen to the annual plan from November",
        "Keep the WhatsApp channel on the shared number until the migration",
      ),
      heading("Action items"),
      tasks(
        ["Send Ömer the Bcc setup steps", false],
        ["Share the pricing page draft with Yousef", false],
        ["Close the stale WhatsApp sessions", true],
      ),
      heading("Open questions"),
      bullets("Who signs off the new seat count on their side?"),
    ),
    transcript: true,
  },
  {
    id: "session-pricing",
    title: "Pricing review",
    offset: -5 * HOUR,
    people: [SELF_ID, "human-leila"],
    note: doc(paragraph("Annual discount stays at two months.")),
  },
  {
    id: "session-sara",
    title: "1:1 with Sara",
    offset: -1 * DAY - 2 * HOUR,
    folder: "Clients",
    people: [SELF_ID, "human-sara"],
  },
  {
    id: "session-hiring",
    title: "Hiring loop: design engineer",
    offset: -1 * DAY - 5 * HOUR,
    folder: "Hiring",
    people: [SELF_ID, "human-mia"],
    locked: true,
  },
  {
    id: "session-arabic",
    title: "مراجعة خطة الإطلاق",
    offset: -3 * DAY,
    folder: "Clients/Lumen",
    people: [SELF_ID, "human-yousef"],
    note: doc(paragraph("نراجع خطة الإطلاق مع فريق جسر يوم الأحد.")),
  },
  {
    id: "session-northwind",
    title: "Northwind onboarding",
    offset: -6 * DAY,
    folder: "Clients",
    people: [SELF_ID, "human-sara", "human-mia"],
  },
  {
    id: "session-roadmap",
    title:
      "Roadmap planning for the next two quarters with the whole product group",
    offset: -9 * DAY,
    people: [SELF_ID, "human-leila", "human-omer"],
  },
];

const TRANSCRIPT: [string, string][] = [
  [SELF_ID, "Thanks for making the time. Shall we start with pricing?"],
  [
    "human-omer",
    "Yes. The pricing page still shows the old seat tiers, so the team is confused.",
  ],
  [SELF_ID, "Fair. We will move you to the annual plan from November."],
  ["human-yousef", "ممتاز، وهل نحتفظ برقم واتساب الحالي حتى ننتهي من النقل؟"],
  ["human-leila", "Yes, the shared number stays until the migration is done."],
  ["human-omer", "And the Bcc on outbound email, is that live already?"],
  [SELF_ID, "It is. I will send you the setup steps today."],
];

function insertTranscript(
  db: DatabaseSync,
  sessionId: string,
  startedAt: number,
) {
  const words: unknown[] = [];
  const hints: unknown[] = [];
  let ms = 0;
  TRANSCRIPT.forEach(([speaker, line], turn) => {
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
    ms += 1_400;
  });
  db.prepare(
    `INSERT INTO transcripts (id, workspace_id, owner_user_id, session_id, source, provider, model, language, started_at_ms, ended_at_ms, words_json, speaker_hints_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'live', 'soniox', 'stt-rt', 'en', ?, ?, ?, ?, ?, ?)`,
  ).run(
    `transcript-${sessionId}`,
    WORKSPACE,
    SELF_ID,
    sessionId,
    startedAt,
    startedAt + ms,
    JSON.stringify(words),
    JSON.stringify(hints),
    new Date(startedAt).toISOString(),
    new Date(startedAt).toISOString(),
  );
}

export function seed(db: DatabaseSync) {
  const now = at(0);
  for (const org of ORGANIZATIONS)
    db.prepare(
      `INSERT INTO organizations (id, workspace_id, owner_user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(org.id, WORKSPACE, SELF_ID, org.name, now, now);
  for (const person of PEOPLE)
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
  for (const path of FOLDERS)
    db.prepare(
      `INSERT INTO folders (id, workspace_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(`folder-${path}`, WORKSPACE, path, now, now);

  for (const session of SESSIONS) {
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
      at(session.offset + 45 * 60_000),
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
    if (session.transcript)
      insertTranscript(db, session.id, Date.now() + session.offset);
  }

  db.prepare(
    `INSERT INTO calendars (id, tracking_id_calendar, name, enabled, provider, source, color, created_at, updated_at)
     VALUES ('calendar-work', 'work', 'Work', 1, 'apple', 'ahmad@open.cx', '#5b8def', ?, ?)`,
  ).run(now, now);
  const events: [string, string, Date, number][] = [
    ["event-design", "Design review", new Date(Date.now() + 25 * 60_000), 30],
    ["event-standup", "Team standup", today(9, 30), 15],
    ["event-northwind", "Northwind check-in", new Date(Date.now() + DAY), 45],
    ["event-board", "Board prep", new Date(Date.now() + 3 * DAY), 60],
    ["event-hiring", "Interview: Mia Chen", new Date(Date.now() - 4 * DAY), 60],
  ];
  for (const [id, title, start, minutes] of events)
    db.prepare(
      `INSERT INTO events (id, tracking_id_event, calendar_id, title, started_at, ended_at, meeting_link, provider, participants_json, created_at, updated_at)
       VALUES (?, ?, 'calendar-work', ?, ?, ?, 'https://meet.google.com/abc-defg-hij', 'apple', '[]', ?, ?)`,
    ).run(
      id,
      id,
      title,
      start.toISOString(),
      new Date(start.getTime() + minutes * 60_000).toISOString(),
      now,
      now,
    );

  const settings: Record<string, unknown> = {
    cloudsync_workspace_binding: { workspace_id: WORKSPACE },
    current_stt_provider: "anarlog",
    current_stt_model: "cloud",
    self_name_backfilled: true,
  };
  for (const [key, value] of Object.entries(settings))
    db.prepare(
      `INSERT OR REPLACE INTO app_settings (id, value_json, updated_at) VALUES (?, ?, ?)`,
    ).run(key, JSON.stringify(value), now);
}
