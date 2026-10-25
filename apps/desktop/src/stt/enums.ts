export enum BatchPhase {
  Importing = "importing",
  Transcribing = "transcribing",
}

export enum PostCaptureRepairReason {
  LiveTranscriptionUnavailable = "live_transcription_unavailable",
  LiveStreamIncomplete = "live_stream_incomplete",
  SettledSpeakerDiarization = "settled_speaker_diarization",
  TranscriptPersistenceFailed = "transcript_persistence_failed",
}

export enum DisclosureDelivery {
  Sent = "sent",
  NotSent = "not_sent",
  Cancelled = "cancelled",
}

export enum DisclosurePlatform {
  SlackHuddle = "slack_huddle",
  Zoom = "zoom",
  GoogleMeet = "google_meet",
  Teams = "teams",
  Webex = "webex",
  Browser = "browser",
  Unknown = "unknown",
}

export enum ParticipantConsentStatus {
  Unknown = "unknown",
  Consented = "consented",
  Declined = "declined",
}

export enum ParticipantConsentSource {
  ExplicitChatReply = "explicit_chat_reply",
  ExplicitUi = "explicit_ui",
  Unseen = "unseen",
}

export enum SessionListeningPolicy {
  Continue = "continue",
  StopDeclined = "stop_declined",
}

export enum AutomaticMeetingBlockReason {
  MissingAttendance = "missing_attendance",
  InvalidAttendance = "invalid_attendance",
  StaleAttendance = "stale_attendance",
  FutureAttendance = "future_attendance",
  SelfDeclined = "self_declined",
  SelfTentative = "self_tentative",
  SelfPending = "self_pending",
  SelfUnknown = "self_unknown",
  AllOthersDeclined = "all_others_declined",
}

export enum StartFailureStage {
  RecoveryMarker = "recovery_marker",
  CaptureStart = "capture_start",
  CaptureRejected = "capture_rejected",
}

export enum StartFailureKind {
  AlreadyRunning = "already_running",
  Storage = "storage",
  MicrophonePermission = "microphone_permission",
  Recorder = "recorder",
}

export enum TranscriptTimingSource {
  ProviderWord = "provider_word",
  ProviderSegmentInterpolated = "provider_segment_interpolated",
  SyntheticText = "synthetic_text",
}

export enum ListenerControlAction {
  Start = "start",
  Stop = "stop",
}

export enum ListeningStatus {
  Listening = "listening",
  Finalizing = "finalizing",
}

export enum TranscriptSelectionAction {
  Copy = "copy",
  Play = "play",
}

export enum AssignmentMode {
  All = "all",
  Segment = "segment",
}

export enum TranscriptScrollTarget {
  Top = "top",
  Bottom = "bottom",
}

export enum TranscriptWriteMode {
  Append = "append",
  Replace = "replace",
}

export enum ScheduledAutoStartAction {
  Start = "start",
  Retry = "retry",
  Skip = "skip",
}

export enum ScheduledAutoStartResult {
  Started = "started",
  Ignored = "ignored",
  Blocked = "blocked",
  Ineligible = "ineligible",
}

export enum UploadKind {
  Audio = "audio",
  Transcript = "transcript",
}

export enum MeetingDisclosureStatus {
  Sent = "sent",
  NotSent = "notSent",
  Cancelled = "cancelled",
}

export enum SpeakerAssignmentScopeKind {
  All = "all",
  Words = "words",
}

export enum SttConnectionStatus {
  NotSelected = "not_selected",
  NotDownloaded = "not_downloaded",
  Ready = "ready",
  Error = "error",
  Loading = "loading",
  Unreachable = "unreachable",
  Unavailable = "unavailable",
}
