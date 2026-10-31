import { CaptureAvailability } from "@anlg/assistant/browser-context";

import { ErrorCode } from "../src/errors";
import { MeetingPhase } from "../src/lifecycle";
import {
  AppLinkState,
  ConnectionState,
  type PanelState,
  type RecordingOffer,
} from "../src/protocol";

export enum PanelScenario {
  Connected = "connected",
  Idle = "idle",
  Offer = "offer",
  OfferCurrent = "offer-current",
  OfferOther = "offer-other",
  Connecting = "connecting",
  Offline = "offline",
}

const base = (): PanelState => ({
  recordingOffer: null,
  appLink: {
    status: AppLinkState.Online,
    host: "com.hyprnote.dev.browser",
    checkedAt: Date.now(),
    latencyMs: 12,
    error: null,
    errorCode: null,
  },
  errorCode: null,
  connection: ConnectionState.Ready,
  error: null,
  activeSession: null,
  generation: null,
  tabId: 1,
  title: "Wafeq weekly sync",
  screens: true,
  phase: MeetingPhase.InMeeting,
  recordingTitle: null,
  coverage: null,
  cues: [],
});

const offer = (patch: Partial<RecordingOffer>): RecordingOffer => ({
  id: "offer-1",
  meetingUrl: "https://meet.google.com/dbv-eksv-byu",
  expectedSession: "session-a",
  title: "Wafeq weekly sync",
  recordingTitle: "Wafeq weekly sync",
  canUseCurrent: true,
  paused: false,
  ...patch,
});

export const connectedState = (): PanelState => ({
  ...base(),
  connection: ConnectionState.Connected,
  generation: "preview",
  activeSession: "session-a",
  recordingTitle: "Wafeq weekly sync",
  coverage: {
    captions: CaptureAvailability.Available,
    chat: CaptureAvailability.Available,
    participants: 3,
    screen: false,
  },
});

export function panelFixture(name: string | null): PanelState {
  switch (name) {
    case PanelScenario.Idle:
      return base();
    case PanelScenario.Offer:
      return { ...base(), recordingOffer: offer({ expectedSession: null }) };
    case PanelScenario.OfferCurrent:
      return { ...base(), recordingOffer: offer({}) };
    case PanelScenario.OfferOther:
      return { ...base(), recordingOffer: offer({ canUseCurrent: false }) };
    case PanelScenario.Connecting:
      return { ...base(), connection: ConnectionState.Connecting };
    case PanelScenario.Offline:
      return {
        ...base(),
        appLink: {
          ...base().appLink,
          status: AppLinkState.Offline,
          latencyMs: null,
          error: "Open Cue on this Mac, then retry.",
          errorCode: ErrorCode.AppOffline,
        },
      };
    default:
      return connectedState();
  }
}
