export enum ServerProblem {
  Name = "name",
  Reserved = "reserved",
  Duplicate = "duplicate",
  Url = "url",
  Header = "header",
  Username = "username",
  Secret = "secret",
}

export enum SettingsSection {
  App = "app",
  Meetings = "meetings",
}

export enum SettingControlWidth {
  Fixed = "fixed",
  Content = "content",
}

export enum SttHealthStatus {
  Pending = "pending",
  Error = "error",
  Success = "success",
}

export enum TranscriptionMode {
  Realtime = "realtime",
  Batch = "batch",
}

export enum ExportLocationAction {
  Choose = "choose",
  Reset = "reset",
}

export enum ProviderRequirementKind {
  RequiresConfig = "requires_config",
  RequiresPlatform = "requires_platform",
}

export enum EligibilityBlockerCode {
  MissingProvider = "missing_provider",
  MissingModel = "missing_model",
  ProviderDisabled = "provider_disabled",
  MissingConfig = "missing_config",
  ModelNotDownloaded = "model_not_downloaded",
  UnsupportedPlatform = "unsupported_platform",
}

export enum WeekStart {
  Sunday = "sunday",
  Monday = "monday",
}

export enum ModelCategoryKind {
  Hardware = "hardware",
}

export enum LegacyCleanupState {
  Success = "success",
  Warning = "warning",
  Loading = "loading",
  Unavailable = "unavailable",
}
