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

#[tauri::command]
#[specta::specta]
pub(crate) async fn set_token(
    app: tauri::AppHandle,
    token: String,
) -> Result<UpdaterState, String> {
    let updater = app.updater2();
    updater.set_token(&token).map_err(|e| e.to_string())?;
    let state = updater.state();
    tauri::async_runtime::spawn(async move {
        updater.check().await;
    });
    Ok(state)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn clear_token(app: tauri::AppHandle) -> Result<UpdaterState, String> {
    let updater = app.updater2();
    updater.clear_token().map_err(|e| e.to_string())?;
    Ok(updater.state())
}
