use crate::{Updater2PluginExt, UpdaterState};

#[tauri::command]
#[specta::specta]
pub(crate) fn get_state(app: tauri::AppHandle) -> Result<UpdaterState, String> {
    Ok(app.updater2().state())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn check(app: tauri::AppHandle) -> Result<UpdaterState, String> {
    Ok(app.updater2().check().await)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn restart(app: tauri::AppHandle) -> Result<(), String> {
    app.updater2().restart().await.map_err(|e| e.to_string())
}
