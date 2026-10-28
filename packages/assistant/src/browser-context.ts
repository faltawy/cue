import { z } from "zod";

export const BROWSER_PROTOCOL_VERSION = 1;

export enum BrowserResponseStatus {
  Ok = "ok",
  Error = "error",
}

export enum BrowserFailure {
  InvalidRequest = "invalid_request",
  UnsupportedVersion = "unsupported_version",
  NoActiveMeeting = "no_active_meeting",
  MeetingChanged = "meeting_changed",
  AlreadyAttached = "already_attached",
  BindingExpired = "binding_expired",
  OutOfOrder = "out_of_order",
  AppUnavailable = "app_unavailable",
  Unauthorized = "unauthorized",
  InvalidMessage = "invalid_message",
}

export enum BrowserEventKind {
  Caption = "caption",
  Chat = "chat",
  Reaction = "reaction",
  HandRaised = "hand_raised",
  ParticipantJoined = "participant_joined",
  ParticipantLeft = "participant_left",
  PresentationStarted = "presentation_started",
  PresentationEnded = "presentation_ended",
}

export enum CaptureAvailability {
  Available = "available",
  Disabled = "disabled",
  Unavailable = "unavailable",
}

export const browserContextSchema = z.object({
  meeting_url: z.string(),
  sequence: z.number().int().nonnegative(),
  context: z.object({
    title: z.string(),
    captions: z.enum(CaptureAvailability),
    chat: z.enum(CaptureAvailability),
    participants: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        speaking: z.boolean(),
        presenting: z.boolean(),
      }),
    ),
    events: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(BrowserEventKind),
        timestamp_ms: z.number(),
        participant_id: z.string().nullable(),
        text: z.string(),
      }),
    ),
    presentation: z
      .object({ timestamp_ms: z.number(), jpeg_base64: z.string() })
      .nullable(),
  }),
});
