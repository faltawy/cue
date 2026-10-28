import { z } from "zod";

import { browserContextSchema } from "./browser-context";
import { AssistantScope } from "./scope";

export enum CoachEditKind {
  Note = "note",
  AddActionItem = "add_action_item",
  CompleteActionItem = "complete_action_item",
  CreateNote = "create_note",
  UpdateNote = "update_note",
  CreateFolder = "create_folder",
  CreatePerson = "create_person",
  UpdatePerson = "update_person",
  CreateOrganization = "create_organization",
  UpdateOrganization = "update_organization",
  AddParticipant = "add_participant",
  CreateTemplate = "create_template",
  UpdateTemplate = "update_template",
  AssignSpeaker = "assign_speaker",
  CorrectTranscript = "correct_transcript",
}

export enum ProjectSource {
  Series = "series",
  Default = "default",
}

export enum RecordingPauseAction {
  Pause = "pause",
  Resume = "resume",
}

export enum DictationAction {
  Start = "start",
  Stop = "stop",
  Cancel = "cancel",
}

export const APP_URL_ENV = "CUE_COACH_APP_URL";
export const APP_TOKEN_ENV = "CUE_COACH_APP_TOKEN";

export const EDIT_KINDS = Object.values(CoachEditKind);

const coachEditSchema = z.object({
  id: z.string(),
  session_id: z.string().nullable(),
  kind: z.enum(CoachEditKind),
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

export type NewNote = {
  title: string;
  folder?: string;
  content_markdown?: string;
};
export type NoteChanges = {
  title?: string;
  folder?: string;
  add_tags?: string[];
  remove_tags?: string[];
};
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
  source: z.enum(ProjectSource),
  default_project: z.string(),
});

export type MeetingProject = z.infer<typeof meetingProjectSchema>;

const recordingSchema = z.object({
  session_ids: z.array(z.string()),
  paused_session_ids: z.array(z.string()).default([]),
});

export type TranscriptCorrection = {
  word_ids: string[];
  expected_text: string;
  replacement: string;
};

export enum NoteStyle {
  Paragraphs = "paragraphs",
  Bullets = "bullets",
}

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

