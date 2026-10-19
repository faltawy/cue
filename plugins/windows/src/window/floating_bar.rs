use serde::{Deserialize, Serialize};

use crate::Error;
use crate::window::live_caption::LiveCaptionPosition;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum FloatingBarStatus {
    Recording,
    Reconnecting,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum FloatingBarColorScheme {
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FloatingTranscriptBubble {
    pub id: String,
    pub speaker_label: String,
    pub text: String,
    pub is_self: bool,
    pub is_final: bool,
    pub start_ms: f64,
    pub end_ms: f64,
    pub overlaps_previous: bool,
    pub overlaps_next: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FloatingDictationState {
    pub session_id: String,
    pub phase: String,
    pub microphone: String,
    pub text: String,
    pub partial: String,
    pub preview_enabled: bool,
    pub preview_unavailable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FloatingBarState {
    #[serde(default)]
    pub dictation: Option<FloatingDictationState>,
    pub amplitude: f64,
    pub title: String,
    pub status: FloatingBarStatus,
    pub color_scheme: FloatingBarColorScheme,
    pub opacity: f64,
    pub live_caption_opacity: f64,
    pub live_caption_width: f64,
    pub live_caption_line_count: u32,
    pub live_caption_position: LiveCaptionPosition,
    pub live_caption_minimized: bool,
    pub live_caption_toggle_visible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcript_bubbles: Option<Vec<FloatingTranscriptBubble>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcript_notice: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible_in_screenshots: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overlay_display: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct IslandDisplay {
    pub id: String,
    pub name: String,
    pub has_camera: bool,
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::CStr;
    use std::os::raw::c_char;
    use std::sync::OnceLock;

    use swift_rs::{Bool, SRString, swift};
    use tauri_specta::Event;

    use super::{FloatingBarState, IslandDisplay};
    use crate::Error;

    swift!(fn _floating_bar_show() -> Bool);
    swift!(fn _floating_bar_hide() -> Bool);
    swift!(fn _floating_bar_update(json: &SRString) -> Bool);
    swift!(fn _floating_bar_update_amplitude(amplitude: f64) -> Bool);
    swift!(fn _floating_bar_displays() -> SRString);

    pub fn displays() -> Result<Vec<IslandDisplay>, Error> {
        let json = swift_rs::autoreleasepool!({
            unsafe { _floating_bar_displays() }.to_string()
        });
        serde_json::from_str(&json)
            .map_err(|error| Error::PanelError(format!("failed to read displays: {error}")))
    }

    static APP_HANDLE: OnceLock<tauri::AppHandle<tauri::Wry>> = OnceLock::new();

    pub fn set_app_handle(app: tauri::AppHandle<tauri::Wry>) {
        let _ = APP_HANDLE.set(app);
    }

    pub fn show() -> Result<(), Error> {
        unsafe {
            _floating_bar_show();
        }
        Ok(())
    }

    pub fn hide() -> Result<(), Error> {
        unsafe {
            _floating_bar_hide();
        }
        Ok(())
    }

    pub fn update(state: FloatingBarState) -> Result<(), Error> {
        let json = serde_json::to_string(&state).map_err(|error| {
            Error::PanelError(format!("failed to serialize floating bar state: {error}"))
        })?;
        let ok = swift_rs::autoreleasepool!({
            let json = SRString::from(json.as_str());
            unsafe { _floating_bar_update(&json) }
        });
        if ok {
            Ok(())
        } else {
            Err(Error::PanelError(
                "failed to update native floating bar".to_string(),
            ))
        }
    }

    pub fn update_amplitude(amplitude: f64) -> Result<(), Error> {
        let ok = unsafe { _floating_bar_update_amplitude(amplitude) };
        if ok {
            Ok(())
        } else {
            Err(Error::PanelError(
                "failed to update native floating bar amplitude".to_string(),
            ))
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn rust_on_floating_bar_stop() {
        if let Some(app) = APP_HANDLE.get() {
            let _ = crate::events::FloatingBarStop {}.emit(app);
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn rust_on_floating_bar_open_main() {
        if let Some(app) = APP_HANDLE.get() {
            let _ = crate::events::FloatingBarOpenMain {}.emit(app);
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn rust_on_floating_bar_open_coach() {
        if let Some(app) = APP_HANDLE.get() {
            let _ = crate::events::FloatingBarOpenCoach {}.emit(app);
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn rust_on_floating_bar_dictation_action(payload: *const c_char) {
        if payload.is_null() {
            return;
        }
        let Ok(json) = (unsafe { CStr::from_ptr(payload) }).to_str() else {
            return;
        };
        if let (Some(app), Ok(event)) = (
            APP_HANDLE.get(),
            serde_json::from_str::<crate::events::FloatingBarDictationAction>(json),
        ) {
            let _ = event.emit(app);
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn rust_on_floating_bar_settings_change(settings_ptr: *const c_char) {
        if settings_ptr.is_null() {
            return;
        }

        let Ok(settings_json) = (unsafe { CStr::from_ptr(settings_ptr) }).to_str() else {
            return;
        };

        let Ok(settings) =
            serde_json::from_str::<crate::events::FloatingBarSettingsChange>(settings_json)
        else {
            return;
        };

        if let Some(app) = APP_HANDLE.get() {
            let _ = settings.emit(app);
        }
    }
}

pub fn set_app_handle(app: tauri::AppHandle<tauri::Wry>) {
    platform::set_app_handle(app);
}

pub fn show() -> Result<(), Error> {
    platform::show()
}

static SESSION_ID: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

pub fn session_id() -> Option<String> {
    SESSION_ID.lock().ok().and_then(|guard| guard.clone())
}

pub fn hide() -> Result<(), Error> {
    let hidden_session_id = session_id();
    platform::hide()?;
    if let Ok(mut session_id) = SESSION_ID.lock()
        && *session_id == hidden_session_id
    {
        *session_id = None;
    }
    Ok(())
}

pub fn update(state: FloatingBarState) -> Result<(), Error> {
    let next_session_id = state.session_id.clone();
    platform::update(state)?;
    if let Ok(mut session_id) = SESSION_ID.lock() {
        *session_id = next_session_id;
    }
    Ok(())
}

pub fn update_amplitude(amplitude: f64) -> Result<(), Error> {
    platform::update_amplitude(amplitude)
}

#[cfg(target_os = "macos")]
pub fn displays() -> Result<Vec<IslandDisplay>, Error> {
    platform::displays()
}
