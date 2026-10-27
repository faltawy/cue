import { WrapUpState, type WrapUpView } from "./protocol";

export enum StripState {
  Waiting = "waiting",
  Live = "live",
}

export type MeetingPointer = {
  sessionId: string;
  transcriptId: string;
  live: boolean;
};

export function meetingPointer(
  transcript: { sessionId: string; transcriptId: string; live: boolean } | null,
): MeetingPointer | null {
  return transcript
    ? {
        sessionId: transcript.sessionId,
        transcriptId: transcript.transcriptId,
        live: transcript.live,
      }
    : null;
}

export type MeetingChange = { newChat: boolean; wrapUp: boolean };

export function meetingChange(
  attached: MeetingPointer | null,
  next: MeetingPointer | null,
  wrapped: ReadonlySet<string>,
): MeetingChange {
  const newChat =
    next !== null && next.live && next.sessionId !== attached?.sessionId;
  const wrapUp =
    attached !== null &&
    next !== null &&
    attached.transcriptId === next.transcriptId &&
    attached.live &&
    !next.live &&
    !wrapped.has(next.transcriptId);
  return { newChat, wrapUp };
}

export type StripView =
  | {
      state: StripState.Waiting;
      lastTitle: string | null;
      endedAt: number | null;
    }
  | {
      state: StripState.Live;
      title: string;
      startedAt: number | null;
      paused?: boolean;
    };

export function stripView(
  transcript: {
    title: string | null;
    paused?: boolean;
    live: boolean;
    startedAtMs: number | null;
    endedAtMs: number | null;
  } | null,
): StripView {
  if (!transcript)
    return { state: StripState.Waiting, lastTitle: null, endedAt: null };
  if (!transcript.live)
    return {
      state: StripState.Waiting,
      lastTitle: transcript.title || "Untitled",
      endedAt: transcript.endedAtMs,
    };
  return {
    state: StripState.Live,
    title: transcript.title || "Untitled",
    startedAt: transcript.startedAtMs,
    ...(transcript.paused ? { paused: true } : {}),
  };
}

export type WrapUpAction = { enabled: boolean; hint: string | null };

export type WrapUpActions = {
  addActionItems: WrapUpAction;
  logToClients: WrapUpAction;
};

export const CLIENTS_SERVER = "clients";

export function wrapUpActions(options: {
  appConnected: boolean;
  mcpServers: readonly string[];
  allowChanges: readonly string[];
  commitments: number;
}): WrapUpActions {
  const nothing = options.commitments === 0 ? "No commitments to add" : null;
  const addActionItems: WrapUpAction = !options.appConnected
    ? {
        enabled: false,
        hint: "Open the coach from the app to add action items",
      }
    : { enabled: nothing === null, hint: nothing };

  let logToClients: WrapUpAction;
  if (!options.mcpServers.includes(CLIENTS_SERVER)) {
    logToClients = {
      enabled: false,
      hint: `Add a tool named “${CLIENTS_SERVER}” in Settings → AI → Tools to log promises`,
    };
  } else if (!options.allowChanges.includes(CLIENTS_SERVER)) {
    logToClients = {
      enabled: false,
      hint: `Turn on Allow changes for “${CLIENTS_SERVER}” in Settings → AI → Tools to log promises`,
    };
  } else {
    logToClients = { enabled: nothing === null, hint: nothing };
  }
  return { addActionItems, logToClients };
}

export function isAnswering(
  busy: boolean,
  wrapUp: WrapUpView | null,
  suggesting = false,
): boolean {
  return busy || suggesting || wrapUp?.state === WrapUpState.Running;
}