export function appBridge(
  url: string,
  token: string,
  scope = AssistantScope.Meeting,
) {
  async function call<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T | null> {
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
      throw new BridgeError(
        response.status,
        parsed.success
          ? parsed.data.error
          : `the app answered ${response.status}`,
      );
    }
    return schema.parse(json);
  }

  async function required<T>(result: Promise<T | null>): Promise<T> {
    const value = await result;
    if (value === null) throw new BridgeError(204, "the app returned nothing");
    return value;
  }

  const meeting = (sessionId: string) =>
    `/meeting/${encodeURIComponent(sessionId)}`;
  const editingMeeting = (sessionId: string) =>
    `${scope === AssistantScope.Library ? "/library" : ""}${meeting(sessionId)}`;
  const library = (
    sessionId: string | undefined,
    path: string,
    id?: string,
    body?: unknown,
  ) =>
    required(
      call(
        "POST",
        `${scope === AssistantScope.Library ? "/library" : `${meeting(sessionId ?? "")}/library`}/${path}${id === undefined ? "" : `/${encodeURIComponent(id)}`}`,
        libraryChangeSchema,
        body,
      ),
    );

  return {
    setRecordingPaused: (sessionId: string, action: RecordingPauseAction) =>
      required(
        call(
          "POST",
          `${meeting(sessionId)}/recording/${action}`,
          z.object({ paused: z.boolean() }),
        ),
      ),
    stopRecording: (sessionId: string) =>
      required(
        call(
          "POST",
          `${meeting(sessionId)}/recording/stop`,
          z.object({ stopped: z.boolean() }),
        ),
      ),
    dictation: (recordingId: string, action: DictationAction) =>
      required(
        call("POST", "/dictation", z.object({ text: z.string().nullable() }), {
          recording_id: recordingId,
          action,
        }),
      ),
    browserContext: (sessionId: string) =>
      call(
        "GET",
        `${meeting(sessionId)}/browser-context`,
        browserContextSchema.nullable(),
      ),
    recordingState: () => required(call("GET", "/recording", recordingSchema)),
    recordingSessions: async (): Promise<ReadonlySet<string>> =>
      new Set(
        (await required(call("GET", "/recording", recordingSchema)))
          .session_ids,
      ),
    chooseDefaultProject: () => call("POST", "/project", z.null()),
    nudged: (sessionId: string, nudge: { tag: string; line: string }) =>
      call("POST", `${meeting(sessionId)}/nudge`, z.null(), nudge),
    evidence: (target: { sessionId: string; timestampMs: number }) =>
      call("POST", `${meeting(target.sessionId)}/evidence`, z.null(), {
        timestamp_ms: target.timestampMs,
      }),
    meetingProject: (sessionId: string) =>
      required(
        call("GET", `${meeting(sessionId)}/project`, meetingProjectSchema),
      ),
    chooseSeriesProject: (sessionId: string) =>
      call(
        "POST",
        `${meeting(sessionId)}/series-project`,
        meetingProjectSchema,
      ),
    clearSeriesProject: (sessionId: string) =>
      required(
        call(
          "DELETE",
          `${meeting(sessionId)}/series-project`,
          meetingProjectSchema,
        ),
      ),
    appendNote: (sessionId: string, lines: string[], style: NoteStyle) =>
      required(
        call("POST", `${editingMeeting(sessionId)}/notes`, coachEditSchema, {
          lines,
          style,
        }),
      ),
    addActionItem: (sessionId: string, text: string) =>
      required(
        call(
          "POST",
          `${editingMeeting(sessionId)}/action-items`,
          coachEditSchema,
          {
            text,
          },
        ),
      ),
    assignTranscriptSpeaker: (
      sessionId: string,
      assignment: { channel: number; speaker_index: number; human_id: string },
    ) =>
      required(
        call(
          "POST",
          `${editingMeeting(sessionId)}/transcript/speakers`,
          coachEditSchema,
          assignment,
        ),
      ),
    correctTranscript: (sessionId: string, correction: TranscriptCorrection) =>
      required(
        call(
          "POST",
          `${editingMeeting(sessionId)}/transcript/corrections`,
          coachEditSchema,
          correction,
        ),
      ),
    completeActionItem: (sessionId: string, taskId: string) =>
      required(
        call(
          "POST",
          `${editingMeeting(sessionId)}/action-items/${encodeURIComponent(taskId)}/complete`,
          coachEditSchema,
        ),
      ),
    undo: (sessionId: string | undefined, editId?: string) =>
      required(
        call(
          "POST",
          scope === AssistantScope.Library
            ? "/library/undo"
            : `${meeting(sessionId ?? "")}/undo`,
          coachEditSchema,
          editId ? { edit_id: editId } : {},
        ),
      ),
    createNote: (sessionId: string | undefined, note: NewNote) =>
      library(sessionId, "notes", undefined, note),
    updateNote: (
      sessionId: string | undefined,
      noteId: string,
      changes: NoteChanges,
    ) => library(sessionId, "notes", noteId, changes),
    createFolder: (sessionId: string | undefined, path: string) =>
      library(sessionId, "folders", undefined, { path }),
    createPerson: (sessionId: string | undefined, person: PersonFields) =>
      library(sessionId, "people", undefined, person),
    updatePerson: (
      sessionId: string | undefined,
      personId: string,
      person: PersonFields,
    ) => library(sessionId, "people", personId, person),
    createOrganization: (
      sessionId: string | undefined,
      organization: OrganizationFields,
    ) => library(sessionId, "organizations", undefined, organization),
    updateOrganization: (
      sessionId: string | undefined,
      organizationId: string,
      organization: OrganizationFields,
    ) => library(sessionId, "organizations", organizationId, organization),
    addParticipant: (
      sessionId: string | undefined,
      link: { person_id: string; note_id?: string },
    ) => library(sessionId, "participants", undefined, link),
    createTemplate: (sessionId: string | undefined, template: TemplateFields) =>
      library(sessionId, "templates", undefined, template),
    updateTemplate: (
      sessionId: string | undefined,
      templateId: string,
      template: TemplateFields,
    ) => library(sessionId, "templates", templateId, template),
  };
}

export function appBridgeFromEnv(
  env: Record<string, string | undefined>,
  scope = AssistantScope.Meeting,
): AppBridge | null {
  const url = env[APP_URL_ENV];
  const token = env[APP_TOKEN_ENV];
  return url && token ? appBridge(url, token, scope) : null;
}
