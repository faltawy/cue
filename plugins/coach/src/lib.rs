mod access;
mod auth;
mod bridge;
mod busy;
mod claude_code;
mod commands;
mod edits;
mod error;
mod events;
mod library;
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

use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use auth::{KeychainSecrets, McpSecret};
pub use auth::{McpAuthState, McpSecretInput, McpServerStatus};
pub use bridge::RecordingFuture;
pub use claude_code::{
    ClaudeAccount, ClaudeCodeSource, ClaudeCodeStatus, ClaudeCodeUpdate, ClaudeSetup,
    InstalledClaudeCode,
};
pub use error::{Error, Result};
pub use events::{CoachFocused, CoachNudged};
use mcp::ResolvedServer;
pub use probe::McpProbe;
pub use process::Endpoint;
use process::{Launch, Sidecar};
pub use settings::{ClaudeConnector, ClaudeModel, CoachSettings, FoundConnector, McpServer};

const PLUGIN_NAME: &str = "coach";
const START_TIMEOUT: Duration = Duration::from_secs(20);
const DEFAULT_PICK_TITLE: &str = "Choose the project the coach can read";

pub type RecordingProbe = std::sync::Arc<dyn Fn(AppHandle) -> RecordingFuture + Send + Sync>;

struct CoachState {
    db: Option<PathBuf>,
    recording: RecordingProbe,
    coach: Mutex<Option<Sidecar>>,
    llm: Mutex<Option<Sidecar>>,
    opening: Mutex<()>,
    bridge: Mutex<Option<bridge::Bridge>>,
    setup: Mutex<SetupSlot>,
}

#[derive(Default)]
struct SetupSlot {
    running: Option<(std::process::Child, std::process::ChildStdin)>,
    last: Option<ClaudeSetup>,
}

struct AppHost(AppHandle);

impl bridge::Host for AppHost {
    fn pool(&self) -> Result<sqlx::SqlitePool> {
        self.0
            .try_state::<tauri_plugin_db::ManagedState>()
            .map(|state| state.pool().clone())
            .ok_or_else(|| Error::Other("the database is not ready yet".into()))
    }

    fn recording_sessions(&self) -> RecordingFuture {
        match self.0.try_state::<CoachState>() {
            Some(state) => (state.recording)(self.0.clone()),
            None => Box::pin(async { None }),
        }
    }

    fn config_dir(&self) -> Result<PathBuf> {
        Ok(self.0.path().app_config_dir()?)
    }

    fn default_project(&self) -> Result<PathBuf> {
        match self.0.coach().settings()?.project_dir() {
            Some(project) => Ok(project),
            None => no_project_dir(),
        }
    }

    fn choose_default_project(&self) -> Result<()> {
        self.0.coach().pick_project().map(|_| ())
    }

    fn nudged(&self, nudge: CoachNudged) {
        let nudge = CoachNudged {
            seen: window::is_focused(&self.0),
            ..nudge
        };
        if let Err(error) = tauri_specta::Event::emit(&nudge, &self.0) {
            tracing::warn!(%error, "coach_nudge_emit_failed");
        }
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
        self.show();
    }

    pub fn show(&self) {
        let app = self.app.clone();
        tauri::async_runtime::spawn_blocking(move || report(&app, open(&app, Opening::Show)));
    }

