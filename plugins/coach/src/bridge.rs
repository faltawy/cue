use std::future::Future;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::pin::Pin;
use std::process::Command;
use std::sync::{Arc, Mutex};

use axum::extract::{Path, Request, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use sqlx::SqlitePool;

use crate::edits::{EditError, EditOwner, Edits, NoteStyle};
use crate::library::{
    LibraryChange, NewNote, NoteChanges, OrganizationFields, PersonFields, TemplateFields,
};
use crate::series::{self, MeetingProject};
use crate::settings::{self, SeriesProject};
use crate::{CoachEvidence, CoachNudged, DictationAction, Error, Result};

#[derive(Clone, Copy)]
enum EditAuthority {
    Meeting,
    Library,
}
impl EditAuthority {
    fn owner(self, session_id: &str) -> EditOwner<'_> {
        match self {
            Self::Meeting => EditOwner::Meeting(session_id),
            Self::Library => EditOwner::Library,
        }
    }
}

pub const URL_ENV: &str = "CUE_COACH_APP_URL";
pub const TOKEN_ENV: &str = "CUE_COACH_APP_TOKEN";

pub type DictationFuture = Pin<Box<dyn Future<Output = Result<Option<String>>> + Send>>;
pub type RecordingControlFuture = Pin<Box<dyn Future<Output = bool> + Send>>;
pub type RecordingSessionsFuture = Pin<Box<dyn Future<Output = Option<Vec<String>>> + Send>>;
pub type RecordingFuture = Pin<Box<dyn Future<Output = Option<Recording>> + Send>>;
pub type SpeakerAssignmentFuture = Pin<Box<dyn Future<Output = ()> + Send>>;

pub trait Host: Send + Sync + 'static {
    fn meeting_coach(
        &self,
    ) -> Pin<Box<dyn Future<Output = Result<crate::process::Endpoint>> + Send>> {
        Box::pin(async { Err(Error::Other("meeting coach unavailable".into())) })
    }
    fn pool(&self) -> Result<SqlitePool>;
    fn recording_sessions(&self) -> RecordingFuture;
    fn pause_recording(&self, _session_id: String, _paused: bool) -> RecordingControlFuture {
        Box::pin(async { false })
    }
    fn start_recording(&self, _session_id: String) -> RecordingControlFuture {
        Box::pin(async { false })
    }
    fn stop_recording(&self, _session_id: String) -> RecordingControlFuture {
        Box::pin(async { false })
    }
    fn speaker_assigned(&self, _session_id: String) -> SpeakerAssignmentFuture {
        Box::pin(async {})
    }
    fn dictation(&self, _recording_id: String, _action: DictationAction) -> DictationFuture {
        Box::pin(async { Err(Error::Other("dictation is unavailable".into())) })
    }
    fn config_dir(&self) -> Result<PathBuf>;
    fn default_project(&self) -> Result<PathBuf>;
    fn pick_folder(&self, title: &str) -> Result<Option<PathBuf>>;
    fn choose_default_project(&self) -> Result<()>;
    fn nudged(&self, nudge: CoachNudged);
    fn evidence(&self, evidence: CoachEvidence);
}

struct BridgeState {
    host: Arc<dyn Host>,
    token: String,
    edits: Edits,
    browser_recording: tokio::sync::Mutex<Option<(String, String)>>,
    browser_token: Arc<Mutex<Option<String>>>,
    browser: Arc<Mutex<crate::browser::BrowserHub>>,
}

#[derive(Clone)]
pub struct Bridge {
    pub url: String,
    token: String,
    browser_token: Arc<Mutex<Option<String>>>,
    browser: Arc<Mutex<crate::browser::BrowserHub>>,
}

impl Bridge {
    pub fn configure_browser(
        &self,
        config: &std::path::Path,
        registration: Option<&crate::native_host::BrowserRegistration>,
    ) -> Result<()> {
        let mut token = self
            .browser_token
            .lock()
            .map_err(|e| Error::Other(e.to_string()))?;
        *token = None;
        *self
            .browser
            .lock()
            .map_err(|e| Error::Other(e.to_string()))? = Default::default();
        if let Some(registration) = registration {
            let binary = crate::process::bundled_coach().ok_or_else(|| {
                Error::Other("browser connection requires a bundled Cue app".into())
            })?;
            let secret = format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            );
            crate::native_host::publish(config, &binary, &self.url, &secret, registration)?;
            *token = Some(secret);
        }
        tracing::info!(
            enabled = registration.is_some(),
            "browser_bridge_configured"
        );
        Ok(())
    }

    pub fn apply(&self, command: &mut Command) {
        command.env(URL_ENV, &self.url).env(TOKEN_ENV, &self.token);
    }
}

pub fn start(host: impl Host) -> Result<Bridge> {
    let listener = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
    listener.set_nonblocking(true)?;
    let config = host.config_dir()?;
    let bridge = Bridge {
        url: format!("http://{}", listener.local_addr()?),
        browser_token: Arc::new(Mutex::new(None)),
        browser: Arc::new(Mutex::new(Default::default())),
        token: format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        ),
    };
    if let Err(error) = crate::native_host::read(&config)
        .and_then(|registration| bridge.configure_browser(&config, registration.as_ref()))
    {
        tracing::error!(%error, "browser_bridge_configuration_failed");
    }
    let app = browser_router(
        &bridge.token,
        host,
        bridge.browser_token.clone(),
        bridge.browser.clone(),
    );
    tauri::async_runtime::spawn(async move {
        let served = match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => axum::serve(listener, app).await,
            Err(error) => Err(error),
        };
        if let Err(error) = served {
            tracing::error!(%error, "coach_bridge_stopped");
        }
    });
    Ok(bridge)
}

#[cfg(test)]
fn router(token: &str, host: impl Host) -> Router {
    browser_router(
        token,
        host,
        Arc::new(Mutex::new(None)),
        Arc::new(Mutex::new(Default::default())),
    )
}

fn browser_router(
    token: &str,
    host: impl Host,
    browser_token: Arc<Mutex<Option<String>>>,
    browser: Arc<Mutex<crate::browser::BrowserHub>>,
) -> Router {
    let host: Arc<dyn Host> = Arc::new(host);
    let source = host.clone();
    let state = Arc::new(BridgeState {
        browser_recording: tokio::sync::Mutex::new(None),
        host,
        browser_token,
        browser,
        token: token.to_string(),
        edits: Edits::following(Arc::new(move || {
            let future = source.recording_sessions();
            Box::pin(async move { future.await.map(|recording| recording.session_ids) })
        })),
    });
    Router::new()
        .route(
            "/browser",
            post(browser_request).layer(axum::extract::DefaultBodyLimit::max(
                crate::browser::MAX_MESSAGE,
            )),
        )
        .route(
            "/meeting/{session_id}/browser-context",
            get(browser_context),
        )
        .route("/meeting/{session_id}/browser-status", get(browser_status))
        .route(
            "/browser-coach/{*path}",
            get(browser_coach)
                .post(browser_coach)
                .layer(axum::extract::DefaultBodyLimit::max(16 * 1024 * 1024)),
        )
        .route("/recording", get(recording))
        .route("/dictation", post(dictation))
        .route("/meeting/{session_id}/recording/stop", post(stop_recording))
        .route(
            "/meeting/{session_id}/recording/pause",
            post(pause_recording),
        )
        .route(
            "/meeting/{session_id}/recording/resume",
            post(resume_recording),
        )
        .route("/project", post(choose_default_project))
        .route("/meeting/{session_id}/project", get(meeting_project))
        .route(
            "/meeting/{session_id}/series-project",
            post(choose_series_project).delete(clear_series_project),
        )
        .route("/meeting/{session_id}/nudge", post(nudged))
        .route("/meeting/{session_id}/evidence", post(open_evidence))
        .route("/meeting/{session_id}/notes", post(append_note))
        .route(
            "/meeting/{session_id}/transcript/speakers",
            post(assign_transcript_speaker),
        )
        .route(
            "/meeting/{session_id}/transcript/corrections",
            post(correct_transcript),
        )
        .route("/meeting/{session_id}/action-items", post(add_action_item))
        .route(
            "/meeting/{session_id}/action-items/{task_id}/complete",
            post(complete_action_item),
        )
        .route("/meeting/{session_id}/undo", post(undo))
        .route("/meeting/{session_id}/library/notes", post(create_note))
        .route(
            "/meeting/{session_id}/library/notes/{note_id}",
            post(update_note),
        )
        .route("/meeting/{session_id}/library/folders", post(create_folder))
        .route("/meeting/{session_id}/library/people", post(create_person))
        .route(
            "/meeting/{session_id}/library/people/{person_id}",
            post(update_person),
        )
        .route(
            "/meeting/{session_id}/library/organizations",
            post(create_organization),
        )
        .route(
            "/meeting/{session_id}/library/organizations/{organization_id}",
            post(update_organization),
        )
        .route(
            "/meeting/{session_id}/library/participants",
            post(add_participant),
        )
        .route(
            "/meeting/{session_id}/library/templates",
            post(create_template),
        )
        .route(
            "/meeting/{session_id}/library/templates/{template_id}",
            post(update_template),
        )
        .route("/library/notes", post(create_note))
        .route("/library/notes/{note_id}", post(update_note))
        .route("/library/folders", post(create_folder))
        .route("/library/people", post(create_person))
        .route("/library/people/{person_id}", post(update_person))
        .route("/library/organizations", post(create_organization))
        .route(
            "/library/organizations/{organization_id}",
            post(update_organization),
        )
        .route("/library/participants", post(add_participant))
        .route("/library/templates", post(create_template))
        .route("/library/templates/{template_id}", post(update_template))
        .route("/library/undo", post(undo_library))
        .nest(
            "/library/meeting",
            Router::new()
                .route("/{session_id}/notes", post(append_note))
                .route("/{session_id}/action-items", post(add_action_item))
                .route(
                    "/{session_id}/action-items/{task_id}/complete",
                    post(complete_action_item),
                )
                .route(
                    "/{session_id}/transcript/speakers",
                    post(assign_transcript_speaker),
                )
                .route(
                    "/{session_id}/transcript/corrections",
                    post(correct_transcript),
                )
                .layer(Extension(EditAuthority::Library)),
        )
        .layer(Extension(EditAuthority::Meeting))
        .layer(middleware::from_fn_with_state(state.clone(), authorize))
        .with_state(state)
}

