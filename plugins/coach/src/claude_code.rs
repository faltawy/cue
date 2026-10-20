/// Which Claude Code the coach runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ClaudeCodeSource {
    /// The person's own Claude Code, at least the version the coach needs.
    Installed,
    /// Cue's copy, downloaded on first use.
    Cue,
}

/// A Claude Code the person installed themselves.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct InstalledClaudeCode {
    pub executable_path: String,
    pub command_path: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct ClaudeCodeStatus {
    pub using: ClaudeCodeSource,
    /// The newest native Claude Code found on this Mac, whatever its version.
    pub installed: Option<InstalledClaudeCode>,
    /// The oldest installed version the coach runs; also Cue's copy's version.
    pub min_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct ClaudeCodeUpdate {
    /// What `claude update` printed.
    pub output: String,
    pub status: ClaudeCodeStatus,
}
