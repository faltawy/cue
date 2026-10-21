#[derive(Debug, Clone, serde::Serialize, specta::Type, tauri_specta::Event)]
pub struct CoachNudged {
    pub session_id: String,
    pub tag: String,
    pub line: String,
    /// The coach panel had focus, so the person already saw it there.
    pub seen: bool,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type, tauri_specta::Event)]
pub struct CoachFocused {}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, specta::Type, tauri_specta::Event)]
pub struct CoachEvidence {
    pub session_id: String,
    pub timestamp_ms: u64,
}
