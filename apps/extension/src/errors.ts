import { BrowserFailure } from "@anlg/assistant/browser-context";

export enum ErrorCode {
  HostMissing = "CUE_HOST_NOT_FOUND",
  HostDenied = "CUE_HOST_ACCESS_DENIED",
  HostDisconnected = "CUE_HOST_DISCONNECTED",
  Timeout = "CUE_APP_TIMEOUT",
  AppOffline = "CUE_APP_OFFLINE",
  Protocol = "CUE_PROTOCOL_MISMATCH",
  Setup = "CUE_SETUP_INVALID",
  NoRecording = "CUE_NO_RECORDING",
  MeetingChanged = "CUE_MEETING_CHANGED",
  AlreadyAttached = "CUE_MEETING_ALREADY_CONNECTED",
  TabMissing = "MEET_TAB_NOT_FOUND",
  UrlUnavailable = "MEET_URL_UNAVAILABLE",
  UrlUnsupported = "MEET_URL_UNSUPPORTED",
  PageUnavailable = "MEET_PAGE_UNREACHABLE",
  NotJoined = "MEET_NOT_JOINED",
  PhaseUnknown = "MEET_STATE_UNKNOWN",
  ExtensionRestarted = "CUE_EXTENSION_RESTARTED",
  CoachMeetingMismatch = "COACH_MEETING_MISMATCH",
  CoachBindingExpired = "COACH_BINDING_EXPIRED",
  CoachStreamUnavailable = "COACH_STREAM_UNAVAILABLE",
  RequestFailed = "CUE_REQUEST_FAILED",
}

export class ExtensionError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function nativeDisconnect(message?: string) {
  if (message?.includes("not found"))
    return new ExtensionError(
      ErrorCode.HostMissing,
      "Browser setup is missing. In Cue, open Settings → Meetings → Set up Brave extension, then retry.",
    );
  if (message?.includes("forbidden"))
    return new ExtensionError(
      ErrorCode.HostDenied,
      "Brave refused access to Cue. Run browser setup again in Cue to register this extension.",
    );
  return new ExtensionError(
    ErrorCode.HostDisconnected,
    message
      ? `Native connection closed: ${message} Open Cue and retry.`
      : "The native connection closed. Open Cue and retry.",
  );
}

export function diagnostic(error: unknown): {
  code: ErrorCode;
  message: string;
} {
  if (error instanceof ExtensionError)
    return { code: error.code, message: error.message };
  const message =
    error instanceof Error
      ? error.message
      : "Unexpected connection failure. Retry and report this code if it continues.";
  switch (message) {
    case BrowserFailure.NoActiveMeeting:
      return {
        code: ErrorCode.NoRecording,
        message:
          "Cue is reachable, but no recording is active. Start recording this meeting in Cue, then connect.",
      };
    case BrowserFailure.AppUnavailable:
      return {
        code: ErrorCode.AppOffline,
        message:
          "The Cue app is not responding. Open Cue; this panel checks again automatically.",
      };
    case BrowserFailure.AlreadyAttached:
      return {
        code: ErrorCode.AlreadyAttached,
        message:
          "Another meeting tab is connected. Disconnect that meeting first.",
      };
    case BrowserFailure.MeetingChanged:
    case BrowserFailure.BindingExpired:
      return {
        code: ErrorCode.MeetingChanged,
        message:
          "The recording changed, paused, or the connection expired. Connect this meeting again when ready.",
      };
    case BrowserFailure.Unauthorized:
      return {
        code: ErrorCode.HostDenied,
        message:
          "Cue refused this connection. Run browser setup again in Cue, then retry.",
      };
    case BrowserFailure.UnsupportedVersion:
      return {
        code: ErrorCode.Protocol,
        message:
          "Update Cue and prepare the extension again; their protocol versions differ.",
      };
    default:
      return { code: ErrorCode.RequestFailed, message };
  }
}
