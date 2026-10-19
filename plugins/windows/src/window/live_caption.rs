use serde::{Deserialize, Serialize};

use crate::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LiveCaptionPosition {
    TopCenter,
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    BottomCenter,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LiveCaptionState {
    pub text: String,
    pub opacity: f64,
    pub width: f64,
    pub line_count: u32,
    pub position: LiveCaptionPosition,
    pub minimized: bool,
}

swift_rs::swift!(fn _live_caption_hide() -> swift_rs::Bool);

pub fn show() -> Result<(), Error> {
    hide()
}

pub fn hide() -> Result<(), Error> {
    unsafe {
        _live_caption_hide();
    }
    Ok(())
}

pub fn update(_state: LiveCaptionState) -> Result<(), Error> {
    hide()
}
