import { z } from "zod";

export const APP_URL_ENV = "ANARLOG_COACH_APP_URL";
export const APP_TOKEN_ENV = "ANARLOG_COACH_APP_TOKEN";

const coachEditSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  kind: z.enum(["note", "add_action_item", "complete_action_item"]),
  summary: z.string(),
  task_id: z.string().nullable(),
});

export type CoachEdit = z.infer<typeof coachEditSchema>;

const meetingProjectSchema = z.object({
  session_id: z.string(),
  series: z.object({ key: z.string(), label: z.string() }).nullable(),
  project: z.string(),
  source: z.enum(["series", "default"]),
  default_project: z.string(),
});

export type MeetingProject = z.infer<typeof meetingProjectSchema>;

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

  return {
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
  };
}

export function appBridgeFromEnv(env: Record<string, string | undefined>): AppBridge | null {
  const url = env[APP_URL_ENV];
  const token = env[APP_TOKEN_ENV];
  return url && token ? appBridge(url, token) : null;
}