    /// Opens the coach beside a meeting that just started recording: no folder picker and no
    /// error dialog mid-meeting, and the meeting app keeps focus.
    pub fn show_for_recording(&self) {
        let app = self.app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(error) = open(&app, Opening::ForRecording) {
                tracing::error!(%error, "coach_open_for_recording_failed");
            }
        });
    }

    pub fn choose_project(&self) {
        let app = self.app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            report(&app, open(&app, Opening::ChooseProject))
        });
    }

    /// The coach is running, so it follows whatever the app records.
    pub fn is_running(&self) -> bool {
        let state = self.app.state::<CoachState>();
        // Never wait: a coach that is still starting holds this lock for seconds.
        state
            .coach
            .try_lock()
            .is_ok_and(|mut slot| slot.as_mut().is_some_and(Sidecar::is_running))
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
        let stdout = run_sidecar(
            &self.app,
            process::list_connectors_args(),
            "couldn't list your Claude connectors",
        )?;
        Ok(serde_json::from_slice(&stdout)?)
    }

    pub fn claude_signed_in(&self) -> Result<ClaudeAccount> {
        let stdout = run_sidecar(
            &self.app,
            vec!["--auth-status".into()],
            "couldn't check the Claude sign-in",
        )?;
        Ok(serde_json::from_slice(&stdout)?)
    }

    pub fn sign_in_to_claude(&self) -> Result<()> {
        run_sidecar(
            &self.app,
            vec!["--sign-in".into()],
            "couldn't start the Claude sign-in",
        )?;
        Ok(())
    }

    pub fn claude_code_status(&self) -> Result<ClaudeCodeStatus> {
        let stdout = run_sidecar(
            &self.app,
            vec!["--claude-code-status".into()],
            "couldn't check which Claude Code the coach uses",
        )?;
        Ok(serde_json::from_slice(&stdout)?)
    }

    pub fn update_claude_code(&self) -> Result<ClaudeCodeUpdate> {
        let stdout = run_sidecar(
            &self.app,
            vec!["--update-claude-code".into()],
            "couldn't update Claude Code",
        )?;
        Ok(serde_json::from_slice(&stdout)?)
    }

    /// Where getting Claude Code ready stands. The first call (at launch)
    /// starts it: a no-op when the person's own Claude Code is new enough,
    /// else Cue's copy downloads in the background.
    pub fn claude_setup(&self) -> Result<ClaudeSetup> {
        let state = self.app.state::<CoachState>();
        let mut slot = state
            .setup
            .lock()
            .map_err(|error| Error::Other(error.to_string()))?;
        if slot.running.is_none() && slot.last.is_none() {
            start_claude_setup(&self.app, &mut slot)?;
        }
        poll_claude_setup(&self.app, &mut slot)
    }

    /// Start again after a failure; joins a setup that is still running.
    pub fn retry_claude_setup(&self) -> Result<ClaudeSetup> {
        let state = self.app.state::<CoachState>();
        let mut slot = state
            .setup
            .lock()
            .map_err(|error| Error::Other(error.to_string()))?;
        if poll_claude_setup(&self.app, &mut slot)? != ClaudeSetup::Ready && slot.running.is_none()
        {
            start_claude_setup(&self.app, &mut slot)?;
        }
        poll_claude_setup(&self.app, &mut slot)
    }

    pub fn llm_endpoint(&self) -> Result<Endpoint> {
        let state = self.app.state::<CoachState>();
        let claude_dir = claude_dir(&self.app)?;
        ensure(&state.llm, process::LLM_KEY.to_string(), |port| {
            process::sidecar_command(process::llm_args(port), &claude_dir)
        })
    }

    pub async fn is_answering(&self) -> bool {
        let endpoint = {
            let state = self.app.state::<CoachState>();
            let Ok(mut slot) = lock(&state.coach) else {
                return true;
            };
            let Some(sidecar) = slot.as_mut() else {
                return false;
            };
            if !sidecar.is_running() {
                return false;
            }
            sidecar.endpoint()
        };
        match http_client() {
            Ok(client) => busy::answering(&client, &endpoint).await,
            Err(error) => {
                tracing::warn!(%error, "coach_busy_probe_failed");
                true
            }
        }
    }
}

fn start_claude_setup(app: &AppHandle, slot: &mut SetupSlot) -> Result<()> {
    let mut child = process::sidecar_command(
        vec!["--prepare-claude-code".into(), "--exit-with-stdin".into()],
        &claude_dir(app)?,
    )?
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::piped())
    .spawn()?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| Error::Other("the Claude Code setup has no input".into()))?;
    slot.running = Some((child, stdin));
    slot.last = None;
    Ok(())
}

fn poll_claude_setup(app: &AppHandle, slot: &mut SetupSlot) -> Result<ClaudeSetup> {
    if let Some((child, _)) = slot.running.as_mut() {
        match child.try_wait()? {
            None => {
                let percent = std::fs::read_to_string(claude_dir(app)?.join(".install.progress"))
                    .ok()
                    .and_then(|progress| claude_code::download_percent(&progress));
                return Ok(ClaudeSetup::Preparing { percent });
            }
            Some(status) => {
                let mut stderr = String::new();
                if let Some(mut pipe) = child.stderr.take() {
                    std::io::Read::read_to_string(&mut pipe, &mut stderr)?;
                }
                let finished = claude_code::finished(status.success(), &stderr);
                if let ClaudeSetup::Failed { message } = &finished {
                    tracing::error!(%message, "claude_setup_failed");
                }
                slot.last = Some(finished);
                slot.running = None;
            }
        }
    }
    Ok(slot
        .last
        .clone()
        .unwrap_or(ClaudeSetup::Preparing { percent: None }))
}

fn claude_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_cache_dir()?.join("claude-code"))
}

fn run_sidecar(app: &AppHandle, args: Vec<std::ffi::OsString>, failure: &str) -> Result<Vec<u8>> {
    let output = process::sidecar_command(args, &claude_dir(app)?)?
        .stdin(std::process::Stdio::null())
        .output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(Error::Other(format!(
            "{failure}: {}",
            stderr
                .lines()
                .rfind(|line| !line.trim().is_empty())
                .unwrap_or("")
        )));
    }
    Ok(output.stdout)
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
) -> Result<Endpoint> {
    let mut slot = lock(slot)?;
    if let Some(sidecar) = slot.as_mut()
        && sidecar.key == key
        && sidecar.is_running()
    {
        return Ok(sidecar.endpoint());
    }
    slot.take();

    let port = process::free_port()?;
    let mut sidecar = Sidecar::spawn(command(port)?, port, key)?;
    sidecar.wait_ready(START_TIMEOUT)?;
    let endpoint = sidecar.endpoint();
    *slot = Some(sidecar);
    Ok(endpoint)
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
    let project = match settings.project_dir() {
        Some(project) => project,
        None => no_project_dir()?,
    };
    let db = state
        .db
        .clone()
        .ok_or_else(|| Error::Other("the application database location is unknown".into()))?;
    Ok(Launch {
        project_chosen: settings.project_dir().is_some(),
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
        protected: Vec::new(),
    })
}

