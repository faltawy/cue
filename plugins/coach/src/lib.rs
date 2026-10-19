mod auth;
mod bridge;
mod commands;
mod edits;
mod error;
mod mcp;
mod probe;
mod process;
mod series;
mod settings;
mod window;

use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use auth::{KeychainSecrets, McpSecret};
pub use auth::{McpAuthState, McpSecretInput, McpServerStatus};
pub use error::{Error, Result};
use mcp::ResolvedServer;
pub use probe::McpProbe;
use process::{Launch, Sidecar};
pub use settings::{ClaudeConnector, ClaudeModel, CoachSettings, FoundConnector, McpServer};

const PLUGIN_NAME: &str = "coach";
const START_TIMEOUT: Duration = Duration::from_secs(20);
const DEFAULT_PICK_TITLE: &str = "Choose the project the coach can read";

struct CoachState {
    db: Option<PathBuf>,
    coach: Mutex<Option<Sidecar>>,
    llm: Mutex<Option<Sidecar>>,
    opening: Mutex<()>,
    bridge: Mutex<Option<bridge::Bridge>>,
}

struct AppHost(AppHandle);

impl bridge::Host for AppHost {
    fn pool(&self) -> Result<sqlx::SqlitePool> {
        self.0
            .try_state::<tauri_plugin_db::ManagedState>()
            .map(|state| state.pool().clone())
            .ok_or_else(|| Error::Other("the database is not ready yet".into()))
    }

    fn config_dir(&self) -> Result<PathBuf> {
        Ok(self.0.path().app_config_dir()?)
    }

    fn default_project(&self) -> Result<PathBuf> {
        self.0
            .coach()
            .settings()?
            .project_dir()
            .ok_or_else(|| Error::Other("choose a project folder for the coach first".into()))
    }

    fn pick_folder(&self, title: &str) -> Result<Option<PathBuf>> {
        pick_folder(&self.0, title)
    }
}

fn app_bridge(app: &AppHandle, state: &CoachState) -> Result<bridge::Bridge> {
    let mut slot = state
        .bridge
        .lock()
        .map_err(|error| Error::Other(error.to_string()))?;
    if let Some(bridge) = slot.as_ref() {
        return Ok(bridge.clone());
    }
    let started = bridge::start(AppHost(app.clone()))?;
    *slot = Some(started.clone());
    Ok(started)
}

pub trait CoachPluginExt {
    fn coach(&self) -> Coach;
}

impl<M: Manager<tauri::Wry>> CoachPluginExt for M {
    fn coach(&self) -> Coach {
        Coach {
            app: self.app_handle().clone(),
        }
    }
}

pub struct Coach {
    app: AppHandle,
}

impl Coach {
    pub fn toggle(&self) {
        if window::is_visible(&self.app) {
            if let Err(error) = window::hide(&self.app) {
                tracing::error!(%error, "coach_hide_failed");
            }
            return;
        }
        let app = self.app.clone();
        tauri::async_runtime::spawn_blocking(move || report(&app, open(&app, false)));
    }

    pub fn choose_project(&self) {
        let app = self.app.clone();
        tauri::async_runtime::spawn_blocking(move || report(&app, open(&app, true)));
    }

    pub fn settings(&self) -> Result<CoachSettings> {
        settings::load(
            &self.app.path().app_config_dir()?,
            &KeychainSecrets(&self.app),
        )
    }

    pub fn set_settings(&self, next: CoachSettings) -> Result<()> {
        let previous = self.settings()?;
        settings::save(&self.app.path().app_config_dir()?, &next)?;
        let secrets = KeychainSecrets(&self.app);
        for old in &previous.mcp_servers {
            let kept = next
                .mcp_servers
                .iter()
                .any(|server| server.name == old.name && server.auth == old.auth);
            if !kept {
                auth::SecretStore::delete(&secrets, &old.name)?;
            }
        }
        restart_running_coach(&self.app, &next)
    }

    pub fn server(&self, name: &str) -> Result<McpServer> {
        self.settings()?
            .mcp_servers
            .into_iter()
            .find(|server| server.name == name)
            .ok_or_else(|| Error::Other(format!("there is no tool named \"{name}\"")))
    }

    pub fn set_mcp_secret(&self, name: &str, input: McpSecretInput) -> Result<()> {
        let server = self.server(name)?;
        let secret = McpSecret::from(input);
        if auth::headers_for(&server.auth, Some(&secret)).is_none() {
            return Err(Error::Other(format!(
                "{name} doesn't sign in with this kind of secret"
            )));
        }
        auth::write_secret(&KeychainSecrets(&self.app), name, &secret)?;
        restart_running_coach(&self.app, &self.settings()?)
    }

