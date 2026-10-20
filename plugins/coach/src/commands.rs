use crate::{
    Coach, CoachPluginExt, CoachSettings, Endpoint, FoundConnector, McpProbe, McpSecretInput,
    McpServerStatus, Result,
};

async fn blocking<T: Send + 'static>(
    app: tauri::AppHandle,
    run: impl FnOnce(&Coach) -> Result<T> + Send + 'static,
) -> std::result::Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || run(&app.coach()))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn llm_endpoint(app: tauri::AppHandle) -> std::result::Result<Endpoint, String> {
    blocking(app, Coach::llm_endpoint).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_settings(app: tauri::AppHandle) -> std::result::Result<CoachSettings, String> {
    blocking(app, Coach::settings).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_settings(
    app: tauri::AppHandle,
    settings: CoachSettings,
) -> std::result::Result<(), String> {
    blocking(app, move |coach| coach.set_settings(settings)).await
}

#[tauri::command]
#[specta::specta]
pub async fn choose_project(app: tauri::AppHandle) -> std::result::Result<Option<String>, String> {
    blocking(app, Coach::pick_project).await
}

#[tauri::command]
#[specta::specta]
pub async fn probe_mcp_server(url: String) -> std::result::Result<McpProbe, String> {
    let http = crate::http_client().map_err(|error| error.to_string())?;
    Ok(crate::probe::probe(&http, url.trim()).await)
}

#[tauri::command]
#[specta::specta]
pub async fn set_mcp_secret(
    app: tauri::AppHandle,
    name: String,
    secret: McpSecretInput,
) -> std::result::Result<(), String> {
    blocking(app, move |coach| coach.set_mcp_secret(&name, secret)).await
}

#[tauri::command]
#[specta::specta]
pub async fn add_knowledge(
    app: tauri::AppHandle,
    folder: bool,
) -> std::result::Result<Option<String>, String> {
    blocking(app, move |coach| coach.add_knowledge(folder)).await
}

#[tauri::command]
#[specta::specta]
pub async fn find_claude_connectors(
    app: tauri::AppHandle,
) -> std::result::Result<Vec<FoundConnector>, String> {
    blocking(app, Coach::find_claude_connectors).await
}

#[tauri::command]
#[specta::specta]
pub async fn show(app: tauri::AppHandle) -> std::result::Result<(), String> {
    app.coach().show();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_statuses(
    app: tauri::AppHandle,
) -> std::result::Result<Vec<McpServerStatus>, String> {
    blocking(app, Coach::mcp_statuses).await
}