fn protected_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let paths = app.path();
    [
        paths.app_config_dir(),
        paths.app_data_dir(),
        paths.app_local_data_dir(),
        paths.app_cache_dir(),
    ]
    .into_iter()
    .filter_map(std::result::Result::ok)
    .chain([mcp_config_dir()])
    .collect()
}

fn ensure_coach(app: &AppHandle, state: &CoachState, settings: &CoachSettings) -> Result<Endpoint> {
    let servers = resolve_servers(app, settings);
    let key = coach_launch(state, settings, &servers, 0, None, None)?.key();
    let bridge = app_bridge(app, state)?;
    ensure(&state.coach, key, |port| {
        let mcp_config =
            mcp::write_config(&mcp_config_dir(), &servers, &settings.claude_connectors)?;
        let instructions = mcp::write_instructions(&instructions_dir(), &settings.instructions)?;
        let mut command = process::sidecar_command(
            process::server_args(&process::Launch {
                protected: protected_dirs(app),
                ..coach_launch(state, settings, &servers, port, mcp_config, instructions)?
            }),
            &claude_dir(app)?,
        )?;
        bridge.apply(&mut command);
        Ok(command)
    })
}

// Without a chosen folder the coach still runs, in an empty folder of its own, and offers to pick one.
fn no_project_dir() -> Result<PathBuf> {
    let dir = std::env::temp_dir().join("anarlog-coach-no-project");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
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
    if !running {
        return Ok(());
    }
    let endpoint = ensure_coach(app, &state, settings)?;
    window::reload(app, &endpoint)
}

#[derive(Clone, Copy, PartialEq)]
enum Opening {
    Show,
    ChooseProject,
    ForRecording,
}

/// Emitted once the coach is running; the menu bar shows that it is listening.
pub const RUNNING_EVENT: &str = "coach://running";

fn open(app: &AppHandle, opening: Opening) -> Result<()> {
    let state = app.state::<CoachState>();
    let Ok(_opening) = state.opening.try_lock() else {
        return Ok(());
    };

    let coach = app.coach();
    let mut current = coach.settings()?;
    let pick = match opening {
        Opening::ChooseProject => true,
        Opening::Show => current.project_dir().is_none(),
        Opening::ForRecording => false,
    };
    if pick && let Some(project) = pick_folder(app, DEFAULT_PICK_TITLE)? {
        current.project = Some(project.to_string_lossy().into_owned());
        settings::save(&app.path().app_config_dir()?, &current)?;
    }

    let endpoint = ensure_coach(app, &state, &current)?;
    if let Err(error) = app.emit(RUNNING_EVENT, ()) {
        tracing::warn!(%error, "coach_running_emit_failed");
    }
    if opening == Opening::ForRecording {
        window::show_beside(app, &endpoint)
    } else {
        window::show(app, &endpoint)
    }
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
            commands::show,
            commands::show_for_recording,
            commands::claude_signed_in,
            commands::sign_in_to_claude,
            commands::claude_code_status,
            commands::update_claude_code,
            commands::claude_setup,
            commands::retry_claude_setup,
        ])
        .events(tauri_specta::collect_events![CoachNudged, CoachFocused])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

pub fn init(
    db: Option<PathBuf>,
    recording: RecordingProbe,
) -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app, _api| {
            specta_builder.mount_events(app);
            app.manage(CoachState {
                db: db.clone(),
                recording: recording.clone(),
                coach: Mutex::new(None),
                llm: Mutex::new(None),
                opening: Mutex::new(()),
                bridge: Mutex::new(None),
                setup: Mutex::new(SetupSlot::default()),
            });
            if let Err(error) = app.coach().claude_setup() {
                tracing::error!(%error, "claude_setup_start_failed");
            }
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
                if let Ok(mut setup) = state.setup.lock()
                    && let Some((mut child, stdin)) = setup.running.take()
                {
                    drop(stdin);
                    if let Err(error) = child.kill() {
                        tracing::warn!(%error, "claude_setup_stop_failed");
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

    #[test]
    fn a_coach_with_no_project_folder_still_launches_and_asks_for_one() {
        let state = CoachState {
            db: Some("/data/app.db".into()),
            recording: std::sync::Arc::new(|_| Box::pin(async { None })),
            coach: Mutex::new(None),
            llm: Mutex::new(None),
            opening: Mutex::new(()),
            bridge: Mutex::new(None),
            setup: Mutex::new(SetupSlot::default()),
        };
        let launch = coach_launch(&state, &CoachSettings::default(), &[], 0, None, None).unwrap();
        assert!(launch.project.is_dir());
        assert!(process::server_args(&launch).contains(&"--no-project".into()));
    }
}
