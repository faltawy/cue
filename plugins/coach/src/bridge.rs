use std::future::Future;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::pin::Pin;
use std::process::Command;
use std::sync::Arc;

use axum::extract::{Path, Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use sqlx::SqlitePool;

use crate::edits::{EditError, Edits, NoteStyle};
use crate::library::{
    LibraryChange, NewNote, NoteChanges, OrganizationFields, PersonFields, TemplateFields,
};
use crate::series::{self, MeetingProject};
use crate::settings::{self, SeriesProject};
use crate::{Error, Result};

pub const URL_ENV: &str = "ANARLOG_COACH_APP_URL";
pub const TOKEN_ENV: &str = "ANARLOG_COACH_APP_TOKEN";

pub type RecordingFuture = Pin<Box<dyn Future<Output = Option<Vec<String>>> + Send>>;

pub trait Host: Send + Sync + 'static {
    fn pool(&self) -> Result<SqlitePool>;
    fn recording_sessions(&self) -> RecordingFuture;
    fn config_dir(&self) -> Result<PathBuf>;
    fn default_project(&self) -> Result<PathBuf>;
    fn pick_folder(&self, title: &str) -> Result<Option<PathBuf>>;
}

struct BridgeState {
    host: Box<dyn Host>,
    token: String,
    edits: Edits,
}

#[derive(Debug, Clone)]
pub struct Bridge {
    pub url: String,
    token: String,
}

impl Bridge {
    pub fn apply(&self, command: &mut Command) {
        command.env(URL_ENV, &self.url).env(TOKEN_ENV, &self.token);
    }
}

pub fn start(host: impl Host) -> Result<Bridge> {
    let listener = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
    listener.set_nonblocking(true)?;
    let bridge = Bridge {
        url: format!("http://{}", listener.local_addr()?),
        token: format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        ),
    };
    let app = router(&bridge.token, host);
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

fn router(token: &str, host: impl Host) -> Router {
    let state = Arc::new(BridgeState {
        host: Box::new(host),
        token: token.to_string(),
        edits: Edits::default(),
    });
    Router::new()
        .route("/recording", get(recording))
        .route("/meeting/{session_id}/project", get(meeting_project))
        .route(
            "/meeting/{session_id}/series-project",
            post(choose_series_project).delete(clear_series_project),
        )
        .route("/meeting/{session_id}/notes", post(append_note))
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
    if !same_secret(presented.as_bytes(), state.token.as_bytes()) {
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
struct Recording {
    session_ids: Vec<String>,
}

async fn recording(State(state): State<Arc<BridgeState>>) -> Response {
    match state.host.recording_sessions().await {
        Some(session_ids) => Json(Recording { session_ids }).into_response(),
        None => failure(
            StatusCode::SERVICE_UNAVAILABLE,
            "the app could not tell what it is recording",
        ),
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
struct NoteBody {
    lines: Vec<String>,
    style: NoteStyle,
}

async fn append_note(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<NoteBody>,
) -> Reply<crate::edits::CoachEdit> {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .append_note(&pool, &session_id, &body.lines, body.style)
            .await?,
    ))
}

#[derive(serde::Deserialize)]
struct ActionItemBody {
    text: String,
}

async fn add_action_item(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<ActionItemBody>,
) -> Reply<crate::edits::CoachEdit> {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .add_action_item(&pool, &session_id, &body.text)
            .await?,
    ))
}

async fn complete_action_item(
    State(state): State<Arc<BridgeState>>,
    Path((session_id, task_id)): Path<(String, String)>,
) -> Reply<crate::edits::CoachEdit> {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .complete_action_item(&pool, &session_id, &task_id)
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
    Ok(Json(
        state
            .edits
            .undo_last(&pool, &session_id, edit_id.as_deref())
            .await?,
    ))
}

type Changed = Reply<LibraryChange>;

async fn create_note(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<NewNote>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state.edits.create_note(&pool, &session_id, body).await?,
    ))
}

async fn update_note(
    State(state): State<Arc<BridgeState>>,
    Path((session_id, note_id)): Path<(String, String)>,
    Json(body): Json<NoteChanges>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .update_note(&pool, &session_id, &note_id, body)
            .await?,
    ))
}

#[derive(serde::Deserialize)]
struct FolderBody {
    path: String,
}

async fn create_folder(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<FolderBody>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .create_folder(&pool, &session_id, &body.path)
            .await?,
    ))
}

async fn create_person(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<PersonFields>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state.edits.create_person(&pool, &session_id, body).await?,
    ))
}

async fn update_person(
    State(state): State<Arc<BridgeState>>,
    Path((session_id, person_id)): Path<(String, String)>,
    Json(body): Json<PersonFields>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .update_person(&pool, &session_id, &person_id, body)
            .await?,
    ))
}

async fn create_organization(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<OrganizationFields>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .create_organization(&pool, &session_id, body)
            .await?,
    ))
}

async fn update_organization(
    State(state): State<Arc<BridgeState>>,
    Path((session_id, organization_id)): Path<(String, String)>,
    Json(body): Json<OrganizationFields>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .update_organization(&pool, &session_id, &organization_id, body)
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
    Path(session_id): Path<String>,
    Json(body): Json<ParticipantBody>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .add_participant(&pool, &session_id, body.note_id.as_deref(), &body.person_id)
            .await?,
    ))
}

async fn create_template(
    State(state): State<Arc<BridgeState>>,
    Path(session_id): Path<String>,
    Json(body): Json<TemplateFields>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .create_template(&pool, &session_id, body)
            .await?,
    ))
}

async fn update_template(
    State(state): State<Arc<BridgeState>>,
    Path((session_id, template_id)): Path<(String, String)>,
    Json(body): Json<TemplateFields>,
) -> Changed {
    let pool = state.host.pool()?;
    Ok(Json(
        state
            .edits
            .update_template(&pool, &session_id, &template_id, body)
            .await?,
    ))
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    struct TestHost {
        pool: SqlitePool,
        config: tempfile::TempDir,
        default_project: tempfile::TempDir,
        picks: Mutex<Vec<Option<PathBuf>>>,
        recording: Mutex<Option<Vec<String>>>,
    }

    impl Host for Arc<TestHost> {
        fn pool(&self) -> Result<SqlitePool> {
            Ok(self.pool.clone())
        }
        fn recording_sessions(&self) -> RecordingFuture {
            let recording = self.recording.lock().unwrap().clone();
            Box::pin(async move { recording })
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
    }

    const TOKEN: &str = "test-token";

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
            config: tempfile::tempdir().unwrap(),
            default_project: tempfile::tempdir().unwrap(),
            picks: Mutex::new(Vec::new()),
            recording: Mutex::new(Some(Vec::new())),
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
            serde_json::json!({ "session_ids": ["thursday"] })
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
}
