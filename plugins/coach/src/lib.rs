mod access;
mod auth;
mod bridge;
mod browser;
mod busy;
mod claude_code;
mod commands;
mod dictation;
mod edits;
mod error;
mod events;
mod library;
mod mcp;
mod native_host;
mod probe;
mod process;
mod series;
mod settings;
mod window;

use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use auth::{KeychainSecrets, McpSecret};
pub use auth::{McpAuthState, McpSecretInput, McpServerStatus};
pub use bridge::{
    DictationFuture, Recording, RecordingControlFuture, RecordingFuture, SpeakerAssignmentFuture,
};
pub use browser::{BrowserFailure, BrowserRequest, BrowserResponse};
pub use claude_code::{
    ClaudeAccount, ClaudeCodeSource, ClaudeCodeStatus, ClaudeCodeUpdate, ClaudeSetup,
    InstalledClaudeCode,
};
pub use dictation::{DictationAction, DictationResult};
pub use error::{Error, Result};
pub use events::{
    BrowserRecordingRequested, CoachDictationRequested, CoachEvidence, CoachFocused, CoachNudged,
};
use mcp::ResolvedServer;
pub use probe::McpProbe;
pub use process::Endpoint;
use process::{Launch, Sidecar};
pub use settings::{
    ClaudeConnector, ClaudeModel, CoachProvider, CoachSettings, FoundConnector, McpServer,
};

const PLUGIN_NAME: &str = "coach";
const START_TIMEOUT: Duration = Duration::from_secs(20);
const DEFAULT_PICK_TITLE: &str = "Choose the project the coach can read";

pub type RecordingProbe = std::sync::Arc<dyn Fn(AppHandle) -> RecordingFuture + Send + Sync>;
pub type PauseRecording =
    std::sync::Arc<dyn Fn(AppHandle, String, bool) -> RecordingControlFuture + Send + Sync>;
pub type StopRecording =
    std::sync::Arc<dyn Fn(AppHandle, String) -> RecordingControlFuture + Send + Sync>;
pub type SpeakerAssignmentProbe =
    std::sync::Arc<dyn Fn(AppHandle, String) -> SpeakerAssignmentFuture + Send + Sync>;

struct CoachState {
    db: Option<PathBuf>,
    recording: RecordingProbe,
    stop_recording: StopRecording,
    pause_recording: PauseRecording,
    speaker_assigned: SpeakerAssignmentProbe,
    coach: Mutex<Option<Sidecar>>,
    llm: Mutex<Option<Sidecar>>,
    assistant: Mutex<Option<Sidecar>>,
    opening: Mutex<()>,
    bridge: Mutex<Option<bridge::Bridge>>,
    browser_registration: Mutex<()>,
    setup: Mutex<SetupSlot>,
    codex_setup: Mutex<SetupSlot>,
    sign_in: [Mutex<()>; 2],
    unseen_nudge: AtomicBool,
    dictation: dictation::Broker,
}

#[derive(Default)]
struct SetupSlot {
    running: Option<(std::process::Child, std::process::ChildStdin)>,
    last: Option<ClaudeSetup>,
}

struct AppHost(AppHandle, SpeakerAssignmentProbe);