fn same_secret(left: &[u8], right: &[u8]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .fold(0u8, |diff, (a, b)| diff | (a ^ b))
            == 0
}

async fn authorize(
    State(state): State<Arc<BridgeState>>,
    request: Request,
    next: Next,
) -> Response {
    let presented = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or_default();
    let authorized = if request.uri().path().starts_with("/browser-coach/") {
        let active = active_browser_session(&state).await;
        state.browser.lock().ok().is_some_and(|mut browser| {
            browser
                .authorize_coach(presented, active.as_deref())
                .is_ok()
        })
    } else if request.uri().path() == "/browser" {
        state
            .browser_token
            .lock()
            .ok()
            .and_then(|token| {
                token
                    .as_ref()
                    .map(|token| same_secret(presented.as_bytes(), token.as_bytes()))
            })
            .unwrap_or(false)
    } else {
        same_secret(presented.as_bytes(), state.token.as_bytes())
    };
    if !authorized {
        return failure(StatusCode::UNAUTHORIZED, "missing or wrong coach token");
    }
    next.run(request).await
}

fn failure(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(serde_json::json!({ "error": message.into() }))).into_response()
}

enum BridgeError {
    Edit(EditError),
    Plugin(Error),
}

impl From<EditError> for BridgeError {
    fn from(error: EditError) -> Self {
        Self::Edit(error)
    }
}

impl From<Error> for BridgeError {
    fn from(error: Error) -> Self {
        Self::Plugin(error)
    }
}

impl From<sqlx::Error> for BridgeError {
    fn from(error: sqlx::Error) -> Self {
        Self::Edit(EditError::Db(error))
    }
}

impl IntoResponse for BridgeError {
    fn into_response(self) -> Response {
        let status = match &self {
            Self::Edit(EditError::NotCurrentMeeting | EditError::Locked) => StatusCode::FORBIDDEN,
            Self::Edit(
                EditError::NoMeeting | EditError::UnknownTask(_) | EditError::Unknown(..),
            ) => StatusCode::NOT_FOUND,
            Self::Edit(EditError::UnsupportedNote) => StatusCode::UNPROCESSABLE_ENTITY,
            Self::Edit(
                EditError::NothingToUndo
                | EditError::NotLatest
                | EditError::ChangedSince
                | EditError::Kept(_),
            ) => StatusCode::CONFLICT,
            Self::Edit(EditError::Invalid(_)) => StatusCode::BAD_REQUEST,
            Self::Edit(EditError::Db(_) | EditError::Json(_)) | Self::Plugin(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };
        let message = match self {
            Self::Edit(error) => error.to_string(),
            Self::Plugin(error) => error.to_string(),
        };
        if status == StatusCode::INTERNAL_SERVER_ERROR {
            tracing::error!(error = %message, "coach_bridge_failed");
        }
        failure(status, message)
    }
}

type Reply<T> = std::result::Result<Json<T>, BridgeError>;

#[derive(serde::Serialize)]
pub struct Recording {
    pub active_session_id: Option<String>,
    pub session_ids: Vec<String>,
    pub paused_session_ids: Vec<String>,
}

async fn recording(State(state): State<Arc<BridgeState>>) -> Response {
    match state.host.recording_sessions().await {
        Some(recording) => Json(recording).into_response(),
        None => failure(
            StatusCode::SERVICE_UNAVAILABLE,
            "the app could not tell what it is recording",
        ),
    }
}

async fn pause_recording(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
) -> Response {
    set_recording_paused(state, session_id, true).await
}
async fn resume_recording(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
) -> Response {
    set_recording_paused(state, session_id, false).await
}
async fn set_recording_paused(
    state: Arc<BridgeState>,
    session_id: String,
    paused: bool,
) -> Response {
    let changed = state.host.pause_recording(session_id.clone(), paused).await;
    tracing::info!(%session_id, paused, changed, "coach_recording_pause_requested");
    if changed {
        Json(serde_json::json!({"paused": paused})).into_response()
    } else {
        failure(
            StatusCode::CONFLICT,
            "This meeting is not open for recording. No other meeting was changed.",
        )
    }
}

async fn stop_recording(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
) -> Response {
    let stopped = state.host.stop_recording(session_id.clone()).await;
    tracing::info!(%session_id, stopped, "coach_stop_recording");
    if stopped {
        Json(serde_json::json!({ "stopped": true })).into_response()
    } else {
        failure(
            StatusCode::CONFLICT,
            "This meeting is not recording. No recording was stopped.",
        )
    }
}

#[derive(serde::Deserialize)]
struct DictationRequest {
    recording_id: String,
    action: DictationAction,
}

async fn dictation(
    State(state): State<Arc<BridgeState>>,
    request: std::result::Result<Json<DictationRequest>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let Json(request) = match request {
        Ok(request) => request,
        Err(error) => return failure(StatusCode::BAD_REQUEST, error.body_text()),
    };
    if uuid::Uuid::parse_str(&request.recording_id).is_err() {
        return failure(StatusCode::BAD_REQUEST, "recording_id must be a UUID");
    }
    match state
        .host
        .dictation(request.recording_id, request.action)
        .await
    {
        Ok(text) => Json(serde_json::json!({ "text": text })).into_response(),
        Err(error) => BridgeError::Plugin(error).into_response(),
    }
}

async fn resolve_project(
    state: &BridgeState,
    session_id: &str,
) -> std::result::Result<MeetingProject, BridgeError> {
    let pool = state.host.pool()?;
    let series = series::meeting_series(&pool, session_id)
        .await?
        .ok_or(EditError::NoMeeting)?;
    let projects = settings::load_series_projects(&state.host.config_dir()?)?;
    Ok(series::resolve(
        session_id,
        series,
        &projects,
        &state.host.default_project()?,
    ))
}

// Picking the folder restarts the coach with it, so the caller may not see this answer.
async fn choose_default_project(
    State(state): State<Arc<BridgeState>>,
) -> std::result::Result<Response, BridgeError> {
    let host = state.clone();
    tokio::task::spawn_blocking(move || host.host.choose_default_project())
        .await
        .map_err(|error| Error::Other(error.to_string()))??;
    Ok(StatusCode::NO_CONTENT.into_response())
}

async fn meeting_project(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
) -> Reply<MeetingProject> {
    Ok(Json(resolve_project(&state, &session_id).await?))
}

async fn choose_series_project(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
) -> std::result::Result<Response, BridgeError> {
    let current = resolve_project(&state, &session_id).await?;
    let Some(series) = current.series else {
        return Err(
            EditError::Invalid("this meeting is not part of a calendar series".into()).into(),
        );
    };
    let title = format!("Choose the project for “{}”", series.label);
    let picker = state.clone();
    let picked = tokio::task::spawn_blocking(move || picker.host.pick_folder(&title))
        .await
        .map_err(|error| Error::Other(error.to_string()))??;
    let Some(folder) = picked else {
        return Ok(StatusCode::NO_CONTENT.into_response());
    };
    settings::set_series_project(
        &state.host.config_dir()?,
        &series.key,
        Some(SeriesProject {
            project: folder.to_string_lossy().into_owned(),
            label: series.label,
        }),
    )?;
    Ok(Json(resolve_project(&state, &session_id).await?).into_response())
}

async fn clear_series_project(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
) -> Reply<MeetingProject> {
    let current = resolve_project(&state, &session_id).await?;
    if let Some(series) = &current.series {
        settings::set_series_project(&state.host.config_dir()?, &series.key, None)?;
    }
    Ok(Json(resolve_project(&state, &session_id).await?))
}

#[derive(serde::Deserialize)]
struct NudgeBody {
    tag: String,
    line: String,
}

async fn nudged(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<NudgeBody>,
) -> StatusCode {
    let active = active_browser_session(&state).await;
    if let Ok(mut browser) = state.browser.lock() {
        browser.nudge(&session_id, active.as_deref(), &body.tag, &body.line);
    }
    state.host.nudged(CoachNudged {
        session_id,
        tag: body.tag,
        line: body.line,
        seen: false,
    });
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
struct EvidenceBody {
    timestamp_ms: u64,
}

async fn open_evidence(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<EvidenceBody>,
) -> StatusCode {
    state.host.evidence(CoachEvidence {
        session_id,
        timestamp_ms: body.timestamp_ms,
    });
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
struct NoteBody {
    lines: Vec<String>,
    style: NoteStyle,
}

async fn append_note(
    Extension(authority): Extension<EditAuthority>,
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<NoteBody>,
) -> Reply<crate::edits::CoachEdit> {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .append_note_owned(
                &pool,
                &session_id,
                &body.lines,
                body.style,
                authority.owner(&session_id),
            )
            .await?,
    ))
}

#[derive(serde::Deserialize)]
struct AssignTranscriptSpeakerBody {
    channel: i64,
    speaker_index: i64,
    human_id: String,
}

async fn assign_transcript_speaker(
    Extension(authority): Extension<EditAuthority>,
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<AssignTranscriptSpeakerBody>,
) -> Reply<crate::edits::CoachEdit> {
    let pool = state.host.pool()?;
    let edit = state
        .edits
        .assign_transcript_speaker_owned(
            &pool,
            &session_id,
            body.channel,
            body.speaker_index,
            &body.human_id,
            authority.owner(&session_id),
        )
        .await?;
    state.host.speaker_assigned(session_id).await;
    Ok(Json(edit))
}

#[derive(serde::Deserialize)]
struct CorrectTranscriptBody {
    word_ids: Vec<String>,
    expected_text: String,
    replacement: String,
}

async fn correct_transcript(
    Extension(authority): Extension<EditAuthority>,
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<CorrectTranscriptBody>,
) -> Reply<crate::edits::CoachEdit> {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .correct_transcript_words_owned(
                &pool,
                &session_id,
                &body.word_ids,
                &body.expected_text,
                &body.replacement,
                authority.owner(&session_id),
            )
            .await?,
    ))
}