    pub fn mcp_statuses(&self) -> Result<Vec<McpServerStatus>> {
        let secrets = KeychainSecrets(&self.app);
        self.settings()?
            .mcp_servers
            .into_iter()
            .map(|server| {
                let secret = auth::read_secret(&secrets, &server.name)?;
                Ok(McpServerStatus {
                    state: auth::auth_state(&server.auth, secret.as_ref()),
                    name: server.name,
                })
            })
            .collect()
    }

    pub fn pick_project(&self) -> Result<Option<String>> {
        let Some(project) = pick_folder(&self.app, DEFAULT_PICK_TITLE)? else {
            return Ok(None);
        };
        let project = project.to_string_lossy().into_owned();
        self.set_settings(CoachSettings {
            project: Some(project.clone()),
            ..self.settings()?
        })?;
        Ok(Some(project))
    }

    pub fn add_knowledge(&self, folder: bool) -> Result<Option<String>> {
        let dialog = self
            .app
            .dialog()
            .file()
            .set_title("Choose reference material the coach can read");
        let picked = if folder {
            dialog.blocking_pick_folder()
        } else {
            dialog.blocking_pick_file()
        };
        let Some(picked) = picked else {
            return Ok(None);
        };
        let path = picked
            .into_path()
            .map_err(|error| Error::Other(error.to_string()))?
            .to_string_lossy()
            .into_owned();
        let mut settings = self.settings()?;
        if !settings.knowledge.contains(&path) {
            settings.knowledge.push(path.clone());
            self.set_settings(settings)?;
        }
        Ok(Some(path))
    }

    pub fn find_claude_connectors(&self) -> Result<Vec<FoundConnector>> {
        let output = process::sidecar_command(process::list_connectors_args())?
            .stdin(std::process::Stdio::null())
            .output()?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(Error::Other(format!(
                "couldn't list your Claude connectors: {}",
                stderr.lines().rfind(|line| !line.trim().is_empty()).unwrap_or("")
            )));
        }
        Ok(serde_json::from_slice(&output.stdout)?)
    }

    pub fn llm_endpoint(&self) -> Result<String> {
        let state = self.app.state::<CoachState>();
        ensure(&state.llm, process::LLM_KEY.to_string(), |port| {
            process::sidecar_command(process::llm_args(port))
        })
    }
}

fn report(app: &AppHandle, result: Result<()>) {
    if let Err(error) = result {
        tracing::error!(%error, "coach_open_failed");
        app.dialog()
            .message(error.to_string())
            .title("Coach")
            .kind(MessageDialogKind::Error)
            .show(|_| {});
    }
}

fn lock(slot: &Mutex<Option<Sidecar>>) -> Result<MutexGuard<'_, Option<Sidecar>>> {
    slot.lock().map_err(|error| Error::Other(error.to_string()))
}

fn ensure(
    slot: &Mutex<Option<Sidecar>>,
    key: String,
    command: impl FnOnce(u16) -> Result<Command>,
) -> Result<String> {
    let mut slot = lock(slot)?;
    if let Some(sidecar) = slot.as_mut()
        && sidecar.key == key
        && sidecar.is_running()
    {
        return Ok(sidecar.base_url());
    }
    slot.take();

    let port = process::free_port()?;
    let mut sidecar = Sidecar::spawn(command(port)?, port, key)?;
    sidecar.wait_ready(START_TIMEOUT)?;
    let url = sidecar.base_url();
    *slot = Some(sidecar);
    Ok(url)
}

