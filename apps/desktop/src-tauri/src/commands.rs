use crate::AppExt;

const STAGING_BUNDLE_ID: &str = "com.hyprnote.staging";

#[tauri::command]
#[specta::specta]
pub async fn get_onboarding_needed<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<bool, String> {
    app.get_onboarding_needed().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn set_onboarding_needed<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    v: bool,
) -> Result<(), String> {
    app.set_onboarding_needed(v).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_dismissed_toasts<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<String>, String> {
    app.get_dismissed_toasts()
}

#[tauri::command]
#[specta::specta]
pub async fn set_dismissed_toasts<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    v: Vec<String>,
) -> Result<(), String> {
    app.set_dismissed_toasts(v)
}

#[tauri::command]
#[specta::specta]
pub async fn get_env<R: tauri::Runtime>(_app: tauri::AppHandle<R>, key: String) -> String {
    std::env::var(&key).unwrap_or_default()
}

fn should_show_devtool(identifier: &str) -> bool {
    cfg!(any(debug_assertions, feature = "dev", feature = "devtools"))
        || identifier == STAGING_BUNDLE_ID
}

#[tauri::command]
#[specta::specta]
pub fn show_devtool<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> bool {
    should_show_devtool(&app.config().identifier)
}

#[tauri::command]
#[specta::specta]
pub async fn account_full_name() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        match std::process::Command::new("/usr/bin/id").arg("-F").output() {
            Ok(output) if output.status.success() => {
                let name = String::from_utf8_lossy(&output.stdout).trim().to_owned();
                (!name.is_empty()).then_some(name)
            }
            Ok(output) => {
                tracing::warn!(status = %output.status, "failed to read the account name");
                None
            }
            Err(error) => {
                tracing::warn!(%error, "failed to read the account name");
                None
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn complete_app_exit<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    crate::mark_exit_flush_complete();
    app.exit(0);
}

#[tauri::command]
#[specta::specta]
pub async fn get_tinybase_values<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    app.get_tinybase_values()
}

#[tauri::command]
#[specta::specta]
pub async fn get_pinned_tabs<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    app.get_pinned_tabs()
}

#[tauri::command]
#[specta::specta]
pub async fn set_pinned_tabs<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    v: String,
) -> Result<(), String> {
    app.set_pinned_tabs(v)
}

#[tauri::command]
#[specta::specta]
pub async fn get_recently_opened_sessions<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    app.get_recently_opened_sessions()
}

#[tauri::command]
#[specta::specta]
pub async fn set_recently_opened_sessions<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    v: String,
) -> Result<(), String> {
    app.set_recently_opened_sessions(v)
}