impl bridge::Host for AppHost {
    fn meeting_coach(
        &self,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Endpoint>> + Send>> {
        let app = self.0.clone();
        Box::pin(async move {
            tauri::async_runtime::spawn_blocking(move || {
                let state = app.state::<CoachState>();
                ensure_coach(&app, &state, &app.coach().settings()?)
            })
            .await
            .map_err(|error| Error::Other(error.to_string()))?
        })
    }
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

    fn pause_recording(&self, session_id: String, paused: bool) -> RecordingControlFuture {
        match self.0.try_state::<CoachState>() {
            Some(state) => (state.pause_recording)(self.0.clone(), session_id, paused),
            None => Box::pin(async { false }),
        }
    }
    fn start_recording(&self, session_id: String) -> RecordingControlFuture {
        let app = self.0.clone();
        Box::pin(async move {
            let Some(window) = app.get_webview_window("main") else {
                return false;
            };
            let expires_at_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64
                + 20_000;
            if tauri_specta::Event::emit_to(
                &BrowserRecordingRequested {
                    session_id: session_id.clone(),
                    expires_at_ms,
                },
                &app,
                tauri::EventTarget::webview_window(window.label()),
            )
            .is_err()
            {
                return false;
            }
            let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(22);
            loop {
                let state = app.state::<CoachState>();
                if (state.recording)(app.clone())
                    .await
                    .is_some_and(|recording| {
                        recording.active_session_id.as_deref() == Some(&session_id)
                    })
                {
                    return true;
                }
                if tokio::time::Instant::now() >= deadline {
                    (state.stop_recording)(app.clone(), session_id.clone()).await;
                    tracing::warn!(%session_id, "browser_recording_start_timed_out");
                    return false;
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        })
    }
    fn stop_recording(&self, session_id: String) -> RecordingControlFuture {
        match self.0.try_state::<CoachState>() {
            Some(state) => (state.stop_recording)(self.0.clone(), session_id),
            None => Box::pin(async { false }),
        }
    }

    fn speaker_assigned(&self, session_id: String) -> SpeakerAssignmentFuture {
        (self.1)(self.0.clone(), session_id)
    }

    fn dictation(&self, recording_id: String, action: DictationAction) -> DictationFuture {
        let app = self.0.clone();
        Box::pin(async move {
            let state = app.state::<CoachState>();
            state
                .dictation
                .request(recording_id, action, |event| {
                    let window = app.get_webview_window("main").ok_or_else(|| {
                        Error::Other("the main desktop window is unavailable".into())
                    })?;
                    tauri_specta::Event::emit_to(
                        &event,
                        &app,
                        tauri::EventTarget::webview_window(window.label()),
                    )?;
                    Ok(())
                })
                .await
        })
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
        if !nudge.seen
            && let Some(state) = self.0.try_state::<CoachState>()
        {
            state.unseen_nudge.store(true, Ordering::SeqCst);
            attention_changed(&self.0);
        }
        if let Err(error) = tauri_specta::Event::emit(&nudge, &self.0) {
            tracing::warn!(%error, "coach_nudge_emit_failed");
        }
    }

    fn evidence(&self, evidence: CoachEvidence) {
        if let Err(error) = tauri_specta::Event::emit(&evidence, &self.0) {
            tracing::warn!(%error, "coach_evidence_emit_failed");
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
    let started = bridge::start(AppHost(app.clone(), state.speaker_assigned.clone()))?;
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
        // Never wait: a coach that is still starting holds this lock for seconds.
        self.app.try_state::<CoachState>().is_some_and(|state| {
            state
                .coach
                .try_lock()
                .is_ok_and(|mut slot| slot.as_mut().is_some_and(Sidecar::is_running))
        })
    }

    /// A nudge arrived while the coach was out of view and hasn't been read there yet.
    pub fn has_unseen_nudge(&self) -> bool {
        self.app
            .try_state::<CoachState>()
            .is_some_and(|state| state.unseen_nudge.load(Ordering::SeqCst))
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
        self.provider_account(CoachProvider::Claude)
    }

    pub fn sign_in_to_claude(&self) -> Result<()> {
        self.sign_in_to_provider(CoachProvider::Claude)
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

    pub fn provider_account(&self, provider: CoachProvider) -> Result<ClaudeAccount> {
        let stdout = run_sidecar(
            &self.app,
            vec![
                "--auth-status".into(),
                "--provider".into(),
                provider.as_str().into(),
            ],
            "couldn't check the AI sign-in",
        )?;
        Ok(serde_json::from_slice(&stdout)?)
    }

    pub fn sign_in_to_provider(&self, provider: CoachProvider) -> Result<()> {
        let state = self.app.state::<CoachState>();
        let slot = match provider {
            CoachProvider::Claude => &state.sign_in[0],
            CoachProvider::Codex => &state.sign_in[1],
        };
        let _sign_in = slot.try_lock().map_err(|error| match error {
            std::sync::TryLockError::WouldBlock => Error::Other(format!(
                "{} sign-in is already in progress",
                provider.as_str()
            )),
            std::sync::TryLockError::Poisoned(error) => Error::Other(error.to_string()),
        })?;
        run_sidecar(
            &self.app,
            vec![
                "--sign-in".into(),
                "--provider".into(),
                provider.as_str().into(),
            ],
            "couldn't start the AI sign-in",
        )?;
        Ok(())
    }

    pub fn provider_setup(&self, provider: CoachProvider) -> Result<ClaudeSetup> {
        self.setup_provider(provider, false)
    }

    pub fn retry_provider_setup(&self, provider: CoachProvider) -> Result<ClaudeSetup> {
        self.setup_provider(provider, true)
    }

    fn setup_provider(&self, provider: CoachProvider, retry: bool) -> Result<ClaudeSetup> {
        let state = self.app.state::<CoachState>();
        let slot = match provider {
            CoachProvider::Claude => &state.setup,
            CoachProvider::Codex => &state.codex_setup,
        };
        let mut slot = slot
            .lock()
            .map_err(|error| Error::Other(error.to_string()))?;
        let current = poll_provider_setup(&self.app, &mut slot, provider)?;
        if slot.running.is_none()
            && (slot.last.is_none() || (retry && current != ClaudeSetup::Ready))
        {
            start_provider_setup(&self.app, &mut slot, provider)?;
        }
        poll_provider_setup(&self.app, &mut slot, provider)
    }

    pub fn claude_setup(&self) -> Result<ClaudeSetup> {
        self.provider_setup(CoachProvider::Claude)
    }

    pub fn retry_claude_setup(&self) -> Result<ClaudeSetup> {
        self.retry_provider_setup(CoachProvider::Claude)
    }

    pub fn show_assistant(&self) -> Result<()> {
        window::show_assistant(&self.app, &self.assistant_endpoint()?)
    }

    pub fn assistant_endpoint(&self) -> Result<Endpoint> {
        let state = self.app.state::<CoachState>();
        ensure_assistant(&self.app, &state, &self.settings()?)
    }

    pub fn llm_endpoint(&self) -> Result<Endpoint> {
        let state = self.app.state::<CoachState>();
        let claude_dir = claude_dir(&self.app)?;
        ensure(&state.llm, process::LLM_KEY.to_string(), |port| {
            process::sidecar_command(process::llm_args(port), &claude_dir)
        })
    }

    pub async fn is_answering(&self) -> bool {
        let endpoints = {
            let state = self.app.state::<CoachState>();
            let mut endpoints = Vec::new();
            for slot in [&state.coach, &state.assistant] {
                let Ok(mut slot) = lock(slot) else {
                    return true;
                };
                if let Some(sidecar) = slot.as_mut()
                    && sidecar.is_running()
                {
                    endpoints.push(sidecar.endpoint());
                }
            }
            endpoints
        };
        let client = match http_client() {
            Ok(client) => client,
            Err(error) => {
                tracing::warn!(%error, "coach_busy_probe_failed");
                return true;
            }
        };
        for endpoint in endpoints {
            if busy::answering(&client, &endpoint).await {
                return true;
            }
        }
        false
    }
}

fn start_provider_setup(
    app: &AppHandle,
    slot: &mut SetupSlot,
    provider: CoachProvider,
) -> Result<()> {
    let mut child = process::sidecar_command(
        vec![
            match provider {
                CoachProvider::Claude => "--prepare-claude-code",
                CoachProvider::Codex => "--prepare-codex",
            }
            .into(),
            "--exit-with-stdin".into(),
        ],
        &claude_dir(app)?,
    )?
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::piped())
    .spawn()?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| Error::Other("the AI runtime setup has no input".into()))?;
    slot.running = Some((child, stdin));
    slot.last = None;
    Ok(())
}

fn poll_provider_setup(
    app: &AppHandle,
    slot: &mut SetupSlot,
    provider: CoachProvider,
) -> Result<ClaudeSetup> {
    if let Some((child, _)) = slot.running.as_mut() {
        match child.try_wait()? {
            None => {
                let percent =
                    std::fs::read_to_string(provider_dir(app, provider)?.join(".install.progress"))
                        .ok()
                        .and_then(|progress| claude_code::download_percent(&progress));
                return Ok(ClaudeSetup::Preparing { percent });
            }
            Some(status) => {
                let mut stderr = String::new();
                if let Some(mut pipe) = child.stderr.take() {
                    std::io::Read::read_to_string(&mut pipe, &mut stderr)?;
                }
                let finished = if !status.success() && stderr.trim().is_empty() {
                    ClaudeSetup::Failed {
                        message: format!("{} could not be set up.", provider.as_str()),
                    }
                } else {
                    claude_code::finished(status.success(), &stderr)
                };
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

fn provider_dir(app: &AppHandle, provider: CoachProvider) -> Result<PathBuf> {
    Ok(app.path().app_cache_dir()?.join(match provider {
        CoachProvider::Claude => "claude-code",
        CoachProvider::Codex => "codex",
    }))
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
        .user_agent(concat!("cue-coach/", env!("CARGO_PKG_VERSION")))
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
        model: settings.selected_model().to_string(),
        claude_model: settings.model.as_str().to_string(),
        codex_model: settings.codex_model.clone(),
        provider: settings.provider,
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

#[derive(Clone, Copy, PartialEq)]
enum ConversationScope {
    Meeting,
    Library,
}

fn ensure_coach(app: &AppHandle, state: &CoachState, settings: &CoachSettings) -> Result<Endpoint> {
    ensure_conversation(
        app,
        state,
        settings,
        &state.coach,
        ConversationScope::Meeting,
    )
}

fn ensure_assistant(
    app: &AppHandle,
    state: &CoachState,
    settings: &CoachSettings,
) -> Result<Endpoint> {
    ensure_conversation(
        app,
        state,
        settings,
        &state.assistant,
        ConversationScope::Library,
    )
}

fn ensure_conversation(
    app: &AppHandle,
    state: &CoachState,
    settings: &CoachSettings,
    slot: &Mutex<Option<Sidecar>>,
    scope: ConversationScope,
) -> Result<Endpoint> {
    let servers = resolve_servers(app, settings);
    let key = coach_launch(state, settings, &servers, 0, None, None)?.key();
    let bridge = app_bridge(app, state)?;
    ensure(slot, key, |port| {
        let mcp_config =
            mcp::write_config(&mcp_config_dir(), &servers, &settings.claude_connectors)?;
        let instructions = mcp::write_instructions(&instructions_dir(), &settings.instructions)?;
        let mut args = process::server_args(&process::Launch {
            protected: protected_dirs(app),
            ..coach_launch(state, settings, &servers, port, mcp_config, instructions)?
        });
        if scope == ConversationScope::Library {
            args.extend(["--scope".into(), "library".into()]);
        }
        let mut command = process::sidecar_command(args, &claude_dir(app)?)?;
        bridge.apply(&mut command);
        Ok(command)
    })
}

// Without a chosen folder the coach still runs, in an empty folder of its own, and offers to pick one.
fn no_project_dir() -> Result<PathBuf> {
    let dir = std::env::temp_dir().join("cue-coach-no-project");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn mcp_config_dir() -> PathBuf {
    std::env::temp_dir().join("cue-coach-mcp")
}

fn instructions_dir() -> PathBuf {
    std::env::temp_dir().join("cue-coach-instructions")
}

fn restart_running_coach(app: &AppHandle, settings: &CoachSettings) -> Result<()> {
    let state = app.state::<CoachState>();
    let assistant_running = lock(&state.assistant)?
        .as_mut()
        .is_some_and(|sidecar| sidecar.is_running());
    if assistant_running {
        let endpoint = ensure_assistant(app, &state, settings)?;
        window::reload_assistant(app, &endpoint)?;
    }
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

/// Emitted when [`Coach::is_running`] or [`Coach::has_unseen_nudge`] may have changed, for the
/// menu bar icon.
pub const ATTENTION_EVENT: &str = "coach://attention";

fn attention_changed(app: &AppHandle) {
    if let Err(error) = app.emit(ATTENTION_EVENT, ()) {
        tracing::warn!(%error, "coach_attention_emit_failed");
    }
}

pub(crate) fn nudges_seen(app: &AppHandle) {
    if let Some(state) = app.try_state::<CoachState>()
        && state.unseen_nudge.swap(false, Ordering::SeqCst)
    {
        attention_changed(app);
    }
}

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
    attention_changed(app);
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
            commands::browser_extension_setup,
            commands::configure_browser_extension,
            commands::complete_dictation,
            commands::llm_endpoint,
            commands::assistant_endpoint,
            commands::show_assistant,
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
            commands::provider_account,
            commands::sign_in_to_provider,
            commands::provider_setup,
            commands::retry_provider_setup,
        ])
        .events(tauri_specta::collect_events![
            BrowserRecordingRequested,
            CoachDictationRequested,
            CoachNudged,
            CoachFocused,
            CoachEvidence
        ])
        .typ::<browser::BrowserRequest>()
        .typ::<browser::BrowserResponse>()
        .typ::<browser::MeetingBrowserContext>()
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

pub fn init(
    db: Option<PathBuf>,
    recording: RecordingProbe,
    stop_recording: StopRecording,
    pause_recording: PauseRecording,
    speaker_assigned: SpeakerAssignmentProbe,
) -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app, _api| {
            specta_builder.mount_events(app);
            app.manage(CoachState {
                db: db.clone(),
                recording: recording.clone(),
                stop_recording: stop_recording.clone(),
                pause_recording: pause_recording.clone(),
                speaker_assigned: speaker_assigned.clone(),
                coach: Mutex::new(None),
                llm: Mutex::new(None),
                assistant: Mutex::new(None),
                opening: Mutex::new(()),
                bridge: Mutex::new(None),
                browser_registration: Mutex::new(()),
                setup: Mutex::new(SetupSlot::default()),
                codex_setup: Mutex::new(SetupSlot::default()),
                sign_in: std::array::from_fn(|_| Mutex::new(())),
                unseen_nudge: AtomicBool::new(false),
                dictation: dictation::Broker::default(),
            });
            if let Err(error) = (|| -> Result<()> {
                let config = app.path().app_config_dir()?;
                if let Some(registration) = native_host::read(&config)? {
                    if let Some(binary) = process::bundled_coach() {
                        native_host::register(
                            &config,
                            &app.path().home_dir()?,
                            &binary,
                            Some(&registration),
                        )?;
                    }
                    app_bridge(app, &app.state::<CoachState>())?;
                }
                Ok(())
            })() {
                tracing::error!(%error, "browser_bridge_start_failed");
            }
            if let Err(error) = app
                .coach()
                .settings()
                .and_then(|settings| app.coach().provider_setup(settings.provider))
            {
                tracing::error!(%error, "claude_setup_start_failed");
            }
            Ok(())
        })
        .on_event(|app, event| {
            if let RunEvent::Exit = event
                && let Some(state) = app.try_state::<CoachState>()
            {
                for slot in [&state.coach, &state.assistant, &state.llm] {
                    if let Ok(mut slot) = slot.lock() {
                        slot.take();
                    }
                }
                for slot in [&state.setup, &state.codex_setup] {
                    if let Ok(mut setup) = slot.lock()
                        && let Some((mut child, stdin)) = setup.running.take()
                    {
                        drop(stdin);
                        if let Err(error) = child.kill() {
                            tracing::warn!(%error, "provider_setup_stop_failed");
                        }
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
            stop_recording: std::sync::Arc::new(|_, _| Box::pin(async { false })),
            pause_recording: std::sync::Arc::new(|_, _, _| Box::pin(async { false })),
            speaker_assigned: std::sync::Arc::new(|_, _| Box::pin(async {})),
            coach: Mutex::new(None),
            llm: Mutex::new(None),
            assistant: Mutex::new(None),
            opening: Mutex::new(()),
            bridge: Mutex::new(None),
            browser_registration: Mutex::new(()),
            setup: Mutex::new(SetupSlot::default()),
            codex_setup: Mutex::new(SetupSlot::default()),
            sign_in: std::array::from_fn(|_| Mutex::new(())),
            unseen_nudge: AtomicBool::new(false),
            dictation: dictation::Broker::default(),
        };
        let launch = coach_launch(&state, &CoachSettings::default(), &[], 0, None, None).unwrap();
        assert!(launch.project.is_dir());
        assert!(process::server_args(&launch).contains(&"--no-project".into()));
    }
}
