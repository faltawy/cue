export enum ManagedProviderUnavailableReason {
  ManagedDisabled = "managed_disabled",
  SettingsLoading = "settings_loading",
}

export enum ManagedProviderId {
  ClaudeCode = "claude_code",
  Codex = "codex",
}

export enum LLMConnectionState {
  Pending = "pending",
  Error = "error",
  Success = "success",
}