fn http_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(concat!("anarlog-coach/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| Error::Other(error.to_string()))
}

fn resolve_server(secrets: &KeychainSecrets, server: &McpServer) -> Result<Option<ResolvedServer>> {
    let secret = auth::read_secret(secrets, &server.name)?;
    Ok(
        auth::headers_for(&server.auth, secret.as_ref()).map(|headers| ResolvedServer {
            name: server.name.clone(),
            url: server.url.clone(),
            headers,
            allow_changes: server.allow_changes,
        }),
    )
}

fn resolve_servers(app: &AppHandle, settings: &CoachSettings) -> Vec<ResolvedServer> {
    let secrets = KeychainSecrets(app);
    settings
        .mcp_servers
        .iter()
        .filter(|server| server.enabled)
        .filter_map(|server| match resolve_server(&secrets, server) {
            Ok(Some(resolved)) => Some(resolved),
            Ok(None) => {
                tracing::warn!(server = %server.name, "coach_mcp_server_needs_sign_in");
                None
            }
            Err(error) => {
                tracing::error!(server = %server.name, %error, "coach_mcp_server_auth_failed");
                None
            }
        })
        .collect()
}

fn coach_launch(
    state: &CoachState,
    settings: &CoachSettings,
    servers: &[ResolvedServer],
    port: u16,
    mcp_config: Option<PathBuf>,
    instructions: Option<PathBuf>,
) -> Result<Launch> {
    let project = settings
        .project_dir()
        .ok_or_else(|| Error::Other("choose a project folder for the coach first".into()))?;
    let db = state
        .db
        .clone()
        .ok_or_else(|| Error::Other("the application database location is unknown".into()))?;
    Ok(Launch {
        project,
        db,
        port,
        model: settings.model.as_str(),
        nudges: settings.nudges,
        nudge_limit_cents: settings.nudge_limit_cents,
        mcp_config,
        allow_changes: mcp::allowed_changes(servers, &settings.claude_connectors),
        tools_fingerprint: mcp::fingerprint(servers, &settings.claude_connectors),
        instructions,
        knowledge: settings.knowledge.iter().map(PathBuf::from).collect(),
        context_fingerprint: mcp::context_fingerprint(&settings.instructions, &settings.knowledge),
        web_access: settings.web_access,
    })
}

fn ensure_coach(app: &AppHandle, state: &CoachState, settings: &CoachSettings) -> Result<String> {
    let servers = resolve_servers(app, settings);
    let key = coach_launch(state, settings, &servers, 0, None, None)?.key();
    let bridge = app_bridge(app, state)?;
    ensure(&state.coach, key, |port| {
        let mcp_config =
            mcp::write_config(&mcp_config_dir(), &servers, &settings.claude_connectors)?;
        let instructions = mcp::write_instructions(&instructions_dir(), &settings.instructions)?;
        let mut command = process::sidecar_command(process::server_args(&coach_launch(
            state,
            settings,
            &servers,
            port,
            mcp_config,
            instructions,
        )?))?;
        bridge.apply(&mut command);
        Ok(command)
    })
}

fn mcp_config_dir() -> PathBuf {
    std::env::temp_dir().join("anarlog-coach-mcp")
}

fn instructions_dir() -> PathBuf {
    std::env::temp_dir().join("anarlog-coach-instructions")
}

fn restart_running_coach(app: &AppHandle, settings: &CoachSettings) -> Result<()> {
    let state = app.state::<CoachState>();
    let running = lock(&state.coach)?
        .as_mut()
        .is_some_and(|sidecar| sidecar.is_running());
    if !running || settings.project_dir().is_none() {
        return Ok(());
    }
    let url = ensure_coach(app, &state, settings)?;
    window::reload(app, &url)
}

fn open(app: &AppHandle, choose: bool) -> Result<()> {
    let state = app.state::<CoachState>();
    let Ok(_opening) = state.opening.try_lock() else {
        return Ok(());
    };

    let coach = app.coach();
    let mut current = coach.settings()?;
    if choose || current.project_dir().is_none() {
        let Some(project) = pick_folder(app, DEFAULT_PICK_TITLE)? else {
            return Ok(());
        };
        current.project = Some(project.to_string_lossy().into_owned());
        settings::save(&app.path().app_config_dir()?, &current)?;
    }

    let url = ensure_coach(app, &state, &current)?;
    window::show(app, &url)
}

fn pick_folder(app: &AppHandle, title: &str) -> Result<Option<PathBuf>> {
    let Some(picked) = app.dialog().file().set_title(title).blocking_pick_folder() else {
        return Ok(None);
    };
    picked
        .into_path()
        .map(Some)
        .map_err(|error| Error::Other(error.to_string()))
}

fn make_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::llm_endpoint,
            commands::get_settings,
            commands::set_settings,
            commands::choose_project,
            commands::probe_mcp_server,
            commands::set_mcp_secret,
            commands::mcp_statuses,
            commands::find_claude_connectors,
            commands::add_knowledge,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

pub fn init(db: Option<PathBuf>) -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app, _api| {
            app.manage(CoachState {
                db: db.clone(),
                coach: Mutex::new(None),
                llm: Mutex::new(None),
                opening: Mutex::new(()),
                bridge: Mutex::new(None),
            });
            Ok(())
        })
        .on_event(|app, event| {
            if let RunEvent::Exit = event
                && let Some(state) = app.try_state::<CoachState>()
            {
                for slot in [&state.coach, &state.llm] {
                    if let Ok(mut slot) = slot.lock() {
                        slot.take();
                    }
                }
            }
        })
        .build()
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn export_types() {
        const OUTPUT_FILE: &str = "./js/bindings.gen.ts";

        make_specta_builder()
            .export(
                specta_typescript::Typescript::default()
                    .formatter(specta_typescript::formatter::prettier)
                    .bigint(specta_typescript::BigIntExportBehavior::Number),
                OUTPUT_FILE,
            )
            .unwrap();

        let content = std::fs::read_to_string(OUTPUT_FILE).unwrap();
        std::fs::write(OUTPUT_FILE, format!("// @ts-nocheck\n{content}")).unwrap();
    }
}
