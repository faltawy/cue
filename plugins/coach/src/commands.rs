use crate::{
    ClaudeAccount, ClaudeCodeStatus, ClaudeCodeUpdate, ClaudeSetup, Coach, CoachPluginExt,
    CoachProvider, CoachSettings, Endpoint, FoundConnector, McpProbe, McpSecretInput,
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
pub async fn show_for_recording(app: tauri::AppHandle) -> std::result::Result<(), String> {
    app.coach().show_for_recording();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_statuses(
    app: tauri::AppHandle,
) -> std::result::Result<Vec<McpServerStatus>, String> {
    blocking(app, Coach::mcp_statuses).await
}

#[tauri::command]
#[specta::specta]
pub async fn claude_signed_in(app: tauri::AppHandle) -> std::result::Result<ClaudeAccount, String> {
    blocking(app, Coach::claude_signed_in).await
}

#[tauri::command]
#[specta::specta]
pub async fn sign_in_to_claude(app: tauri::AppHandle) -> std::result::Result<(), String> {
    blocking(app, Coach::sign_in_to_claude).await
}

#[tauri::command]
#[specta::specta]
pub async fn claude_code_status(
    app: tauri::AppHandle,
) -> std::result::Result<ClaudeCodeStatus, String> {
    blocking(app, Coach::claude_code_status).await
}

#[tauri::command]
#[specta::specta]
pub async fn update_claude_code(
    app: tauri::AppHandle,
) -> std::result::Result<ClaudeCodeUpdate, String> {
    blocking(app, Coach::update_claude_code).await
}

#[tauri::command]
#[specta::specta]
pub async fn claude_setup(app: tauri::AppHandle) -> std::result::Result<ClaudeSetup, String> {
    blocking(app, Coach::claude_setup).await
}

#[tauri::command]
#[specta::specta]
pub async fn retry_claude_setup(app: tauri::AppHandle) -> std::result::Result<ClaudeSetup, String> {
    blocking(app, Coach::retry_claude_setup).await
}

#[tauri::command]
#[specta::specta]
pub async fn provider_account(
    app: tauri::AppHandle,
    provider: CoachProvider,
) -> std::result::Result<ClaudeAccount, String> {
    blocking(app, move |coach| coach.provider_account(provider)).await
}

#[tauri::command]
#[specta::specta]
pub async fn sign_in_to_provider(
    app: tauri::AppHandle,
    provider: CoachProvider,
) -> std::result::Result<(), String> {
    blocking(app, move |coach| coach.sign_in_to_provider(provider)).await
}

#[tauri::command]
#[specta::specta]
pub async fn provider_setup(
    app: tauri::AppHandle,
    provider: CoachProvider,
) -> std::result::Result<ClaudeSetup, String> {
    blocking(app, move |coach| coach.provider_setup(provider)).await
}

#[tauri::command]
#[specta::specta]
pub async fn retry_provider_setup(
    app: tauri::AppHandle,
    provider: CoachProvider,
) -> std::result::Result<ClaudeSetup, String> {
    blocking(app, move |coach| coach.retry_provider_setup(provider)).await
}

#[tauri::command]
#[specta::specta]
pub fn complete_dictation(
    app: tauri::AppHandle,
    request_id: String,
    result: crate::DictationResult,
) -> std::result::Result<(), String> {
    use tauri::Manager;
    app.state::<crate::CoachState>()
        .dictation
        .complete(&request_id, result)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn assistant_endpoint(app: tauri::AppHandle) -> std::result::Result<Endpoint, String> {
    blocking(app, Coach::assistant_endpoint).await
}

#[tauri::command]
#[specta::specta]
pub async fn show_assistant(app: tauri::AppHandle) -> std::result::Result<(), String> {
    blocking(app, Coach::show_assistant).await
}

#[tauri::command]
#[specta::specta]
pub async fn configure_browser_extension(
    app: tauri::AppHandle,
    registration: Option<crate::native_host::BrowserRegistration>,
) -> std::result::Result<String, String> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || -> Result<String> {
        let config = app.path().app_config_dir()?;
        let home = app.path().home_dir()?;
        let state = app.state::<crate::CoachState>();
        let _guard = state
            .browser_registration
            .lock()
            .map_err(|e| crate::Error::Other(e.to_string()))?;
        let bridge = crate::app_bridge(&app, &state)?;
        bridge.configure_browser(&config, None)?;
        let binary = crate::process::bundled_coach().unwrap_or_default();
        crate::native_host::register(&config, &home, &binary, registration.as_ref())?;
        bridge.configure_browser(&config, registration.as_ref())?;
        crate::native_host::host_name(&config)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn browser_extension_setup(
    app: tauri::AppHandle,
    action: crate::native_host::BrowserSetupAction,
) -> std::result::Result<Option<crate::native_host::BrowserExtensionSetup>, String> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || -> Result<Option<crate::native_host::BrowserExtensionSetup>> {
        use crate::native_host::{self, BrowserSetupAction, BrowserRegistration, ChromiumBrowser};
        let started = std::time::Instant::now();
        let run_id = uuid::Uuid::new_v4();
        tracing::info!(%run_id, ?action, "browser_extension_setup_started");
        let outcome = (|| -> Result<Option<native_host::BrowserExtensionSetup>> {
            let config = app.path().app_config_dir()?;
            let state = app.state::<crate::CoachState>();
            let _guard = state.browser_registration.lock().map_err(|e| crate::Error::Other(e.to_string()))?;
            match action {
                BrowserSetupAction::Prepare => {
                    let mut source = app.path().resource_dir()?.join("browser-extension");
                    if cfg!(debug_assertions) && !source.join("manifest.json").exists() {
                        source = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../apps/extension/dist");
                    }
                    let setup = native_host::prepare_extension(&config, &source)?;
                    let registration = BrowserRegistration { browser: ChromiumBrowser::Brave, extension_id: setup.extension_id.clone() };
                    let binary = crate::process::bundled_coach().ok_or_else(|| crate::Error::Other("Install a bundled Cue app before connecting the extension.".into()))?;
                    let bridge = crate::app_bridge(&app, &state)?;
                    bridge.configure_browser(&config, None)?;
                    native_host::register(&config, &app.path().home_dir()?, &binary, Some(&registration))?;
                    bridge.configure_browser(&config, Some(&registration))?;
                    let opened = std::process::Command::new("/usr/bin/open").arg(&setup.directory).status()?;
                    if !opened.success() { return Err(crate::Error::Other("Extension prepared. Open the extension folder from Cue to finish setup.".into())); }
                    Ok(Some(setup))
                }
                BrowserSetupAction::OpenExtensions => {
                    let opened = std::process::Command::new("/usr/bin/open").args(["-b", "com.brave.Browser", "brave://extensions"]).status()?;
                    if !opened.success() { return Err(crate::Error::Other("Could not open Brave. Open brave://extensions in Brave manually.".into())); }
                    Ok(None)
                }
                BrowserSetupAction::RevealFolder => {
                    let directory = config.join("browser-extension");
                    if !directory.is_dir() { return Err(crate::Error::Other("Prepare the extension first.".into())); }
                    let opened = std::process::Command::new("/usr/bin/open").arg(directory).status()?;
                    if !opened.success() { return Err(crate::Error::Other("Could not open the extension folder.".into())); }
                    Ok(None)
                }
                BrowserSetupAction::Disconnect => {
                    let bridge = crate::app_bridge(&app, &state)?;
                    bridge.configure_browser(&config, None)?;
                    native_host::register(&config, &app.path().home_dir()?, &std::path::PathBuf::new(), None)?;
                    Ok(None)
                }
            }
        })();
        match &outcome {
            Ok(_) => tracing::info!(%run_id, duration_ms = started.elapsed().as_millis() as u64, "browser_extension_setup_completed"),
            Err(error) => tracing::warn!(%run_id, %error, duration_ms = started.elapsed().as_millis() as u64, "browser_extension_setup_failed"),
        }
        outcome
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())
}
