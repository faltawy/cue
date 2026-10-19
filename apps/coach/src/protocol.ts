import type { CoachEdit, MeetingProject } from "./app-bridge";
import type { CoachError } from "./errors";
import type { StripView, WrapUpActions } from "./meeting-state";
import type { ProactiveView } from "./proactive";
import type { Question } from "./questions";
import type { TurnUsage } from "./usage";
import type { WrapUp } from "./wrapup";

export type TurnKind = "ask" | "nudge" | "catchup";
export type ResetReason = "meeting" | "manual" | "project" | "sync";

export type ProjectView = {
  path: string;
  source: MeetingProject["source"];
  series: string | null;
  defaultProject: string;
};

export type WrapUpView =
  | { state: "running"; title: string | null }
  | {
      state: "ready";
      title: string | null;
      wrapUp: WrapUp;
      commitments: string[];
      actions: WrapUpActions;
      added: boolean;
      logged: boolean;
    }
  | { state: "failed"; title: string | null; message: string };

export type TranscriptLineView = { speaker: string; you: boolean; text: string };

export type StatusEvent = {
  type: "status";
  project: ProjectView;
  model: string;
  busy: boolean;
  appConnected: boolean;
  meeting: boolean;
  proactive: ProactiveView;
};

export type CoachEvent =
  | StatusEvent
  | { type: "reset"; reason: ResetReason }
  | { type: "divider"; text: string }
  | { type: "user"; kind: TurnKind; text: string }
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; label: string; activeLabel: string; detail: string | null }
  | { type: "tool_result"; id: string; ok: boolean; output: string | null; durationMs: number | null }
  | { type: "question"; id: string; questions: Question[] }
  | { type: "question_closed"; id: string; answered: boolean }
  | { type: "usage"; usage: TurnUsage }
  | { type: "error"; error: CoachError }
  | { type: "done"; seconds: number; ok: boolean; silent: boolean; interrupted: boolean }
  | { type: "edit"; edit: CoachEdit }
  | { type: "undone"; id: string; summary: string }
  | { type: "notice"; text: string }
  | { type: "wrapup"; wrapUp: WrapUpView | null }
  | { type: "transcript"; strip: StripView; lines: TranscriptLineView[]; pending: string };

export const FEED_EVENTS: ReadonlySet<CoachEvent["type"]> = new Set([
  "divider",
  "user",
  "text",
  "tool",
  "tool_result",
  "question",
  "question_closed",
  "usage",
  "error",
  "done",
  "edit",
  "undone",
  "notice",
]);

export function appendHistory(history: CoachEvent[], event: CoachEvent): CoachEvent[] {
  if (!FEED_EVENTS.has(event.type)) return history;
  const last = history.at(-1);
  if (event.type === "text" && last?.type === "text") {
    return [...history.slice(0, -1), { type: "text", delta: last.delta + event.delta }];
  }
  return [...history, event];
}

export function dropSilentNudge(history: CoachEvent[]): CoachEvent[] {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const event = history[index];
    if (event?.type === "user") return event.kind === "nudge" ? history.slice(0, index) : history;
  }
  return history;
}
