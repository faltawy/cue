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

/// Getting the coach's Claude Code ready: the person's own when it is new
/// enough, else Cue's copy, downloaded in the background from app launch.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ClaudeSetup {
    /// Looking for an installed Claude Code, or downloading Cue's copy.
    Preparing {
        percent: Option<u8>,
    },
    Ready,
    Failed {
        message: String,
    },
}

/// The share of the download done, from the progress file the downloading
/// coach process writes beside Cue's copy.
pub fn download_percent(progress: &str) -> Option<u8> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Progress {
        received_bytes: u64,
        total_bytes: u64,
    }
    let progress: Progress = serde_json::from_str(progress).ok()?;
    if progress.total_bytes == 0 {
        return None;
    }
    let percent = progress.received_bytes.saturating_mul(100) / progress.total_bytes;
    Some(percent.min(99) as u8)
}

/// Who Claude Code is signed in as, from `--auth-status`.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct ClaudeAccount {
    pub signed_in: bool,
    pub email: Option<String>,
}

/// What a finished `--prepare-claude-code` run means for the app.
pub fn finished(success: bool, stderr: &str) -> ClaudeSetup {
    if success {
        return ClaudeSetup::Ready;
    }
    let message = stderr
        .lines()
        .rfind(|line| !line.trim().is_empty())
        .unwrap_or("Claude Code couldn't be set up.")
        .trim()
        .to_string();
    ClaudeSetup::Failed { message }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_percent_comes_from_the_shared_progress_and_never_reads_done_early() {
        assert_eq!(
            download_percent(r#"{"receivedBytes":45,"totalBytes":100}"#),
            Some(45)
        );
        assert_eq!(
            download_percent(r#"{"receivedBytes":100,"totalBytes":100}"#),
            Some(99)
        );
        assert_eq!(
            download_percent(r#"{"receivedBytes":5,"totalBytes":0}"#),
            None
        );
        assert_eq!(download_percent("not json"), None);
    }

    #[test]
    fn the_account_reads_the_sidecar_answer_with_or_without_an_email() {
        let signed_in: ClaudeAccount =
            serde_json::from_str(r#"{"signed_in":true,"email":"ada@example.com"}"#).unwrap();
        assert_eq!(signed_in.email.as_deref(), Some("ada@example.com"));
        assert!(signed_in.signed_in);
        let no_email: ClaudeAccount = serde_json::from_str(r#"{"signed_in":true}"#).unwrap();
        assert_eq!(no_email.email, None);
        let signed_out: ClaudeAccount = serde_json::from_str(r#"{"signed_in":false}"#).unwrap();
        assert!(!signed_out.signed_in);
    }

    #[test]
    fn a_failed_setup_reports_its_last_line() {
        assert_eq!(
            finished(
                false,
                "The coach needs a one-time download of Claude Code. Offline.\n\n"
            ),
            ClaudeSetup::Failed {
                message: "The coach needs a one-time download of Claude Code. Offline.".into()
            }
        );
        assert_eq!(finished(true, ""), ClaudeSetup::Ready);
    }
}
