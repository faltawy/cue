export enum BatchTerminalReason {
  Failed = "failed",
  TimedOut = "timed_out",
  Stopped = "stopped",
}

export enum LiveSessionStatus {
  Inactive = "inactive",
  Active = "active",
  Finalizing = "finalizing",
}

export enum LiveCaptureUiMode {
  Live = "live",
  RecordOnly = "record_only",
  FallbackRecordOnly = "fallback_record_only",
}

export enum LoadingPhase {
  Idle = "idle",
  AudioInitializing = "audio_initializing",
  AudioReady = "audio_ready",
  Connecting = "connecting",
  Connected = "connected",
}

export enum LiveStartBlockReason {
  SessionActive = "session_active",
  SessionFinalizing = "session_finalizing",
  PostStopProcessing = "post_stop_processing",
  AnotherSessionActive = "another_session_active",
  StartInProgress = "start_in_progress",
}

export enum AttachLiveSessionResult {
  Attached = "attached",
  Inactive = "inactive",
  Error = "error",
}

export enum BatchSessionMode {
  RunningBatch = "running_batch",
}
