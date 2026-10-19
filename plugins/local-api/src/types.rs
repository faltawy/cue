use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct MarkdownExportFile {
    pub path: String,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct MarkdownExportOptions {
    pub include_memo: bool,
    pub include_summary: bool,
    pub include_transcript: bool,
    pub include_action_items: bool,
    pub filename: String,
    pub include_id_suffix: bool,
}

impl Default for MarkdownExportOptions {
    fn default() -> Self {
        Self {
            include_memo: true,
            include_summary: true,
            include_transcript: true,
            include_action_items: true,
            filename: String::new(),
            include_id_suffix: true,
        }
    }
}
