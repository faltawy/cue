import { z } from "zod";

export const APP_URL_ENV = "ANARLOG_COACH_APP_URL";
export const APP_TOKEN_ENV = "ANARLOG_COACH_APP_TOKEN";

export const EDIT_KINDS = [
  "note",
  "add_action_item",
  "complete_action_item",
  "create_note",
  "update_note",
  "create_folder",
  "create_person",
  "update_person",
  "create_organization",
  "update_organization",
  "add_participant",
  "create_template",
  "update_template",
] as const;

const coachEditSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  kind: z.enum(EDIT_KINDS),
  summary: z.string(),
  task_id: z.string().nullable(),
  target_id: z.string().nullable().optional(),
});

export type CoachEdit = z.infer<typeof coachEditSchema>;

const libraryChangeSchema = z.object({
  edit: coachEditSchema.nullable(),
  id: z.string().nullable(),
  message: z.string(),
});

export type LibraryChange = z.infer<typeof libraryChangeSchema>;

export type NewNote = { title: string; folder?: string; content_markdown?: string };
export type NoteChanges = { title?: string; folder?: string; add_tags?: string[]; remove_tags?: string[] };
export type PersonFields = {
  name?: string;
  email?: string;
  job_title?: string;
  phone?: string;
  memo?: string;
  organization?: string;
  create_organization?: boolean;
};
export type OrganizationFields = { name?: string; memo?: string };
export type TemplateFields = {
  title?: string;
  description?: string;
  sections?: Array<{ title: string; description: string }>;
};

const meetingProjectSchema = z.object({
  session_id: z.string(),
  series: z.object({ key: z.string(), label: z.string() }).nullable(),
  project: z.string(),
  source: z.enum(["series", "default"]),
  default_project: z.string(),
});

export type MeetingProject = z.infer<typeof meetingProjectSchema>;

const recordingSchema = z.object({ session_ids: z.array(z.string()) });

export type NoteStyle = "paragraphs" | "bullets";

export class BridgeError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const errorBodySchema = z.object({ error: z.string() });

export type AppBridge = ReturnType<typeof appBridge>;

export function appBridge(url: string, token: string) {
  async function call<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T | null> {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204) return null;
    const json: unknown = await response.json();
    if (!response.ok) {
      const parsed = errorBodySchema.safeParse(json);
      throw new BridgeError(response.status, parsed.success ? parsed.data.error : `the app answered ${response.status}`);
    }
    return schema.parse(json);
  }

  async function required<T>(result: Promise<T | null>): Promise<T> {
    const value = await result;
    if (value === null) throw new BridgeError(204, "the app returned nothing");
    return value;
  }

  const meeting = (sessionId: string) => `/meeting/${encodeURIComponent(sessionId)}`;
  const library = (sessionId: string, path: string, id?: string, body?: unknown) =>
    required(
      call(
        "POST",
        `${meeting(sessionId)}/library/${path}${id === undefined ? "" : `/${encodeURIComponent(id)}`}`,
        libraryChangeSchema,
        body,
      ),
    );

  return {
    recordingSessions: async (): Promise<ReadonlySet<string>> =>
      new Set((await required(call("GET", "/recording", recordingSchema))).session_ids),
    chooseDefaultProject: () => call("POST", "/project", z.null()),
    meetingProject: (sessionId: string) =>
      required(call("GET", `${meeting(sessionId)}/project`, meetingProjectSchema)),
    chooseSeriesProject: (sessionId: string) =>
      call("POST", `${meeting(sessionId)}/series-project`, meetingProjectSchema),
    clearSeriesProject: (sessionId: string) =>
      required(call("DELETE", `${meeting(sessionId)}/series-project`, meetingProjectSchema)),
    appendNote: (sessionId: string, lines: string[], style: NoteStyle) =>
      required(call("POST", `${meeting(sessionId)}/notes`, coachEditSchema, { lines, style })),
    addActionItem: (sessionId: string, text: string) =>
      required(call("POST", `${meeting(sessionId)}/action-items`, coachEditSchema, { text })),
    completeActionItem: (sessionId: string, taskId: string) =>
      required(
        call(
          "POST",
          `${meeting(sessionId)}/action-items/${encodeURIComponent(taskId)}/complete`,
          coachEditSchema,
        ),
      ),
    undo: (sessionId: string, editId?: string) =>
      required(call("POST", `${meeting(sessionId)}/undo`, coachEditSchema, editId ? { edit_id: editId } : {})),
    createNote: (sessionId: string, note: NewNote) => library(sessionId, "notes", undefined, note),
    updateNote: (sessionId: string, noteId: string, changes: NoteChanges) =>
      library(sessionId, "notes", noteId, changes),
    createFolder: (sessionId: string, path: string) => library(sessionId, "folders", undefined, { path }),
    createPerson: (sessionId: string, person: PersonFields) => library(sessionId, "people", undefined, person),
    updatePerson: (sessionId: string, personId: string, person: PersonFields) =>
      library(sessionId, "people", personId, person),
    createOrganization: (sessionId: string, organization: OrganizationFields) =>
      library(sessionId, "organizations", undefined, organization),
    updateOrganization: (sessionId: string, organizationId: string, organization: OrganizationFields) =>
      library(sessionId, "organizations", organizationId, organization),
    addParticipant: (sessionId: string, link: { person_id: string; note_id?: string }) =>
      library(sessionId, "participants", undefined, link),
    createTemplate: (sessionId: string, template: TemplateFields) =>
      library(sessionId, "templates", undefined, template),
    updateTemplate: (sessionId: string, templateId: string, template: TemplateFields) =>
      library(sessionId, "templates", templateId, template),
  };
}

export function appBridgeFromEnv(env: Record<string, string | undefined>): AppBridge | null {
  const url = env[APP_URL_ENV];
  const token = env[APP_TOKEN_ENV];
  return url && token ? appBridge(url, token) : null;
}