#[derive(serde::Deserialize)]
struct ActionItemBody {
    text: String,
}

async fn add_action_item(
    Extension(authority): Extension<EditAuthority>,
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<ActionItemBody>,
) -> Reply<crate::edits::CoachEdit> {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .add_action_item_owned(&pool, &session_id, &body.text, authority.owner(&session_id))
            .await?,
    ))
}

async fn complete_action_item(
    Extension(authority): Extension<EditAuthority>,
    State(state): State<Arc<BridgeState>>,
    Path((session_id, task_id)): Path<(String, String)>,
) -> Reply<crate::edits::CoachEdit> {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .complete_action_item_owned(&pool, &session_id, &task_id, authority.owner(&session_id))
            .await?,
    ))
}

#[derive(serde::Deserialize, Default)]
struct UndoBody {
    edit_id: Option<String>,
}

async fn undo(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    body: Option<Json<UndoBody>>,
) -> Reply<crate::edits::CoachEdit> {
    let pool = state.host.pool()?;
    let edit_id = body.and_then(|Json(body)| body.edit_id);
    let edit = state
        .edits
        .undo_last(&pool, &session_id, edit_id.as_deref())
        .await?;
    if edit.kind == crate::edits::EditKind::AssignSpeaker {
        state.host.speaker_assigned(session_id).await;
    }
    Ok(Json(edit))
}

#[derive(serde::Deserialize)]
struct LibraryPath {
    session_id: Option<String>,
    note_id: Option<String>,
    person_id: Option<String>,
    organization_id: Option<String>,
    template_id: Option<String>,
}
impl LibraryPath {
    fn owner(&self) -> EditOwner<'_> {
        self.session_id
            .as_deref()
            .map(EditOwner::Meeting)
            .unwrap_or(EditOwner::Library)
    }
}

async fn undo_library(
    State(state): State<Arc<BridgeState>>,
    body: Option<Json<UndoBody>>,
) -> Reply<crate::edits::CoachEdit> {
    let pool = state.host.pool()?;
    let edit_id = body.and_then(|Json(body)| body.edit_id);
    let edit = state
        .edits
        .undo_last(&pool, EditOwner::Library, edit_id.as_deref())
        .await?;
    if edit.kind == crate::edits::EditKind::AssignSpeaker {
        if let Some(session_id) = &edit.target_id {
            state.host.speaker_assigned(session_id.clone()).await;
        }
    }
    Ok(Json(edit))
}

type Changed = Reply<LibraryChange>;

async fn create_note(
    State(state): State<Arc<BridgeState>>,
    Path(path): Path<LibraryPath>,
    Json(body): Json<NewNote>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state.edits.create_note(&pool, path.owner(), body).await?,
    ))
}

async fn update_note(
    State(state): State<Arc<BridgeState>>,
    Path(path): Path<LibraryPath>,
    Json(body): Json<NoteChanges>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .update_note(
                &pool,
                path.owner(),
                path.note_id
                    .as_deref()
                    .ok_or(EditError::Invalid("Missing target id".into()))?,
                body,
            )
            .await?,
    ))
}

#[derive(serde::Deserialize)]
struct FolderBody {
    path: String,
}

async fn create_folder(
    State(state): State<Arc<BridgeState>>,
    Path(path): Path<LibraryPath>,
    Json(body): Json<FolderBody>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .create_folder(&pool, path.owner(), &body.path)
            .await?,
    ))
}

async fn create_person(
    State(state): State<Arc<BridgeState>>,
    Path(path): Path<LibraryPath>,
    Json(body): Json<PersonFields>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state.edits.create_person(&pool, path.owner(), body).await?,
    ))
}

async fn update_person(
    State(state): State<Arc<BridgeState>>,
    Path(path): Path<LibraryPath>,
    Json(body): Json<PersonFields>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .update_person(
                &pool,
                path.owner(),
                path.person_id
                    .as_deref()
                    .ok_or(EditError::Invalid("Missing target id".into()))?,
                body,
            )
            .await?,
    ))
}

async fn create_organization(
    State(state): State<Arc<BridgeState>>,
    Path(path): Path<LibraryPath>,
    Json(body): Json<OrganizationFields>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .create_organization(&pool, path.owner(), body)
            .await?,
    ))
}

async fn update_organization(
    State(state): State<Arc<BridgeState>>,
    Path(path): Path<LibraryPath>,
    Json(body): Json<OrganizationFields>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .update_organization(
                &pool,
                path.owner(),
                path.organization_id
                    .as_deref()
                    .ok_or(EditError::Invalid("Missing target id".into()))?,
                body,
            )
            .await?,
    ))
}

#[derive(serde::Deserialize)]
struct ParticipantBody {
    note_id: Option<String>,
    person_id: String,
}

async fn add_participant(
    State(state): State<Arc<BridgeState>>,
    Path(path): Path<LibraryPath>,
    Json(body): Json<ParticipantBody>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .add_participant(
                &pool,
                path.owner(),
                body.note_id.as_deref(),
                &body.person_id,
            )
            .await?,
    ))
}

async fn create_template(
    State(state): State<Arc<BridgeState>>,
    Path(path): Path<LibraryPath>,
    Json(body): Json<TemplateFields>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .create_template(&pool, path.owner(), body)
            .await?,
    ))
}

