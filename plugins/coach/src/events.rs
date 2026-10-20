#[derive(Debug, Clone, serde::Serialize, specta::Type, tauri_specta::Event)]
pub struct CoachNudged {
    pub session_id: String,
    pub tag: String,
    pub line: String,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type, tauri_specta::Event)]
pub struct CoachFocused {}
