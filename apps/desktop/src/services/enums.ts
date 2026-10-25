export enum AutoEnhanceMode {
  Regenerate = "regenerate",
  IfEmpty = "if_empty",
  Refresh = "refresh",
}

export enum EnhanceResultType {
  Started = "started",
  AlreadyActive = "already_active",
  NoModel = "no_model",
  TooShort = "too_short",
}

export enum QueueEmptySummaryResultType {
  Queued = "queued",
  SummaryExists = "summary_exists",
}

export enum EnhancerEventType {
  AutoEnhanceSkipped = "auto-enhance-skipped",
  AutoEnhanceStarted = "auto-enhance-started",
  AutoEnhanceNoModel = "auto-enhance-no-model",
}

export enum AttendanceSelfStatus {
  Organizer = "organizer",
  Accepted = "accepted",
  Tentative = "tentative",
  Pending = "pending",
  Declined = "declined",
  Unknown = "unknown",
}

export enum AttendanceRosterStatus {
  Complete = "complete",
  Incomplete = "incomplete",
  Unknown = "unknown",
}

export enum AudioRetentionPolicy {
  None = "none",
  OneDay = "oneDay",
  ThreeDays = "threeDays",
  OneWeek = "oneWeek",
  OneMonth = "oneMonth",
  Forever = "forever",
}

export enum EnhanceFailureCode {
  Error = "error",
}
