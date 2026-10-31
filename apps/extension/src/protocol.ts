import { z } from "zod";

import { attentionSchema } from "@anlg/assistant/attention";
import {
  BROWSER_PROTOCOL_VERSION,
  BrowserFailure,
  BrowserResponseStatus,
  browserContextSchema,
} from "@anlg/assistant/browser-context";

import { adapterFor } from "./adapters";
import type { ErrorCode } from "./errors";
import { MeetingPhase } from "./lifecycle";

export enum Operation {
  CancelRecording = "cancel_recording",
  Record = "record",
  Status = "status",
  Coach = "coach",
  Attach = "attach",
  Snapshot = "snapshot",
  Poll = "poll",
  Detach = "detach",
}
// Panel frame → Meet page.
export enum PanelFrameEvent {
  Ready = "cue_panel_ready",
  Layout = "cue_panel_layout",
  Dock = "cue_panel_dock",
  Collapse = "cue_panel_collapse",
}
// Meet page → panel frame.
export enum PanelHostEvent {
  Layout = "cue_host_layout",
}

export enum PanelAction {
  DebugExport = "debug_export",
  DebugClear = "debug_clear",
  ConfirmRecording = "confirm_recording",
  DismissRecording = "dismiss_recording",
  TestHighlight = "test_highlight",
  TestAttention = "test_attention",
  Attention = "attention",
  State = "state",
  FocusMeeting = "focus_meeting",
  Coach = "coach",
  Connect = "connect",
  Disconnect = "disconnect",
  Refresh = "refresh",
  Screens = "screens",
}
export enum ContentAction {
  Observe = "observe",
  TestHighlight = "test_highlight",
  TestAttention = "test_attention",
  Attention = "attention",
  Probe = "probe",
  OpenPanel = "open_panel",
  Start = "start",
  Stop = "stop",
  Snapshot = "snapshot",
  Ended = "ended",
  Phase = "phase",
}
export enum ConnectionState {
  Offline = "offline",
  Ready = "ready",
  Connected = "connected",
  Connecting = "connecting",
}

export const cueSchema = z.object({
  sequence: z.number().int().nonnegative(),
  tag: z.string().max(128),
  line: z.string().max(4096),
});
export enum ReplyKind {
  Recording = "recording",
  Attached = "attached",
  Accepted = "accepted",
  Cues = "cues",
}

export const replySchema = z.object({
  version: z.literal(BROWSER_PROTOCOL_VERSION),
  request_id: z.string(),
  result: z.discriminatedUnion("status", [
    z.object({
      status: z.literal(BrowserResponseStatus.Error),
      error: z.enum(BrowserFailure),
    }),
    z.object({
      status: z.literal(BrowserResponseStatus.Ok),
      reply: z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal(ReplyKind.Recording),
          session_id: z.string(),
        }),
        z.object({
          kind: z.literal(Operation.Coach),
          url: z.string().url(),
          token: z.string().min(32),
        }),
        z.object({
          kind: z.literal(Operation.Status),
          active_session_id: z.string().nullable(),
          active_session_title: z.string().nullable().optional(),
          active_meeting_url: z.string().nullable().optional(),
          paused: z.boolean().optional(),
          recording_supported: z.boolean().optional(),
        }),
        z.object({
          kind: z.literal(ReplyKind.Attached),
          binding_id: z.string(),
        }),
        z.object({ kind: z.literal(ReplyKind.Accepted) }),
        z.object({
          kind: z.literal(ReplyKind.Cues),
          cues: z.array(cueSchema).max(20),
        }),
      ]),
    }),
  ]),
});
export const snapshotSchema = browserContextSchema.shape.context;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Cue = z.infer<typeof cueSchema>;
export type NativeReply = Extract<
  z.infer<typeof replySchema>["result"],
  { status: BrowserResponseStatus.Ok }
>["reply"];

export const contentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal(ContentAction.Phase),
    generation: z.string(),
    phase: z.enum(MeetingPhase),
  }),
  z.object({
    kind: z.literal(ContentAction.Snapshot),
    generation: z.string(),
    meeting_url: z.string(),
    context: snapshotSchema,
  }),
  z.object({ kind: z.literal(ContentAction.Ended), generation: z.string() }),
]);
export const panelActionSchema = z.object({
  action: z.enum(PanelAction),
  offerId: z.string().optional(),
  useCurrent: z.boolean().optional(),
  attention: attentionSchema.optional(),
  windowId: z.number().int().nonnegative().optional(),
  screens: z.boolean().optional(),
  generation: z.string().optional(),
});

export enum AppLinkState {
  Checking = "checking",
  Online = "online",
  Offline = "offline",
}

export type RecordingOffer = {
  id: string;
  meetingUrl: string;
  expectedSession: string | null;
  title: string;
  recordingTitle: string | null;
  canUseCurrent: boolean;
  paused: boolean;
};
export enum RecordingChoice {
  Current = "current",
  New = "new",
}

export function recordingOfferView(offer: RecordingOffer) {
  if (!offer.expectedSession)
    return {
      question: "Record this meeting?",
      detail: "Cue will record this call and connect your coach.",
      newLabel: "Start recording",
      currentLabel: null,
      primary: RecordingChoice.New,
    };
  const recording = offer.recordingTitle
    ? `“${offer.recordingTitle}”`
    : "an untitled recording";
  if (offer.canUseCurrent)
    return offer.paused
      ? {
          question: "Resume this recording?",
          detail: `Cue paused ${recording}. Resume it for this call, or finish it and record this call separately.`,
          newLabel: "Record separately",
          currentLabel: "Resume recording",
          primary: RecordingChoice.Current,
        }
      : {
          question: "Use Cue’s current recording?",
          detail: `Cue is already recording ${recording}. Connect it to this call, or finish it and record this call separately.`,
          newLabel: "Record separately",
          currentLabel: "Use current recording",
          primary: RecordingChoice.Current,
        };
  return {
    question: "Record this meeting separately?",
    detail: `Cue is recording ${recording} for another call. Finish it and start a new recording for this call?`,
    newLabel: "Finish current & record this",
    currentLabel: null,
    primary: RecordingChoice.New,
  };
}

export type PanelState = {
  recordingOffer?: RecordingOffer | null;
  appLink: {
    status: AppLinkState;
    host: string;
    checkedAt: number | null;
    latencyMs: number | null;
    error: string | null;
    errorCode: ErrorCode | null;
  };
  errorCode: ErrorCode | null;
  connection: ConnectionState;
  error: string | null;
  activeSession: string | null;
  generation: string | null;
  tabId: number | null;
  title: string;
  screens: boolean;
  phase: MeetingPhase;
  recordingTitle: string | null;
  coverage: {
    captions: string;
    chat: string;
    participants: number;
    screen: boolean;
  } | null;
  cues: (Cue & { receivedAt: number })[];
};

export function meetingUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return adapterFor(value)?.meetingUrl(url) ?? null;
  } catch {
    return null;
  }
}

export function panelStateForTab(
  state: PanelState,
  tabId?: number,
): PanelState {
  if (tabId === undefined || state.tabId === tabId || state.tabId === null)
    return state;
  return {
    ...state,
    connection: ConnectionState.Ready,
    generation: null,
    tabId: null,
    title: "",
    coverage: null,
    cues: [],
    error: null,
    errorCode: null,
    phase: MeetingPhase.Unknown,
  };
}
