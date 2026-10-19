//! Classification of failures that must not be emitted to error telemetry.
//!
//! This includes the end user's own account state (exhausted credits, expired
//! plans, bad API keys) and issue types that were already archived as solved.

#[cfg(feature = "sentry")]
mod sentry_event;
#[cfg(feature = "sentry")]
pub use sentry_event::*;

const USER_ERROR_MARKERS: &[&str] = &[
    "billing_hard_limit_reached",
    "api key is invalid",
    "apikey is invalid",
    "credit balance is too low",
    "exceeded your current quota",
    "incorrect api key",
    "insufficient balance",
    "insufficient credits",
    "insufficient funds",
    "insufficient_quota",
    "invalid api key",
    "invalid apikey",
    "invalid x-api-key",
    "invalid_api_key",
    "not enough credits",
    "no quota",
    "payment required",
    "plans & billing",
    "plans and billing",
    "quota exceeded",
    "upgrade or purchase credits",
];

// Archived Sentry issue types. Local error logs stay; Sentry should not reopen
// or bill for issues that were already solved.
const IGNORED_ERROR_MARKERS: &[&str] = &[
    "[runbatch]",
    "post-stop transcript repair failed",
    "[audio-retention]",
    "batch transcription failed",
    "connect_async_failed",
    "acquired connection, but time to acquire exceeded",
    "slow statement",
    "samples_dropped",
    "mic_samples_dropped",
    "zoom_mic_usage_check_failed",
    "e2ee recovery key setup is required",
    "couldn't find callback id",
    "[sessionpersister]",
    "update_check_failed",
    "failed to check for updates",
    "failed_to_check_for_updates",
    "listen_ws_connect_failed",
    "listener_retry_failed",
    "failed to fetch remote connection ids",
];

pub fn is_user_error_text(text: &str) -> bool {
    contains_marker(text, USER_ERROR_MARKERS)
}

pub fn is_ignored_error_text(text: &str) -> bool {
    contains_marker(text, IGNORED_ERROR_MARKERS) || is_webview_console_dump(text)
}

fn contains_marker(text: &str, markers: &[&str]) -> bool {
    let text = text.to_lowercase();
    markers.iter().any(|marker| text.contains(marker))
}

fn is_webview_console_dump(text: &str) -> bool {
    text.starts_with("[String(") || text.starts_with("[Object {")
}

#[cfg(test)]
mod tests {
    use super::*;

    const ANTHROPIC_CREDIT_ERROR: &str = "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";

    #[test]
    fn detects_billing_and_credential_failures() {
        assert!(is_user_error_text(ANTHROPIC_CREDIT_ERROR));
        assert!(is_user_error_text(
            "{\"code\":\"insufficient_quota\",\"type\":\"invalid_request_error\"}"
        ));
        assert!(is_user_error_text("API key is invalid"));
        assert!(is_user_error_text("Invalid APIKEY"));
        assert!(!is_user_error_text("failed to open database"));
    }
}