async fn update_template(
    State(state): State<Arc<BridgeState>>,
    Path(path): Path<LibraryPath>,
    Json(body): Json<TemplateFields>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .update_template(
                &pool,
                path.owner(),
                path.template_id
                    .as_deref()
                    .ok_or(EditError::Invalid("Missing target id".into()))?,
                body,
            )
            .await?,
    ))
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;
    use tower::ServiceExt;

    use super::*;

    struct TestHost {
        pool: SqlitePool,
        coach_url: Mutex<String>,
        config: tempfile::TempDir,
        default_project: tempfile::TempDir,
        picks: Mutex<Vec<Option<PathBuf>>>,
        recording: Mutex<Option<Vec<String>>>,
        paused: Mutex<Vec<String>>,
        evidence: Mutex<Vec<CoachEvidence>>,
        speaker_assignments: Mutex<Vec<String>>,
    }

    impl Host for Arc<TestHost> {
        fn meeting_coach(
            &self,
        ) -> Pin<Box<dyn Future<Output = Result<crate::process::Endpoint>> + Send>> {
            let url = self.coach_url.lock().unwrap().clone();
            Box::pin(async move {
                Ok(crate::process::Endpoint {
                    url,
                    token: "test-coach-credential".into(),
                })
            })
        }
        fn pool(&self) -> Result<SqlitePool> {
            Ok(self.pool.clone())
        }
        fn recording_sessions(&self) -> RecordingFuture {
            let recording = self.recording.lock().unwrap().clone();
            let paused_session_ids = self.paused.lock().unwrap().clone();
            Box::pin(async move {
                recording.map(|session_ids| Recording {
                    active_session_id: session_ids.first().cloned(),
                    session_ids,
                    paused_session_ids,
                })
            })
        }
        fn pause_recording(&self, session_id: String, paused: bool) -> RecordingControlFuture {
            let host = self.clone();
            Box::pin(async move {
                let recording = host.recording.lock().unwrap();
                if !recording
                    .as_ref()
                    .is_some_and(|ids| ids == &[session_id.clone()])
                {
                    return false;
                }
                *host.paused.lock().unwrap() = if paused { vec![session_id] } else { vec![] };
                true
            })
        }
        fn start_recording(&self, session_id: String) -> RecordingControlFuture {
            let host = self.clone();
            Box::pin(async move {
                *host.recording.lock().unwrap() = Some(vec![session_id]);
                true
            })
        }
        fn stop_recording(&self, session_id: String) -> RecordingControlFuture {
            let host = self.clone();
            Box::pin(async move {
                let mut recording = host.recording.lock().unwrap();
                if recording.as_ref().is_some_and(|ids| ids == &[session_id]) {
                    *recording = Some(Vec::new());
                    true
                } else {
                    false
                }
            })
        }
        fn speaker_assigned(&self, session_id: String) -> SpeakerAssignmentFuture {
            let host = self.clone();
            Box::pin(async move {
                host.speaker_assignments.lock().unwrap().push(session_id);
            })
        }
        fn dictation(&self, recording_id: String, action: DictationAction) -> DictationFuture {
            Box::pin(async move {
                let action = serde_json::to_value(action)?;
                Ok(Some(format!("{recording_id}:{}", action.as_str().unwrap())))
            })
        }
        fn config_dir(&self) -> Result<PathBuf> {
            Ok(self.config.path().to_path_buf())
        }
        fn default_project(&self) -> Result<PathBuf> {
            Ok(self.default_project.path().to_path_buf())
        }
        fn pick_folder(&self, _title: &str) -> Result<Option<PathBuf>> {
            Ok(self.picks.lock().unwrap().pop().flatten())
        }
        fn choose_default_project(&self) -> Result<()> {
            Ok(())
        }
        fn nudged(&self, _nudge: CoachNudged) {}
        fn evidence(&self, evidence: CoachEvidence) {
            self.evidence.lock().unwrap().push(evidence);
        }
    }

    const TOKEN: &str = "test-token";

    async fn test_host() -> Arc<TestHost> {
        let db = anlg_db_core::Db::connect_memory_plain().await.unwrap();
        anlg_db_app::prepare_schema(&db).await.unwrap();
        let pool = db.pool().clone();
        for (id, series_id, event, started) in [
            ("tuesday", "rec-1", r#"{"title":"Acme weekly"}"#, 1_000),
            ("thursday", "rec-1", r#"{"title":"Acme weekly"}"#, 2_000),
            ("adhoc", "", "", 500),
        ] {
            sqlx::query(
                "INSERT INTO sessions (id, series_id, event_json, title) VALUES (?, ?, ?, ?)",
            )
            .bind(id)
            .bind(series_id)
            .bind(event)
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query("INSERT INTO transcripts (id, session_id, started_at_ms) VALUES (?, ?, ?)")
                .bind(format!("t-{id}"))
                .bind(id)
                .bind(started)
                .execute(&pool)
                .await
                .unwrap();
        }
        Arc::new(TestHost {
            pool,
            coach_url: Mutex::new("http://127.0.0.1:4567".into()),
            config: tempfile::tempdir().unwrap(),
            default_project: tempfile::tempdir().unwrap(),
            picks: Mutex::new(Vec::new()),
            recording: Mutex::new(Some(Vec::new())),
            paused: Mutex::new(Vec::new()),
            evidence: Mutex::new(Vec::new()),
            speaker_assignments: Mutex::new(Vec::new()),
        })
    }

    async fn serve() -> (String, Arc<TestHost>) {
        let db = anlg_db_core::Db::connect_memory_plain().await.unwrap();
        anlg_db_app::prepare_schema(&db).await.unwrap();
        let pool = db.pool().clone();
        for (id, series_id, event, started) in [
            ("tuesday", "rec-1", r#"{"title":"Acme weekly"}"#, 1_000),
            ("thursday", "rec-1", r#"{"title":"Acme weekly"}"#, 2_000),
            ("adhoc", "", "", 500),
        ] {
            sqlx::query(
                "INSERT INTO sessions (id, series_id, event_json, title) VALUES (?, ?, ?, ?)",
            )
            .bind(id)
            .bind(series_id)
            .bind(event)
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query("INSERT INTO transcripts (id, session_id, started_at_ms) VALUES (?, ?, ?)")
                .bind(format!("t-{id}"))
                .bind(id)
                .bind(started)
                .execute(&pool)
                .await
                .unwrap();
        }
        let host = Arc::new(TestHost {
            pool,
            coach_url: Mutex::new("http://127.0.0.1:4567".into()),
            config: tempfile::tempdir().unwrap(),
            default_project: tempfile::tempdir().unwrap(),
            picks: Mutex::new(Vec::new()),
            recording: Mutex::new(Some(Vec::new())),
            paused: Mutex::new(Vec::new()),
            evidence: Mutex::new(Vec::new()),
            speaker_assignments: Mutex::new(Vec::new()),
        });
        let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let app = router(TOKEN, host.clone());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (url, host)
    }

    fn client() -> reqwest::Client {
        reqwest::Client::new()
    }

    #[tokio::test]
    async fn pause_and_resume_preserve_the_recording_and_reject_a_stale_target() {
        let host = test_host().await;
        *host.recording.lock().unwrap() = Some(vec!["thursday".into()]);
        let app = router(TOKEN, host.clone());
        for (session, action, status, paused) in [
            ("thursday", "pause", StatusCode::OK, true),
            ("tuesday", "resume", StatusCode::CONFLICT, true),
            ("thursday", "resume", StatusCode::OK, false),
        ] {
            let response = app
                .clone()
                .oneshot(
                    axum::http::Request::builder()
                        .method("POST")
                        .uri(format!("/meeting/{session}/recording/{action}"))
                        .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), status);
            let recording = host.recording_sessions().await.unwrap();
            assert_eq!(recording.session_ids, vec!["thursday"]);
            assert_eq!(
                recording.paused_session_ids,
                if paused { vec!["thursday"] } else { vec![] }
            );
        }
    }

    #[tokio::test]
    async fn browser_recording_approval_rejects_stale_state_and_starts_a_distinct_note() {
        let host = test_host().await;
        *host.recording.lock().unwrap() = Some(vec!["thursday".into()]);
        let source = host.clone();
        let state = BridgeState {
            host: Arc::new(host.clone()),
            token: TOKEN.into(),
            browser_token: Arc::new(Mutex::new(None)),
            browser: Arc::new(Mutex::new(Default::default())),
            browser_recording: tokio::sync::Mutex::new(Some((
                "thursday".into(),
                "https://meet.google.com/abc-defg-hij".into(),
            ))),
            edits: Edits::following(Arc::new(move || {
                let source = source.clone();
                Box::pin(async move { source.recording_sessions().await.map(|r| r.session_ids) })
            })),
        };
        let url = "https://meet.google.com/xyz-abcd-efg";
        assert!(matches!(
            record_browser_meeting(&state, url, "New call", Some("tuesday"), false).await,
            Err(crate::browser::BrowserFailure::MeetingChanged)
        ));
        assert_eq!(
            host.recording_sessions()
                .await
                .unwrap()
                .active_session_id
                .as_deref(),
            Some("thursday")
        );
        let id = record_browser_meeting(&state, url, "New call", Some("thursday"), false)
            .await
            .unwrap();
        assert_ne!(id, "thursday");
        assert_eq!(
            host.recording_sessions().await.unwrap().active_session_id,
            Some(id.clone())
        );
        let title: String = sqlx::query_scalar("SELECT title FROM sessions WHERE id = ?")
            .bind(&id)
            .fetch_one(&host.pool)
            .await
            .unwrap();
        assert_eq!(title, "New call");
        assert!(matches!(
            record_browser_meeting(&state, url, "New call", Some("thursday"), false).await,
            Err(crate::browser::BrowserFailure::MeetingChanged)
        ));
        assert_eq!(
            host.recording_sessions().await.unwrap().active_session_id,
            Some(id)
        );
    }

    #[tokio::test]
    async fn stop_recording_requires_authorization_and_preserves_a_different_active_meeting() {
        let host = test_host().await;
        *host.recording.lock().unwrap() = Some(vec!["thursday".into()]);
        let app = router(TOKEN, host.clone());
        for (token, session, expected) in [
            ("wrong", "thursday", StatusCode::UNAUTHORIZED),
            (TOKEN, "tuesday", StatusCode::CONFLICT),
            (TOKEN, "thursday", StatusCode::OK),
        ] {
            let response = app
                .clone()
                .oneshot(
                    axum::http::Request::builder()
                        .method("POST")
                        .uri(format!("/meeting/{session}/recording/stop"))
                        .header(header::AUTHORIZATION, format!("Bearer {token}"))
                        .body(axum::body::Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            let active = host.recording.lock().unwrap().clone().unwrap();
            if expected == StatusCode::OK {
                assert!(active.is_empty());
                let body = axum::body::to_bytes(response.into_body(), 1024)
                    .await
                    .unwrap();
                assert_eq!(
                    serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
                    serde_json::json!({"stopped": true})
                );
            } else {
                assert_eq!(active, vec!["thursday"]);
            }
        }
    }

    #[tokio::test]
    async fn dictation_requires_authorization_and_a_valid_recording_before_delegating() {
        let app = router(TOKEN, test_host().await);
        for (token, recording_id, expected) in [
            (
                "",
                "6a5def86-38af-4f6a-a1fd-6851abb5527a",
                StatusCode::UNAUTHORIZED,
            ),
            (TOKEN, "not-a-uuid", StatusCode::BAD_REQUEST),
            (
                TOKEN,
                "6a5def86-38af-4f6a-a1fd-6851abb5527a",
                StatusCode::OK,
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    axum::http::Request::builder()
                        .method("POST")
                        .uri("/dictation")
                        .header("authorization", format!("Bearer {token}"))
                        .header("content-type", "application/json")
                        .body(axum::body::Body::from(
                            serde_json::json!({
                                "recording_id": recording_id, "action": "stop"
                            })
                            .to_string(),
                        ))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), expected);
            if expected == StatusCode::OK {
                let body = axum::body::to_bytes(response.into_body(), 4096)
                    .await
                    .unwrap();
                assert_eq!(
                    serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
                    serde_json::json!({ "text": "6a5def86-38af-4f6a-a1fd-6851abb5527a:stop" })
                );
            }
        }
    }

    #[tokio::test]
    async fn evidence_route_carries_the_requested_session_and_millisecond_offset() {
        let host = test_host().await;
        let response = router(TOKEN, host.clone())
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/meeting/thursday/evidence")
                    .header("authorization", format!("Bearer {TOKEN}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(r#"{"timestamp_ms":456789}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert_eq!(
            *host.evidence.lock().unwrap(),
            vec![CoachEvidence {
                session_id: "thursday".into(),
                timestamp_ms: 456_789,
            }]
        );
    }

    #[tokio::test]
    async fn transcript_routes_require_the_attached_meeting_and_return_undoable_edits() {
        let host = test_host().await;
        sqlx::query("INSERT INTO humans (id, name) VALUES ('sara', 'Sara')")
            .execute(&host.pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO session_participants (id, session_id, human_id, source) VALUES ('p-sara', 'thursday', 'sara', 'manual')")
            .execute(&host.pool).await.unwrap();
        let words = serde_json::json!([
            {"id":"w1","text":" We","start_ms":0,"end_ms":200,"channel":1,"speaker_index":2},
            {"id":"w2","text":" ship","start_ms":210,"end_ms":400,"channel":1,"speaker_index":2},
            {"id":"w3","text":" Friday","start_ms":410,"end_ms":700,"channel":1,"speaker_index":2}
        ]);
        sqlx::query("UPDATE transcripts SET words_json = ?, ended_at_ms = 2000 WHERE session_id = 'thursday'")
            .bind(words.to_string()).execute(&host.pool).await.unwrap();
        let app = router(TOKEN, host.clone());
        let assigned = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/meeting/thursday/transcript/speakers")
                    .header("authorization", format!("Bearer {TOKEN}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        r#"{"channel":1,"speaker_index":2,"human_id":"sara"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(assigned.status(), StatusCode::OK);
        let assignment_bytes = axum::body::to_bytes(assigned.into_body(), usize::MAX)
            .await
            .unwrap();
        let assignment: serde_json::Value = serde_json::from_slice(&assignment_bytes).unwrap();
        assert_eq!(assignment["kind"], "assign_speaker");
        assert_eq!(*host.speaker_assignments.lock().unwrap(), ["thursday"]);

        let undone = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/meeting/thursday/undo")
                    .header("authorization", format!("Bearer {TOKEN}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(r#"{}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(undone.status(), StatusCode::OK);
        assert_eq!(
            *host.speaker_assignments.lock().unwrap(),
            ["thursday", "thursday"]
        );

        let corrected = app.clone().oneshot(
            axum::http::Request::builder().method("POST")
                .uri("/meeting/thursday/transcript/corrections")
                .header("authorization", format!("Bearer {TOKEN}"))
                .header("content-type", "application/json")
                .body(axum::body::Body::from(r#"{"word_ids":["w1","w2","w3"],"expected_text":"We ship Friday","replacement":"We ship Monday"}"#)).unwrap()
        ).await.unwrap();
        assert_eq!(corrected.status(), StatusCode::OK);

        let wrong_meeting = router(TOKEN, host)
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/meeting/tuesday/transcript/corrections")
                    .header("authorization", format!("Bearer {TOKEN}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(
                        r#"{"word_ids":["w1"],"expected_text":"We","replacement":"I"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(wrong_meeting.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn requests_without_the_token_are_refused() {
        let (url, _host) = serve().await;
        let endpoint = format!("{url}/meeting/thursday/project");

        let missing = client().get(&endpoint).send().await.unwrap();
        let wrong = client()
            .get(&endpoint)
            .bearer_auth("nope")
            .send()
            .await
            .unwrap();
        let note = client()
            .post(format!("{url}/meeting/thursday/notes"))
            .json(&serde_json::json!({ "lines": ["x"], "style": "paragraphs" }))
            .send()
            .await
            .unwrap();
        let right = client()
            .get(&endpoint)
            .bearer_auth(TOKEN)
            .send()
            .await
            .unwrap();

        assert_eq!(missing.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(wrong.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(note.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(right.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn the_coach_learns_what_the_app_is_recording_or_that_it_cannot_tell() {
        let (url, host) = serve().await;
        let ask = || {
            client()
                .get(format!("{url}/recording"))
                .bearer_auth(TOKEN)
                .send()
        };
        *host.recording.lock().unwrap() = Some(vec!["thursday".to_string()]);

        let recording = ask()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap();
        *host.recording.lock().unwrap() = None;
        let unknown = ask().await.unwrap();

        assert_eq!(
            recording,
            serde_json::json!({ "active_session_id": "thursday", "session_ids": ["thursday"], "paused_session_ids": [] })
        );
        assert_eq!(unknown.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn a_folder_chosen_for_one_meeting_applies_to_the_rest_of_its_series_only() {
        let (url, host) = serve().await;
        let acme = tempfile::tempdir().unwrap();
        host.picks
            .lock()
            .unwrap()
            .push(Some(acme.path().to_path_buf()));
        let default_project = host.default_project.path().to_string_lossy().into_owned();
        let project_of = |session: &'static str| {
            let url = url.clone();
            async move {
                client()
                    .get(format!("{url}/meeting/{session}/project"))
                    .bearer_auth(TOKEN)
                    .send()
                    .await
                    .unwrap()
                    .json::<serde_json::Value>()
                    .await
                    .unwrap()
            }
        };
        assert_eq!(
            project_of("tuesday").await["project"],
            default_project.as_str()
        );

        let chosen = client()
            .post(format!("{url}/meeting/thursday/series-project"))
            .bearer_auth(TOKEN)
            .send()
            .await
            .unwrap();

        assert_eq!(chosen.status(), StatusCode::OK);
        let acme_path = acme.path().to_string_lossy().into_owned();
        let tuesday = project_of("tuesday").await;
        assert_eq!(tuesday["project"], acme_path.as_str());
        assert_eq!(tuesday["source"], "series");
        assert_eq!(tuesday["series"]["label"], "Acme weekly");
        assert_eq!(
            project_of("adhoc").await["project"],
            default_project.as_str()
        );

        let cleared = client()
            .delete(format!("{url}/meeting/tuesday/series-project"))
            .bearer_auth(TOKEN)
            .send()
            .await
            .unwrap()
            .json::<serde_json::Value>()
            .await
            .unwrap();
        assert_eq!(cleared["project"], default_project.as_str());
        assert_eq!(project_of("thursday").await["source"], "default");
    }

    #[tokio::test]
    async fn an_ad_hoc_meeting_cannot_get_a_series_folder_and_a_cancelled_pick_changes_nothing() {
        let (url, host) = serve().await;
        host.picks.lock().unwrap().push(None);

        let adhoc = client()
            .post(format!("{url}/meeting/adhoc/series-project"))
            .bearer_auth(TOKEN)
            .send()
            .await
            .unwrap();
        let cancelled = client()
            .post(format!("{url}/meeting/thursday/series-project"))
            .bearer_auth(TOKEN)
            .send()
            .await
            .unwrap();

        assert_eq!(adhoc.status(), StatusCode::BAD_REQUEST);
        assert_eq!(cancelled.status(), StatusCode::NO_CONTENT);
        assert!(
            host.picks.lock().unwrap().is_empty(),
            "the picker was shown"
        );
        assert!(
            settings::load_series_projects(host.config.path())
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn library_edits_work_without_a_current_meeting_and_undo_stays_in_its_conversation() {
        let host = test_host().await;
        let app = router(TOKEN, host.clone());
        let post = |path: &str, body: serde_json::Value| {
            app.clone().oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri(path)
                    .header("authorization", format!("Bearer {TOKEN}"))
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap(),
            )
        };
        let live = post(
            "/meeting/thursday/notes",
            serde_json::json!({"lines":["Live note"],"style":"paragraphs"}),
        )
        .await
        .unwrap();
        assert_eq!(live.status(), StatusCode::OK);
        let created = post("/library/notes", serde_json::json!({"title":"Planning"}))
            .await
            .unwrap();
        assert_eq!(created.status(), StatusCode::OK);
        let created: serde_json::Value = serde_json::from_slice(
            &axum::body::to_bytes(created.into_body(), usize::MAX)
                .await
                .unwrap(),
        )
        .unwrap();
        assert!(created["edit"]["session_id"].is_null());
        let id = created["id"].as_str().unwrap();
        let title: String =
            sqlx::query_scalar("SELECT title FROM sessions WHERE id = ? AND deleted_at IS NULL")
                .bind(id)
                .fetch_one(&host.pool)
                .await
                .unwrap();
        assert_eq!(title, "Planning");
        let older = post(
            "/library/meeting/tuesday/notes",
            serde_json::json!({"lines":["Library note"],"style":"paragraphs"}),
        )
        .await
        .unwrap();
        assert_eq!(older.status(), StatusCode::OK);
        let body: String = sqlx::query_scalar("SELECT body FROM session_documents WHERE session_id = 'tuesday' AND deleted_at IS NULL").fetch_one(&host.pool).await.unwrap();
        assert!(body.contains("Library note"));
        let undone = post("/library/undo", serde_json::json!({})).await.unwrap();
        assert_eq!(undone.status(), StatusCode::OK);
        let body: Option<String> = sqlx::query_scalar("SELECT body FROM session_documents WHERE session_id = 'tuesday' AND deleted_at IS NULL").fetch_optional(&host.pool).await.unwrap();
        assert!(!body.unwrap_or_default().contains("Library note"));
        let removed = post("/library/undo", serde_json::json!({})).await.unwrap();
        assert_eq!(removed.status(), StatusCode::OK);
        let deleted: Option<String> =
            sqlx::query_scalar("SELECT deleted_at FROM sessions WHERE id = ?")
                .bind(id)
                .fetch_one(&host.pool)
                .await
                .unwrap();
        assert!(deleted.is_some());
        let live_body: String = sqlx::query_scalar("SELECT body FROM session_documents WHERE session_id = 'thursday' AND deleted_at IS NULL").fetch_one(&host.pool).await.unwrap();
        assert!(live_body.contains("Live note"));
        assert_eq!(
            post("/meeting/thursday/undo", serde_json::json!({}))
                .await
                .unwrap()
                .status(),
            StatusCode::OK
        );
        sqlx::query("UPDATE sessions SET locked = 1 WHERE id = 'tuesday'")
            .execute(&host.pool)
            .await
            .unwrap();
        assert_eq!(
            post(
                "/library/meeting/tuesday/notes",
                serde_json::json!({"lines":["Blocked"],"style":"paragraphs"})
            )
            .await
            .unwrap()
            .status(),
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn edits_are_refused_for_meetings_other_than_the_current_one() {
        let (url, _host) = serve().await;
        let note = |session: &'static str| {
            client()
                .post(format!("{url}/meeting/{session}/notes"))
                .bearer_auth(TOKEN)
                .json(&serde_json::json!({ "lines": ["Decision"], "style": "bullets" }))
                .send()
        };

        let other = note("tuesday").await.unwrap();
        let current = note("thursday").await.unwrap();

        assert_eq!(other.status(), StatusCode::FORBIDDEN);
        assert_eq!(current.status(), StatusCode::OK);
        let edit: serde_json::Value = current.json().await.unwrap();
        assert_eq!(edit["kind"], "note");
        assert_eq!(edit["session_id"], "thursday");
    }

    #[tokio::test]
    async fn library_changes_answer_with_the_edit_and_map_refusals_to_statuses() {
        let (url, host) = serve().await;
        sqlx::query("UPDATE sessions SET locked = 1 WHERE id = 'adhoc'")
            .execute(&host.pool)
            .await
            .unwrap();
        let post = |path: &str, body: serde_json::Value| {
            client()
                .post(format!("{url}/meeting/thursday/library/{path}"))
                .bearer_auth(TOKEN)
                .json(&body)
                .send()
        };

        let folder = post("folders", serde_json::json!({ "path": "Clients/Lumen" }))
            .await
            .unwrap();
        let note = post(
            "notes",
            serde_json::json!({ "title": "Pricing", "folder": "Clients/Lumen" }),
        )
        .await
        .unwrap();
        let locked = post("notes/adhoc", serde_json::json!({ "title": "Peek" }))
            .await
            .unwrap();
        let unknown = post("people/nobody", serde_json::json!({ "memo": "x" }))
            .await
            .unwrap();
        let undo = client()
            .post(format!("{url}/meeting/thursday/undo"))
            .bearer_auth(TOKEN)
            .json(&serde_json::json!({}))
            .send()
            .await
            .unwrap();

        assert_eq!(folder.status(), StatusCode::OK);
        let note: serde_json::Value = note.json().await.unwrap();
        assert_eq!(note["edit"]["kind"], "create_note");
        assert_eq!(note["edit"]["target_id"], note["id"]);
        assert_eq!(note["message"], "Created note “Pricing” in Clients/Lumen");
        assert_eq!(locked.status(), StatusCode::FORBIDDEN);
        assert_eq!(unknown.status(), StatusCode::NOT_FOUND);
        let undone: serde_json::Value = undo.json().await.unwrap();
        assert_eq!(undone["kind"], "create_note");
    }
    #[tokio::test]
    async fn browser_chat_proxy_revokes_requests_and_streams_when_meeting_changes() {
        use axum::body::Body;
        let host = test_host().await;
        *host.recording.lock().unwrap() = Some(vec!["thursday".into()]);
        let upstream = Router::new().route("/ask", post(|headers: HeaderMap| async move {
            assert_eq!(headers[header::AUTHORIZATION], "Bearer test-coach-credential");
            Json(serde_json::json!({"session": headers["x-cue-browser-session"].to_str().unwrap()}))
        })).route("/events", get(|| async {
            Response::new(Body::from_stream(async_stream::stream! {
                yield Ok::<_, std::io::Error>("data: connected\n\n");
                std::future::pending::<()>().await;
            }))
        }));
        let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        *host.coach_url.lock().unwrap() = format!("http://{}", listener.local_addr().unwrap());
        let upstream_task =
            tokio::spawn(async move { axum::serve(listener, upstream).await.unwrap() });
        let browser = Arc::new(Mutex::new(crate::browser::BrowserHub::default()));
        let attached = browser.lock().unwrap().handle(
            crate::browser::BrowserRequest {
                version: 1,
                request_id: "test".into(),
                operation: crate::browser::BrowserOperation::Attach {
                    session_id: "thursday".into(),
                    connection_id: "tab".into(),
                    meeting_url: "https://meet.google.com/abc-defg-hij".into(),
                },
            },
            Some("thursday"),
        );
        let crate::browser::BrowserResult::Ok {
            reply: crate::browser::BrowserReply::Attached { binding_id },
        } = attached.result
        else {
            panic!("attach failed")
        };
        let app = browser_router(
            TOKEN,
            host.clone(),
            Arc::new(Mutex::new(Some("browser-secret".into()))),
            browser,
        );
        let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let app_task = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = reqwest::Client::new();
        let reply: serde_json::Value = client
            .post(format!("{url}/browser-coach/ask"))
            .bearer_auth(&binding_id)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(reply["session"], "thursday");
        let mut events = client
            .get(format!("{url}/browser-coach/events"))
            .bearer_auth(&binding_id)
            .send()
            .await
            .unwrap();
        assert_eq!(
            events.chunk().await.unwrap().unwrap(),
            "data: connected\n\n"
        );
        *host.recording.lock().unwrap() = Some(vec!["tuesday".into()]);
        assert!(
            tokio::time::timeout(std::time::Duration::from_secs(3), events.chunk())
                .await
                .unwrap()
                .unwrap()
                .is_none()
        );
        let denied = client
            .post(format!("{url}/browser-coach/ask"))
            .bearer_auth(&binding_id)
            .send()
            .await
            .unwrap();
        assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);
        app_task.abort();
        upstream_task.abort();
    }

    #[tokio::test]
    async fn browser_context_and_private_cues_stay_bound_to_one_meeting_with_separate_credentials()
    {
        use axum::body::{Body, to_bytes};
        use tower::ServiceExt;
        let host = test_host().await;
        *host.recording.lock().unwrap() = Some(vec!["thursday".into()]);
        let credentials = Arc::new(Mutex::new(Some("browser-secret".into())));
        let app = browser_router(
            TOKEN,
            host.clone(),
            credentials.clone(),
            Arc::new(Mutex::new(Default::default())),
        );
        async fn call(
            app: &Router,
            path: &str,
            token: &str,
            body: Option<serde_json::Value>,
        ) -> (StatusCode, serde_json::Value) {
            let request = axum::http::Request::builder()
                .method(if body.is_some() { "POST" } else { "GET" })
                .uri(path)
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::HOST, "127.0.0.1:4567")
                .body(Body::from(body.map(|v| v.to_string()).unwrap_or_default()))
                .unwrap();
            let response = app.clone().oneshot(request).await.unwrap();
            let status = response.status();
            let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
            (
                status,
                serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null),
            )
        }
        let request = |operation| {
            Some(
                serde_json::json!({ "version": 1, "request_id": "request-1", "operation": operation }),
            )
        };
        let attach = request(
            serde_json::json!({"kind":"attach", "session_id":"thursday", "connection_id":"tab-1", "meeting_url":"https://meet.google.com/abc-defg-hij?authuser=0"}),
        );
        let (status, attached) = call(&app, "/browser", "browser-secret", attach.clone()).await;
        assert_eq!(status, StatusCode::OK);
        let binding = attached["result"]["reply"]["binding_id"].as_str().unwrap();
        sqlx::query("UPDATE sessions SET title = '' WHERE id = 'thursday'")
            .execute(&host.pool)
            .await
            .unwrap();
        let (_, snapshot) = call(&app, "/browser", "browser-secret", request(serde_json::json!({"kind":"snapshot", "binding_id":binding, "sequence":1, "context":{
            "title":"Weekly", "captions":"available", "chat":"available", "participants":[], "presentation":null,
            "events":[{"id":"caption-1", "kind":"caption", "timestamp_ms":1000, "participant_id":null, "text":"Please check the slide"}]
        }}))).await;
        assert_eq!(snapshot["result"]["reply"]["kind"], "accepted");
        let adopted: String =
            sqlx::query_scalar("SELECT title FROM sessions WHERE id = 'thursday'")
                .fetch_one(&host.pool)
                .await
                .unwrap();
        assert_eq!(adopted, "Weekly");
        sqlx::query("UPDATE sessions SET title = 'My custom name' WHERE id = 'thursday'")
            .execute(&host.pool)
            .await
            .unwrap();
        let (_, snapshot) = call(&app, "/browser", "browser-secret", request(serde_json::json!({"kind":"snapshot", "binding_id":binding, "sequence":2, "context":{
            "title":"Another browser title", "captions":"available", "chat":"available", "participants":[], "presentation":null,
            "events":[{"id":"caption-1", "kind":"caption", "timestamp_ms":1000, "participant_id":null, "text":"Please check the slide"}]
        }}))).await;
        assert_eq!(snapshot["result"]["reply"]["kind"], "accepted");
        let preserved: String =
            sqlx::query_scalar("SELECT title FROM sessions WHERE id = 'thursday'")
                .fetch_one(&host.pool)
                .await
                .unwrap();
        assert_eq!(preserved, "My custom name");
        let (status, health) = call(&app, "/meeting/thursday/browser-status", TOKEN, None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(health["extension"], "online");
        assert_eq!(health["meeting_connected"], true);
        assert_eq!(health["context_available"], true);
        assert!(health.get("context").is_none());
        let (_, context) = call(&app, "/meeting/thursday/browser-context", TOKEN, None).await;
        assert_eq!(
            context["context"]["events"][0]["text"],
            "Please check the slide"
        );
        assert_eq!(
            context["meeting_url"],
            "https://meet.google.com/abc-defg-hij"
        );
        assert_eq!(
            call(
                &app,
                "/meeting/thursday/browser-context",
                "browser-secret",
                None
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call(&app, "/browser", TOKEN, attach.clone()).await.0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call(
                &app,
                "/meeting/thursday/recording/stop",
                "browser-secret",
                Some(serde_json::json!({}))
            )
            .await
            .0,
            StatusCode::UNAUTHORIZED
        );
        let (_, other) = call(&app, "/meeting/tuesday/browser-context", TOKEN, None).await;
        assert!(other.is_null());
        call(
            &app,
            "/meeting/thursday/nudge",
            TOKEN,
            Some(serde_json::json!({"tag":"question", "line":"Ask who owns the follow-up."})),
        )
        .await;
        let coach = request(serde_json::json!({"kind":"coach", "binding_id":binding}));
        let (_, connected_coach) = call(&app, "/browser", "browser-secret", coach.clone()).await;
        assert_eq!(
            connected_coach["result"]["reply"]["url"],
            "http://127.0.0.1:4567/browser-coach"
        );
        assert_eq!(connected_coach["result"]["reply"]["token"], binding);
        let poll = request(serde_json::json!({"kind":"poll", "binding_id":binding, "after":0}));
        let (_, cues) = call(&app, "/browser", "browser-secret", poll.clone()).await;
        assert_eq!(
            cues["result"]["reply"]["cues"][0]["line"],
            "Ask who owns the follow-up."
        );
        *host.recording.lock().unwrap() = Some(vec!["tuesday".into()]);
        let (_, expired) = call(&app, "/browser", "browser-secret", poll).await;
        assert_eq!(expired["result"]["error"], "binding_expired");
        let (_, denied_coach) = call(&app, "/browser", "browser-secret", coach).await;
        assert_eq!(denied_coach["result"]["error"], "binding_expired");
        assert!(
            call(&app, "/meeting/thursday/browser-context", TOKEN, None)
                .await
                .1
                .is_null()
        );
        let (_, health) = call(&app, "/meeting/thursday/browser-status", TOKEN, None).await;
        assert_eq!(health["extension"], "online");
        assert_eq!(health["meeting_connected"], false);
        assert_eq!(health["context_available"], false);
        *credentials.lock().unwrap() = None;
        assert_eq!(
            call(&app, "/browser", "browser-secret", attach).await.0,
            StatusCode::UNAUTHORIZED
        );
    }
}

async fn browser_request(
    State(state): State<Arc<BridgeState>>,
    headers: HeaderMap,
    Json(request): Json<crate::browser::BrowserRequest>,
) -> Response {
    if let crate::browser::BrowserOperation::CancelRecording {
        session_id,
        meeting_url,
    } = &request.operation
    {
        let mut identity = state.browser_recording.lock().await;
        let owned = identity.as_ref().is_some_and(|(id, url)| {
            id == session_id
                && crate::browser::normalize_meeting_url(meeting_url).as_ref() == Some(url)
        });
        let stopped = owned && state.host.stop_recording(session_id.clone()).await;
        if stopped {
            *identity = None;
        }
        tracing::info!(run_id = %request.request_id, stopped, "browser_pending_recording_cancelled");
        return Json(crate::browser::BrowserResponse {
            version: crate::browser::VERSION,
            request_id: request.request_id,
            result: if stopped {
                crate::browser::BrowserResult::Ok {
                    reply: crate::browser::BrowserReply::Accepted,
                }
            } else {
                crate::browser::BrowserResult::Error {
                    error: crate::browser::BrowserFailure::MeetingChanged,
                }
            },
        })
        .into_response();
    }
    if let crate::browser::BrowserOperation::Record {
        meeting_url,
        title,
        expected_session_id,
        use_current,
    } = &request.operation
    {
        let started = std::time::Instant::now();
        let result = if request.version != crate::browser::VERSION
            || uuid::Uuid::parse_str(&request.request_id).is_err()
        {
            Err(crate::browser::BrowserFailure::InvalidRequest)
        } else {
            record_browser_meeting(
                &state,
                meeting_url,
                title,
                expected_session_id.as_deref(),
                *use_current,
            )
            .await
        };
        tracing::info!(run_id = %request.request_id, success = result.is_ok(), duration_ms = started.elapsed().as_millis() as u64, error = ?result.as_ref().err(), "browser_recording_completed");
        return Json(crate::browser::BrowserResponse {
            version: crate::browser::VERSION,
            request_id: request.request_id,
            result: match result {
                Ok(session_id) => crate::browser::BrowserResult::Ok {
                    reply: crate::browser::BrowserReply::Recording { session_id },
                },
                Err(error) => crate::browser::BrowserResult::Error { error },
            },
        })
        .into_response();
    }
    let attach_identity = match &request.operation {
        crate::browser::BrowserOperation::Attach {
            session_id,
            meeting_url,
            ..
        } => Some((session_id.clone(), meeting_url.clone())),
        _ => None,
    };
    let snapshot_title = match &request.operation {
        crate::browser::BrowserOperation::Snapshot { context, .. } => Some(context.title.clone()),
        _ => None,
    };
    let coach_binding = match &request.operation {
        crate::browser::BrowserOperation::Coach { binding_id } => Some(binding_id.clone()),
        _ => None,
    };
    let capture = state.host.recording_sessions().await;
    let raw_active = capture.as_ref().and_then(|r| r.active_session_id.clone());
    let paused = raw_active.as_ref().is_some_and(|id| {
        capture
            .as_ref()
            .is_some_and(|r| r.paused_session_ids.contains(id))
    });
    let active = if matches!(&request.operation, crate::browser::BrowserOperation::Status) {
        raw_active
    } else {
        active_browser_session(&state).await
    };
    let known_url = state
        .browser_recording
        .lock()
        .await
        .as_ref()
        .filter(|(id, _)| Some(id) == active.as_ref())
        .map(|(_, url)| url.clone());
    let title = if matches!(&request.operation, crate::browser::BrowserOperation::Status) {
        if let (Some(id), Ok(pool)) = (active.as_ref(), state.host.pool()) {
            sqlx::query_scalar::<_, String>(
                "SELECT title FROM sessions WHERE id = ? AND locked = 0 AND deleted_at IS NULL",
            )
            .bind(id)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten()
        } else {
            None
        }
    } else {
        None
    };
    let response = match state.browser.lock() {
        Ok(mut browser) => {
            let mut response = browser.handle(request, active.as_deref());
            if let crate::browser::BrowserResult::Ok {
                reply:
                    crate::browser::BrowserReply::Status {
                        active_session_title,
                        active_meeting_url,
                        paused: reply_paused,
                        ..
                    },
            } = &mut response.result
            {
                *active_session_title = title;
                *active_meeting_url = known_url;
                *reply_paused = paused;
            }
            response
        }
        Err(_) => {
            return failure(
                StatusCode::SERVICE_UNAVAILABLE,
                "browser context unavailable",
            );
        }
    };
    if matches!(&response.result, crate::browser::BrowserResult::Ok { .. }) {
        if let Some((id, url)) = attach_identity {
            *state.browser_recording.lock().await = Some((id, url));
        }
        if let (Some(title), Some(session_id), Ok(pool)) =
            (snapshot_title, active.as_deref(), state.host.pool())
        {
            let started = std::time::Instant::now();
            match adopt_browser_title(&pool, session_id, &title).await {
                Ok(true) => {
                    tracing::info!(run_id = %uuid::Uuid::new_v4(), duration_ms = started.elapsed().as_millis() as u64, "browser_meeting_title_adopted")
                }
                Ok(false) => {}
                Err(_) => {
                    tracing::warn!(run_id = %uuid::Uuid::new_v4(), duration_ms = started.elapsed().as_millis() as u64, "browser_meeting_title_failed")
                }
            }
        }
    }
    let mut response = response;
    if let Some(binding_id) = coach_binding
        .filter(|_| matches!(&response.result, crate::browser::BrowserResult::Ok { .. }))
    {
        response.result = match headers
            .get(header::HOST)
            .and_then(|h| h.to_str().ok())
            .and_then(|host| host.strip_prefix("127.0.0.1:"))
            .and_then(|port| port.parse::<u16>().ok())
        {
            Some(port) => crate::browser::BrowserResult::Ok {
                reply: crate::browser::BrowserReply::Coach {
                    url: format!("http://127.0.0.1:{port}/browser-coach"),
                    token: binding_id,
                },
            },
            None => crate::browser::BrowserResult::Error {
                error: crate::browser::BrowserFailure::AppUnavailable,
            },
        };
    }

    Json(response).into_response()
}

async fn browser_status(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
) -> Response {
    let active = active_browser_session(&state).await;
    match state.browser.lock() {
        Ok(mut browser) => Json(browser.status(&session_id, active.as_deref())).into_response(),
        Err(_) => failure(
            StatusCode::SERVICE_UNAVAILABLE,
            "browser status unavailable",
        ),
    }
}

async fn browser_context(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
) -> Response {
    let active = active_browser_session(&state).await;
    match state.browser.lock() {
        Ok(mut browser) => Json(browser.context(&session_id, active.as_deref())).into_response(),
        Err(_) => failure(
            StatusCode::SERVICE_UNAVAILABLE,
            "browser context unavailable",
        ),
    }
}

async fn active_browser_session(state: &BridgeState) -> Option<String> {
    let recording = state.host.recording_sessions().await?;
    let id = recording.active_session_id?;
    if recording.paused_session_ids.contains(&id) {
        return None;
    }
    let pool = state.host.pool().ok()?;
    match state
        .edits
        .ensure_target(&pool, &id, EditOwner::Library)
        .await
    {
        Ok(()) => Some(id),
        Err(error) => {
            tracing::warn!(%error, "browser_meeting_access_unavailable");
            None
        }
    }
}

async fn browser_coach(
    State(state): State<Arc<BridgeState>>,
    Path(path): Path<String>,
    request: Request,
) -> Response {
    let started = std::time::Instant::now();
    let run_id = uuid::Uuid::new_v4();
    tracing::info!(%run_id, streaming = path == "events", "browser_coach_request_started");
    let failed = |status, message: &str| {
        tracing::warn!(%run_id, %status, duration_ms = started.elapsed().as_millis() as u64, "browser_coach_request_failed");
        failure(status, message)
    };
    let binding = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or_default()
        .to_owned();
    let active = active_browser_session(&state).await;
    let session = state
        .browser
        .lock()
        .ok()
        .and_then(|mut browser| browser.authorize_coach(&binding, active.as_deref()).ok());
    let Some(session) = session else {
        return failed(StatusCode::UNAUTHORIZED, "Meeting disconnected");
    };
    let endpoint = match state.host.meeting_coach().await {
        Ok(endpoint) => endpoint,
        Err(error) => {
            tracing::warn!(%error, "browser_coach_connection_failed");
            return failed(StatusCode::SERVICE_UNAVAILABLE, "Coach unavailable");
        }
    };
    if path.contains("..") || path.starts_with('/') || path.contains('\\') {
        return failed(StatusCode::BAD_REQUEST, "Invalid coach path");
    }
    let query = request
        .uri()
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let method = request.method().clone();
    let content_type = request.headers().get(header::CONTENT_TYPE).cloned();
    let body = match axum::body::to_bytes(request.into_body(), 16 * 1024 * 1024).await {
        Ok(body) => body,
        Err(_) => return failed(StatusCode::PAYLOAD_TOO_LARGE, "Request too large"),
    };
    let active = active_browser_session(&state).await;
    if !state
        .browser
        .lock()
        .ok()
        .is_some_and(|mut browser| browser.authorize_coach(&binding, active.as_deref()).is_ok())
    {
        return failed(StatusCode::UNAUTHORIZED, "Meeting disconnected");
    }
    let client = match reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
    {
        Ok(client) => client,
        Err(_) => return failed(StatusCode::SERVICE_UNAVAILABLE, "Coach unavailable"),
    };
    let mut upstream = client
        .request(method, format!("{}/{path}{query}", endpoint.url))
        .bearer_auth(endpoint.token)
        .header("x-cue-browser-session", &session)
        .body(body);
    if let Some(value) = content_type {
        upstream = upstream.header(header::CONTENT_TYPE, value);
    }
    let mut response = match upstream.send().await {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(
                timeout = error.is_timeout(),
                connection = error.is_connect(),
                "browser_coach_request_failed"
            );
            return failed(StatusCode::BAD_GATEWAY, "Coach unavailable");
        }
    };
    let status = response.status();
    let content_type = response.headers().get(header::CONTENT_TYPE).cloned();
    let stream = async_stream::stream! {
        loop {
            let chunk = tokio::select! {
                chunk = response.chunk() => chunk,
                _ = tokio::time::sleep(std::time::Duration::from_millis(500)) => {
                    let active = active_browser_session(&state).await;
                    if !state.browser.lock().ok().is_some_and(|mut browser| browser.authorize_coach(&binding, active.as_deref()).is_ok()) { break; }
                    continue;
                }
            };
            let active = active_browser_session(&state).await;
            if !state.browser.lock().ok().is_some_and(|mut browser| browser.authorize_coach(&binding, active.as_deref()).is_ok()) { break; }
            match chunk {
                Ok(Some(chunk)) => yield Ok::<_, std::io::Error>(chunk),
                Ok(None) => break,
                Err(error) => { yield Err(std::io::Error::other(error)); break; }
            }
        }
        tracing::info!(%run_id, duration_ms = started.elapsed().as_millis() as u64, "browser_coach_request_completed");
    };
    let body = axum::body::Body::from_stream(stream);
    let mut result = Response::new(body);
    *result.status_mut() = status;
    if let Some(value) = content_type {
        result.headers_mut().insert(header::CONTENT_TYPE, value);
    }
    result
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    result
}

async fn adopt_browser_title(
    pool: &SqlitePool,
    session_id: &str,
    title: &str,
) -> std::result::Result<bool, sqlx::Error> {
    let title = title
        .trim()
        .strip_prefix("Meet - ")
        .unwrap_or(title.trim())
        .trim();
    if title.is_empty() || matches!(title, "Meet" | "Google Meet" | "Untitled") {
        return Ok(false);
    }
    let mut tx = pool.begin().await?;
    let current: Option<String> = sqlx::query_scalar("SELECT title FROM sessions WHERE id = ? AND deleted_at IS NULL AND locked = 0 AND (TRIM(title) = '' OR title = 'Untitled')")
        .bind(session_id).fetch_optional(&mut *tx).await?;
    let Some(current) = current else {
        return Ok(false);
    };
    let now: String = sqlx::query_scalar("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
        .fetch_one(&mut *tx)
        .await?;
    let changed =
        anlg_db_app::update_session_title(&mut tx, session_id, &current, title, &now).await? > 0;
    tx.commit().await?;
    Ok(changed)
}

async fn record_browser_meeting(
    state: &BridgeState,
    meeting_url: &str,
    title: &str,
    expected: Option<&str>,
    use_current: bool,
) -> std::result::Result<String, crate::browser::BrowserFailure> {
    use crate::browser::BrowserFailure as Failure;
    let url = crate::browser::normalize_meeting_url(meeting_url).ok_or(Failure::InvalidRequest)?;
    if title.trim().is_empty() || title.len() > 512 {
        return Err(Failure::InvalidRequest);
    }
    let mut identity = state.browser_recording.lock().await;
    let capture = state
        .host
        .recording_sessions()
        .await
        .ok_or(Failure::AppUnavailable)?;
    let active = capture.active_session_id;
    if active.as_deref() != expected {
        return Err(Failure::MeetingChanged);
    }
    if use_current {
        let id = active.ok_or(Failure::NoActiveMeeting)?;
        if identity
            .as_ref()
            .is_some_and(|(known, known_url)| known == &id && known_url != &url)
        {
            return Err(Failure::MeetingChanged);
        }
        if capture.paused_session_ids.contains(&id)
            && !state.host.pause_recording(id.clone(), false).await
        {
            return Err(Failure::MeetingChanged);
        }
        *state.browser.lock().map_err(|_| Failure::AppUnavailable)? = Default::default();
        *identity = Some((id.clone(), url));
        return Ok(id);
    }
    if let Some(id) = active {
        if !state.host.stop_recording(id).await {
            return Err(Failure::MeetingChanged);
        }
    }
    if state
        .host
        .recording_sessions()
        .await
        .ok_or(Failure::AppUnavailable)?
        .active_session_id
        .is_some()
    {
        return Err(Failure::MeetingChanged);
    }
    let pool = state.host.pool().map_err(|_| Failure::AppUnavailable)?;
    let note = state
        .edits
        .create_note(
            &pool,
            EditOwner::Library,
            NewNote {
                title: title
                    .trim()
                    .strip_prefix("Meet - ")
                    .unwrap_or(title.trim())
                    .to_owned(),
                folder: None,
                content_markdown: None,
            },
        )
        .await
        .map_err(|_| Failure::AppUnavailable)?;
    let id = note.id.ok_or(Failure::AppUnavailable)?;
    if !state.host.start_recording(id.clone()).await {
        return Err(Failure::AppUnavailable);
    }
    *state.browser.lock().map_err(|_| Failure::AppUnavailable)? = Default::default();
    *identity = Some((id.clone(), url));
    Ok(id)
}
