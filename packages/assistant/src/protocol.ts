import { type CoachEdit, type MeetingProject } from "./app-bridge";
import { type Attention } from "./attention";
import { type Block } from "./blocks";
import { type MeetingCoaching } from "./coaching-preferences";
import { type CoachError } from "./errors";
import { type ImageThumb } from "./image-limits";
import { type StripView, type WrapUpActions } from "./meeting-state";
import { type ProactiveView } from "./proactive";
import { type CoachProvider } from "./provider";
import { type Question } from "./questions";
import { type Source } from "./sources";
import { type TalkStats } from "./talk-time";
import { type TurnUsage } from "./usage";
import { type WrapUp } from "./wrapup";

export enum SetupState {
  Checking = "checking",
  Downloading = "downloading",
  Failed = "failed",
  Ready = "ready",
}

export enum WrapUpState {
  Running = "running",
  Ready = "ready",
  Failed = "failed",
}

export enum CoachEventType {
  Status = "status",
  Reset = "reset",
  Divider = "divider",
  User = "user",
  Text = "text",
  Tool = "tool",
  ToolResult = "tool_result",
  Question = "question",
  QuestionClosed = "question_closed",
  Usage = "usage",
  Error = "error",
  Done = "done",
  Edit = "edit",
  Attention = "attention",
  Block = "block",
  BlockCheck = "block_check",
  Sources = "sources",
  Talk = "talk",
  Undone = "undone",
  Notice = "notice",
  Wrapup = "wrapup",
  Transcript = "transcript",
}

export enum TurnKind {
  Ask = "ask",
  Nudge = "nudge",
  Catchup = "catchup",
}
export enum ResetReason {
  Meeting = "meeting",
  Manual = "manual",
  Project = "project",
  Sync = "sync",
}

export type ProjectView = {
  path: string;
  source: MeetingProject["source"];
  series: string | null;
  defaultProject: string;
  needsFolder: boolean;
};

export type WrapUpView =
  | { state: WrapUpState.Running; title: string | null }
  | {
      state: WrapUpState.Ready;
      title: string | null;
      sessionId?: string;
      wrapUp: WrapUp;
      commitments: string[];
      actions: WrapUpActions;
      added: boolean;
      logged: boolean;
      talk: TalkStats | null;
    }
  | { state: WrapUpState.Failed; title: string | null; message: string };

export type TranscriptLineView = {
  speaker: string;
  you: boolean;
  text: string;
};

/** Getting Claude Code ready: the person's own, or Cue's copy downloaded on first use. */
export type SetupView =
  | { state: SetupState.Checking }
  | { state: SetupState.Downloading; percent: number | null }
  | { state: SetupState.Failed; message: string }
  | { state: SetupState.Ready };

export type StatusEvent = {
  type: CoachEventType.Status;
  provider?: CoachProvider;
  project: ProjectView;
  model: string;
  busy: boolean;
  appConnected: boolean;
  meeting: boolean;
  proactive: ProactiveView;
  coaching?: MeetingCoaching & { sessionId: string };
  setup: SetupView;
};

export type BlockItemRef = { id: string; index: number };

export type CoachEvent =
  | { type: CoachEventType.Attention; attention: Attention }
  | StatusEvent
  | { type: CoachEventType.Reset; reason: ResetReason }
  | { type: CoachEventType.Divider; text: string }
  | {
      type: CoachEventType.User;
      kind: TurnKind;
      text: string;
      images?: ImageThumb[];
    }
  | { type: CoachEventType.Text; delta: string }
  | {
      type: CoachEventType.Tool;
      id: string;
      name: string;
      label: string;
      activeLabel: string;
      detail: string | null;
    }
  | {
      type: CoachEventType.ToolResult;
      id: string;
      ok: boolean;
      output: string | null;
      durationMs: number | null;
    }
  | { type: CoachEventType.Question; id: string; questions: Question[] }
  | { type: CoachEventType.QuestionClosed; id: string; answered: boolean }
  | { type: CoachEventType.Usage; usage: TurnUsage }
  | { type: CoachEventType.Error; error: CoachError }
  | {
      type: CoachEventType.Done;
      seconds: number;
      ok: boolean;
      silent: boolean;
      interrupted: boolean;
    }
  | { type: CoachEventType.Edit; edit: CoachEdit; block?: BlockItemRef }
  | { type: CoachEventType.Block; id: string; block: Block }
  | {
      type: CoachEventType.BlockCheck;
      id: string;
      index: number;
      checked: boolean;
    }
  | { type: CoachEventType.Sources; sources: Source[] }
  | { type: CoachEventType.Talk; talk: TalkStats }
  | { type: CoachEventType.Undone; id: string; summary: string }
  | { type: CoachEventType.Notice; text: string }
  | { type: CoachEventType.Wrapup; wrapUp: WrapUpView | null }
  | {
      type: CoachEventType.Transcript;
      strip: StripView;
      lines: TranscriptLineView[];
      pending: string;
    };

export const FEED_EVENTS: ReadonlySet<CoachEvent["type"]> =
  new Set<CoachEventType>([
    CoachEventType.Divider,
    CoachEventType.User,
    CoachEventType.Text,
    CoachEventType.Tool,
    CoachEventType.ToolResult,
    CoachEventType.Question,
    CoachEventType.QuestionClosed,
    CoachEventType.Usage,
    CoachEventType.Error,
    CoachEventType.Done,
    CoachEventType.Edit,
    CoachEventType.Undone,
    CoachEventType.Notice,
    CoachEventType.Block,
    CoachEventType.BlockCheck,
    CoachEventType.Sources,
    CoachEventType.Talk,
  ]);

export function appendHistory(
  history: CoachEvent[],
  event: CoachEvent,
): CoachEvent[] {
  if (!FEED_EVENTS.has(event.type)) return history;
  const last = history.at(-1);
  if (
    event.type === CoachEventType.Text &&
    last?.type === CoachEventType.Text
  ) {
    return [
      ...history.slice(0, -1),
      { type: CoachEventType.Text, delta: last.delta + event.delta },
    ];
  }
  return [...history, event];
}

export function findBlock(
  history: readonly CoachEvent[],
  id: string,
): Block | null {
  for (const event of history)
    if (event.type === CoachEventType.Block && event.id === id)
      return event.block;
  return null;
}

export function addedBlockItem(
  history: readonly CoachEvent[],
  ref: BlockItemRef,
): string | null {
  let editId: string | null = null;
  for (const event of history) {
    if (
      event.type === CoachEventType.Edit &&
      event.block?.id === ref.id &&
      event.block.index === ref.index
    )
      editId = event.edit.id;
    else if (event.type === CoachEventType.Undone && event.id === editId)
      editId = null;
  }
  return editId;
}

export function dropSilentNudge(history: CoachEvent[]): CoachEvent[] {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const event = history[index];
    if (event?.type === CoachEventType.User)
      return event.kind === TurnKind.Nudge ? history.slice(0, index) : history;
  }
  return history;
}
