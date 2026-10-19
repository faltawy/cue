// The shape every screen-harness dataset takes (demo, worst case, empty, one,
// huge), plus the ProseMirror builders the fixtures write documents with.
export const SELF_ID = "00000000-0000-0000-0000-000000000000";
export const MAIN_SESSION = "session-lumen-weekly";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export type Person = {
  id: string;
  name: string;
  email: string;
  title: string;
  org: string;
};

// A transcript turn: a known speaker (human id), an unknown one the provider
// numbered (0-based speaker index), or the default speaker of the channel.
export type Turn = [speaker: string | number | null, text: string];

export type Session = {
  id: string;
  title: string;
  offset: number;
  duration?: number;
  folder?: string;
  people: readonly string[];
  tags?: readonly string[];
  note?: unknown;
  summary?: unknown;
  transcript?: readonly Turn[];
  locked?: boolean;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  minutes: number;
  allDay?: boolean;
  location?: string;
  link?: string;
  participants?: { name?: string; email?: string }[];
};

export type Template = {
  id: string;
  title: string;
  description: string;
  sections: { title: string; description: string }[];
};

export type Dataset = {
  people: readonly Person[];
  organizations: readonly { id: string; name: string }[];
  folders: readonly string[];
  sessions: readonly Session[];
  events: readonly CalendarEvent[];
  templates?: readonly Template[];
  settings: Record<string, unknown>;
  // Answers for non-SQL commands that differ from the demo (fixtures.ts).
  fixtures?: Record<string, unknown>;
};

export const DATASETS = ["demo", "worst", "empty", "one", "huge"] as const;
export type DatasetName = (typeof DATASETS)[number];

export function isDatasetName(value: unknown): value is DatasetName {
  return DATASETS.includes(value as DatasetName);
}

export function today(hour: number, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

export const text = (value: string) => ({ type: "text", text: value });
export const paragraph = (value: string) => ({
  type: "paragraph",
  content: value ? [text(value)] : [],
});
export const heading = (value: string) => ({
  type: "heading",
  attrs: { level: 3 },
  content: [text(value)],
});
export const bullets = (...items: string[]) => ({
  type: "bulletList",
  content: items.map((item) => ({
    type: "listItem",
    content: [paragraph(item)],
  })),
});
export const tasks = (...items: [string, boolean][]) => ({
  type: "taskList",
  content: items.map(([item, checked]) => ({
    type: "taskItem",
    attrs: { checked },
    content: [paragraph(item)],
  })),
});
export const doc = (...content: unknown[]) => ({ type: "doc", content });
