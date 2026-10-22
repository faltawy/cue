use serde_json::{Value, json};
use sqlx::sqlite::SqliteRow;
use sqlx::{Row, SqliteConnection, SqlitePool};
use tokio::sync::Mutex;

pub const RAW_NOTE_SOURCE: &str = "session_raw_note";
const NOW_SQL: &str = "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

#[derive(Debug, thiserror::Error)]
pub enum EditError {
    #[error("the coach can only change the meeting it is attached to")]
    NotCurrentMeeting,
    #[error("this meeting no longer exists")]
    NoMeeting,
    #[error("there is no action item {0} in this meeting's notes")]
    UnknownTask(String),
    #[error("this meeting's notes are in an older format the coach cannot edit")]
    UnsupportedNote,
    #[error("nothing to undo")]
    NothingToUndo,
    #[error("only the latest coach edit can be undone")]
    NotLatest,
    #[error("the notes changed after the coach's edit; undo it by hand")]
    ChangedSince,
    #[error("{0}")]
    Kept(String),
    #[error("there is no {0} with id {1}")]
    Unknown(&'static str, String),
    #[error("this note is locked in the app; the coach can't read or change it")]
    Locked,
    #[error("{0}")]
    Invalid(String),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

pub(crate) type EditResult<T> = std::result::Result<T, EditError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EditKind {
    Note,
    AddActionItem,
    CompleteActionItem,
    CreateNote,
    UpdateNote,
    CreateFolder,
    CreatePerson,
    UpdatePerson,
    CreateOrganization,
    UpdateOrganization,
    AddParticipant,
    CreateTemplate,
    UpdateTemplate,
    AssignSpeaker,
    CorrectTranscript,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct CoachEdit {
    pub id: String,
    pub session_id: String,
    pub kind: EditKind,
    pub summary: String,
    pub task_id: Option<String>,
    pub target_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NoteStyle {
    Paragraphs,
    Bullets,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NoteRow {
    body: String,
    body_format: String,
    generation_metadata_json: String,
    updated_at: String,
    updated_by: String,
    deleted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ItemRow {
    status: String,
    metadata_json: String,
    updated_at: String,
    updated_by: String,
    deleted_at: Option<String>,
}

pub(crate) struct NoteUndo {
    note_before: Option<NoteRow>,
    note_after: Value,
    item_id: Option<String>,
    item_before: Option<ItemRow>,
    item_status_after: Option<String>,
}

pub(crate) enum Change {
    Note(NoteUndo),
    Transcript(TranscriptUndo),
    Library(crate::library::Undo),
}

#[derive(Clone, Copy)]
enum TranscriptField {
    Words,
    SpeakerHints,
}

pub(crate) struct TranscriptUndo {
    transcript_id: String,
    field: TranscriptField,
    before: String,
    after: String,
}

pub(crate) struct UndoEntry {
    pub(crate) edit: CoachEdit,
    pub(crate) change: Change,
}

pub(crate) type RecordingSource =
    std::sync::Arc<dyn Fn() -> crate::bridge::RecordingFuture + Send + Sync>;

#[derive(Default)]
pub struct Edits {
    pub(crate) log: Mutex<Vec<UndoEntry>>,
    recording: Option<RecordingSource>,
}

impl Edits {
    pub(crate) fn following(recording: RecordingSource) -> Self {
        Self {
            log: Mutex::default(),
            recording: Some(recording),
        }
    }

    pub(crate) async fn ensure_current(
        &self,
        pool: &SqlitePool,
        session_id: &str,
    ) -> EditResult<()> {
        let recording = match &self.recording {
            Some(source) => source().await,
            None => None,
        };
        if current_meeting(pool, recording).await?.as_deref() != Some(session_id) {
            return Err(EditError::NotCurrentMeeting);
        }
        let exists: Option<String> =
            sqlx::query_scalar("SELECT id FROM sessions WHERE id = ? AND deleted_at IS NULL")
                .bind(session_id)
                .fetch_optional(pool)
                .await?;
        exists.map(|_| ()).ok_or(EditError::NoMeeting)
    }
}

async fn current_meeting(
    pool: &SqlitePool,
    recording: Option<Vec<String>>,
) -> EditResult<Option<String>> {
    let recording = recording
        .map(|ids| serde_json::to_string(&ids))
        .transpose()?;
    Ok(sqlx::query_scalar(
        "SELECT session_id FROM transcripts WHERE deleted_at IS NULL
         ORDER BY (ended_at_ms IS NULL
                   AND session_id IN (SELECT value FROM json_each(?))) DESC,
                  started_at_ms DESC
         LIMIT 1",
    )
    .bind(recording)
    .fetch_optional(pool)
    .await?)
}

fn note_row(row: SqliteRow) -> EditResult<NoteRow> {
    Ok(NoteRow {
        body: row.try_get("body")?,
        body_format: row.try_get("body_format")?,
        generation_metadata_json: row.try_get("generation_metadata_json")?,
        updated_at: row.try_get("updated_at")?,
        updated_by: row.try_get("updated_by")?,
        deleted_at: row.try_get("deleted_at")?,
    })
}

async fn read_note(conn: &mut SqliteConnection, session_id: &str) -> EditResult<Option<NoteRow>> {
    sqlx::query(
        "SELECT body, body_format, generation_metadata_json, updated_at, updated_by, deleted_at
         FROM session_documents WHERE id = ? AND kind = 'note'",
    )
    .bind(session_id)
    .fetch_optional(conn)
    .await?
    .map(note_row)
    .transpose()
}

fn item_row(row: SqliteRow) -> EditResult<ItemRow> {
    Ok(ItemRow {
        status: row.try_get("status")?,
        metadata_json: row.try_get("metadata_json")?,
        updated_at: row.try_get("updated_at")?,
        updated_by: row.try_get("updated_by")?,
        deleted_at: row.try_get("deleted_at")?,
    })
}

async fn read_item(
    conn: &mut SqliteConnection,
    session_id: &str,
    task_id: &str,
) -> EditResult<Option<ItemRow>> {
    sqlx::query(
        "SELECT status, metadata_json, updated_at, updated_by, deleted_at FROM action_items
         WHERE id = ? AND source_type = ? AND source_id = ?",
    )
    .bind(task_id)
    .bind(RAW_NOTE_SOURCE)
    .bind(session_id)
    .fetch_optional(conn)
    .await?
    .map(item_row)
    .transpose()
}

fn empty_doc() -> Value {
    json!({ "type": "doc", "content": [] })
}

fn parse_doc(note: Option<&NoteRow>) -> EditResult<Value> {
    let Some(note) = note.filter(|note| note.deleted_at.is_none() && !note.body.trim().is_empty())
    else {
        return Ok(empty_doc());
    };
    if note.body_format != "prosemirror_json" {
        return Err(EditError::UnsupportedNote);
    }
    let doc: Value = serde_json::from_str(&note.body)?;
    if doc.get("type").and_then(Value::as_str) != Some("doc") {
        return Err(EditError::UnsupportedNote);
    }
    Ok(doc)
}

fn blocks(doc: &mut Value) -> EditResult<&mut Vec<Value>> {
    let object = doc.as_object_mut().ok_or(EditError::UnsupportedNote)?;
    object
        .entry("content")
        .or_insert_with(|| json!([]))
        .as_array_mut()
        .ok_or(EditError::UnsupportedNote)
}

fn paragraph(text: &str) -> Value {
    json!({ "type": "paragraph", "content": [{ "type": "text", "text": text }] })
}

fn clean_lines(lines: &[String]) -> Vec<&str> {
    lines
        .iter()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect()
}

pub fn append_lines(doc: &mut Value, lines: &[String], style: NoteStyle) -> EditResult<()> {
    let lines = clean_lines(lines);
    if lines.is_empty() {
        return Err(EditError::Invalid("there is nothing to add".into()));
    }
    let content = blocks(doc)?;
    match style {
        NoteStyle::Paragraphs => content.extend(lines.into_iter().map(paragraph)),
        NoteStyle::Bullets => content.push(json!({
            "type": "bulletList",
            "content": lines
                .into_iter()
                .map(|line| json!({ "type": "listItem", "content": [paragraph(line)] }))
                .collect::<Vec<_>>(),
        })),
    }
    Ok(())
}

pub fn append_task(doc: &mut Value, task_id: &str, text: &str) -> EditResult<Value> {
    let item = json!({
        "type": "taskItem",
        "attrs": {
            "status": "todo",
            "checked": false,
            "taskId": task_id,
            "taskItemId": uuid::Uuid::new_v4().to_string(),
        },
        "content": [paragraph(text)],
    });
    let content = blocks(doc)?;
    match content.last_mut() {
        Some(last) if last.get("type").and_then(Value::as_str) == Some("taskList") => {
            let items = last
                .as_object_mut()
                .ok_or(EditError::UnsupportedNote)?
                .entry("content")
                .or_insert_with(|| json!([]));
            items
                .as_array_mut()
                .ok_or(EditError::UnsupportedNote)?
                .push(item.clone());
        }
        _ => content.push(json!({ "type": "taskList", "content": [item.clone()] })),
    }
    Ok(item)
}

fn walk_tasks<'a>(node: &'a mut Value, found: &mut Vec<&'a mut Value>) {
    if node.get("type").and_then(Value::as_str) == Some("taskItem") {
        found.push(node);
        return;
    }
    if let Some(children) = node.get_mut("content").and_then(Value::as_array_mut) {
        for child in children {
            walk_tasks(child, found);
        }
    }
}

fn task_id_of(node: &Value) -> Option<&str> {
    node.get("attrs")?.get("taskId")?.as_str()
}

fn task_order(doc: &mut Value, task_id: &str) -> Option<usize> {
    let mut tasks = Vec::new();
    walk_tasks(doc, &mut tasks);
    tasks
        .iter()
        .position(|task| task_id_of(task) == Some(task_id))
}

fn node_text(node: &Value) -> String {
    if let Some(text) = node.get("text").and_then(Value::as_str) {
        return text.to_string();
    }
    node.get("content")
        .and_then(Value::as_array)
        .map(|children| children.iter().map(node_text).collect())
        .unwrap_or_default()
}

pub fn complete_task(doc: &mut Value, task_id: &str) -> Option<String> {
    let mut tasks = Vec::new();
    walk_tasks(doc, &mut tasks);
    let task = tasks
        .into_iter()
        .find(|task| task_id_of(task) == Some(task_id))?;
    let attrs = task.get_mut("attrs")?.as_object_mut()?;
    attrs.insert("status".into(), json!("done"));
    attrs.insert("checked".into(), json!(true));
    let text = task
        .get("content")
        .and_then(Value::as_array)
        .and_then(|children| {
            children
                .iter()
                .find(|child| child.get("type").and_then(Value::as_str) == Some("paragraph"))
        })
        .map(node_text)
        .unwrap_or_default();
    Some(text)
}

fn tag_note_metadata(metadata: &str, edit_id: &str) -> EditResult<String> {
    let mut value: Value = if metadata.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(metadata)?
    };
    let object = value
        .as_object_mut()
        .ok_or_else(|| EditError::Invalid("the note metadata is not an object".into()))?;
    let edits = object.entry("coach_edits").or_insert_with(|| json!([]));
    match edits.as_array_mut() {
        Some(list) => list.push(json!(edit_id)),
        None => *edits = json!([edit_id]),
    }
    Ok(serde_json::to_string(&value)?)
}

pub(crate) async fn now(conn: &mut SqliteConnection) -> EditResult<String> {
    Ok(sqlx::query_scalar(NOW_SQL).fetch_one(conn).await?)
}

async fn write_note(
    conn: &mut SqliteConnection,
    session_id: &str,
    before: Option<&NoteRow>,
    doc: &Value,
    edit_id: &str,
    now: &str,
) -> EditResult<()> {
    let body = serde_json::to_string(doc)?;
    let metadata = tag_note_metadata(
        before.map_or("", |note| note.generation_metadata_json.as_str()),
        edit_id,
    )?;
    if before.is_some() {
        sqlx::query(
            "UPDATE session_documents
             SET body = ?, body_format = 'prosemirror_json', generation_metadata_json = ?,
                 updated_at = ?, deleted_at = NULL
             WHERE id = ? AND kind = 'note'",
        )
        .bind(body)
        .bind(metadata)
        .bind(now)
        .bind(session_id)
        .execute(conn)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO session_documents (
               id, workspace_id, session_id, kind, template_id, body_format, body,
               generation_metadata_json, created_by, updated_by, created_at, updated_at, deleted_at
             )
             SELECT ?, workspace_id, id, 'note', '', 'prosemirror_json', ?, ?,
               owner_user_id, owner_user_id, ?, ?, NULL
             FROM sessions WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(session_id)
        .bind(body)
        .bind(metadata)
        .bind(now)
        .bind(now)
        .bind(session_id)
        .execute(conn)
        .await?;
    }
    Ok(())
}

pub(crate) fn new_edit(
    session_id: &str,
    kind: EditKind,
    summary: String,
    task_id: Option<String>,
) -> CoachEdit {
    CoachEdit {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        kind,
        summary,
        task_id,
        target_id: None,
    }
}

pub(crate) fn preview(text: &str) -> String {
    const MAX: usize = 80;
    let text = text.trim();
    if text.chars().count() <= MAX {
        return text.to_string();
    }
    format!("{}…", text.chars().take(MAX - 1).collect::<String>())
}

impl Edits {
    pub async fn append_note(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        lines: &[String],
        style: NoteStyle,
    ) -> EditResult<CoachEdit> {
        let mut log = self.log.lock().await;
        self.ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        let before = read_note(&mut tx, session_id).await?;
        let mut doc = parse_doc(before.as_ref())?;
        append_lines(&mut doc, lines, style)?;
        let added = clean_lines(lines);
        let summary = match added.as_slice() {
            [only] => format!("Added to the notes: {}", preview(only)),
            many => format!("Added {} lines to the notes", many.len()),
        };
        let edit = new_edit(session_id, EditKind::Note, summary, None);
        let now = now(&mut tx).await?;
        write_note(&mut tx, session_id, before.as_ref(), &doc, &edit.id, &now).await?;
        tx.commit().await?;
        log.push(UndoEntry {
            edit: edit.clone(),
            change: Change::Note(NoteUndo {
                note_before: before,
                note_after: doc,
                item_id: None,
                item_before: None,
                item_status_after: None,
            }),
        });
        Ok(edit)
    }

    pub async fn add_action_item(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        text: &str,
    ) -> EditResult<CoachEdit> {
        let text = text.trim();
        if text.is_empty() {
            return Err(EditError::Invalid("an action item needs text".into()));
        }
        let mut log = self.log.lock().await;
        self.ensure_current(pool, session_id).await?;
        let task_id = uuid::Uuid::new_v4().to_string();
        let edit = new_edit(
            session_id,
            EditKind::AddActionItem,
            format!("Added action item: {}", preview(text)),
            Some(task_id.clone()),
        );
        let mut tx = pool.begin().await?;
        let before = read_note(&mut tx, session_id).await?;
        let mut doc = parse_doc(before.as_ref())?;
        let item = append_task(&mut doc, &task_id, text)?;
        let order = task_order(&mut doc, &task_id).unwrap_or_default();
        let now = now(&mut tx).await?;
        write_note(&mut tx, session_id, before.as_ref(), &doc, &edit.id, &now).await?;
        sqlx::query(
            "INSERT INTO action_items (
               id, workspace_id, session_id, source_type, source_id, source_order,
               assignee_human_id, status, text, body_json, due_at, created_by, updated_by,
               metadata_json, created_at, updated_at, deleted_at
             )
             SELECT ?, COALESCE(
                 NULLIF(workspace_id, ''),
                 (SELECT NULLIF(json_extract(value_json, '$.workspace_id'), '')
                  FROM app_settings WHERE id = 'cloudsync_workspace_binding'),
                 ''
               ), '', ?, ?, ?, '', 'todo', ?, ?, '', owner_user_id, owner_user_id, ?, ?, ?, NULL
             FROM sessions WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(&task_id)
        .bind(RAW_NOTE_SOURCE)
        .bind(session_id)
        .bind(i64::try_from(order).unwrap_or(i64::MAX))
        .bind(text)
        .bind(serde_json::to_string(&item["content"])?)
        .bind(serde_json::to_string(
            &json!({ "by": "coach", "edit_id": edit.id }),
        )?)
        .bind(&now)
        .bind(&now)
        .bind(session_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        log.push(UndoEntry {
            edit: edit.clone(),
            change: Change::Note(NoteUndo {
                note_before: before,
                note_after: doc,
                item_id: Some(task_id),
                item_before: None,
                item_status_after: Some("todo".into()),
            }),
        });
        Ok(edit)
    }

    pub async fn complete_action_item(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        task_id: &str,
    ) -> EditResult<CoachEdit> {
        let mut log = self.log.lock().await;
        self.ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        let before = read_note(&mut tx, session_id).await?;
        let mut doc = parse_doc(before.as_ref())?;
        let text = complete_task(&mut doc, task_id)
            .ok_or_else(|| EditError::UnknownTask(task_id.into()))?;
        let item_before = read_item(&mut tx, session_id, task_id).await?;
        let edit = new_edit(
            session_id,
            EditKind::CompleteActionItem,
            format!("Marked done: {}", preview(&text)),
            Some(task_id.to_string()),
        );
        let now = now(&mut tx).await?;
        write_note(&mut tx, session_id, before.as_ref(), &doc, &edit.id, &now).await?;
        if let Some(item) = &item_before {
            let mut metadata: Value = serde_json::from_str(&item.metadata_json)
                .ok()
                .filter(Value::is_object)
                .unwrap_or_else(|| json!({}));
            metadata["completed_by"] = json!("coach");
            metadata["edit_id"] = json!(edit.id);
            sqlx::query(
                "UPDATE action_items SET status = 'done', metadata_json = ?, updated_at = ?
                 WHERE id = ? AND source_type = ? AND source_id = ?",
            )
            .bind(serde_json::to_string(&metadata)?)
            .bind(&now)
            .bind(task_id)
            .bind(RAW_NOTE_SOURCE)
            .bind(session_id)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        let tracked = item_before.is_some();
        log.push(UndoEntry {
            edit: edit.clone(),
            change: Change::Note(NoteUndo {
                note_before: before,
                note_after: doc,
                item_id: Some(task_id.to_string()),
                item_before,
                item_status_after: tracked.then(|| "done".into()),
            }),
        });
        Ok(edit)
    }

    pub async fn assign_transcript_speaker(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        channel: i64,
        speaker_index: i64,
        human_id: &str,
    ) -> EditResult<CoachEdit> {
        if channel < 0 || speaker_index < 0 {
            return Err(EditError::Invalid(
                "speaker coordinates must be non-negative".into(),
            ));
        }
        let mut log = self.log.lock().await;
        self.ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        let row = sqlx::query(
            "SELECT id, words_json, speaker_hints_json FROM transcripts
             WHERE session_id = ? AND deleted_at IS NULL ORDER BY started_at_ms DESC LIMIT 1",
        )
        .bind(session_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(EditError::NoMeeting)?;
        let transcript_id: String = row.try_get("id")?;
        let words_json: String = row.try_get("words_json")?;
        let hints_before: String = row.try_get("speaker_hints_json")?;
        let participant: Option<String> = sqlx::query_scalar(
            "SELECT h.id FROM humans h JOIN session_participants p ON p.human_id = h.id
             WHERE p.session_id = ? AND p.human_id = ? AND p.deleted_at IS NULL
               AND p.source <> 'excluded' AND h.deleted_at IS NULL LIMIT 1",
        )
        .bind(session_id)
        .bind(human_id)
        .fetch_optional(&mut *tx)
        .await?;
        if participant.is_none() {
            return Err(EditError::Invalid(
                "the person is not an active participant in this meeting".into(),
            ));
        }
        let words: Vec<Value> = serde_json::from_str(&words_json)?;
        let hints_value: Value = serde_json::from_str(&hints_before)?;
        let hints = hints_value
            .as_array()
            .ok_or_else(|| EditError::Invalid("speaker hints are invalid".into()))?;
        let provider: std::collections::HashMap<String, (i64, i64)> = hints
            .iter()
            .filter(|hint| {
                hint.get("type").and_then(Value::as_str) == Some("provider_speaker_index")
            })
            .filter_map(|hint| {
                let value_text = hint.get("value")?;
                let value: Value = if let Some(text) = value_text.as_str() {
                    serde_json::from_str(text).ok()?
                } else {
                    value_text.clone()
                };
                Some((
                    hint.get("word_id")?.as_str()?.to_string(),
                    (
                        value.get("channel")?.as_i64()?,
                        value.get("speaker_index")?.as_i64()?,
                    ),
                ))
            })
            .collect();
        let matching: Vec<&Value> = words
            .iter()
            .filter(|word| {
                let id = word.get("id").and_then(Value::as_str).unwrap_or_default();
                let resolved = word
                    .get("speaker_index")
                    .and_then(Value::as_i64)
                    .map(|index| {
                        (
                            word.get("channel")
                                .and_then(Value::as_i64)
                                .unwrap_or_default(),
                            index,
                        )
                    })
                    .or_else(|| provider.get(id).copied());
                resolved == Some((channel, speaker_index))
            })
            .collect();
        let anchor = matching
            .first()
            .and_then(|word| word.get("id"))
            .and_then(Value::as_str)
            .ok_or_else(|| EditError::Invalid("the speaker is not in this transcript".into()))?
            .to_string();
        let mut hints_after: Vec<Value> = hints
            .iter()
            .filter(|hint| {
                if hint.get("type").and_then(Value::as_str) != Some("user_speaker_assignment") {
                    return true;
                }
                let value_text = hint
                    .get("value")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let value: Value = serde_json::from_str(value_text).unwrap_or(Value::Null);
                !(value.get("scope").and_then(Value::as_str) == Some("speaker")
                    && value.get("channel").and_then(Value::as_i64) == Some(channel)
                    && value.get("speaker_index").and_then(Value::as_i64) == Some(speaker_index))
            })
            .cloned()
            .collect();
        let value = serde_json::to_string(&json!({
            "human_id": human_id, "scope": "speaker", "channel": channel, "speaker_index": speaker_index
        }))?;
        hints_after.push(json!({
            "id": format!("{anchor}:user_speaker_assignment"),
            "word_id": anchor,
            "type": "user_speaker_assignment",
            "value": value,
        }));
        let hints_after = serde_json::to_string(&hints_after)?;
        let name: String = sqlx::query_scalar("SELECT name FROM humans WHERE id = ?")
            .bind(human_id)
            .fetch_one(&mut *tx)
            .await?;
        let edit = new_edit(
            session_id,
            EditKind::AssignSpeaker,
            format!("Assigned Speaker {} to {}", speaker_index + 1, name),
            None,
        );
        let result = sqlx::query(
            "UPDATE transcripts SET speaker_hints_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ? AND session_id = ? AND speaker_hints_json = ? AND deleted_at IS NULL",
        ).bind(&hints_after).bind(&transcript_id).bind(session_id).bind(&hints_before).execute(&mut *tx).await?;
        if result.rows_affected() != 1 {
            return Err(EditError::ChangedSince);
        }
        tx.commit().await?;
        log.push(UndoEntry {
            edit: edit.clone(),
            change: Change::Transcript(TranscriptUndo {
                transcript_id,
                field: TranscriptField::SpeakerHints,
                before: hints_before,
                after: hints_after,
            }),
        });
        Ok(edit)
    }

    pub async fn correct_transcript_words(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        word_ids: &[String],
        expected_text: &str,
        replacement: &str,
    ) -> EditResult<CoachEdit> {
        let expected = expected_text.trim();
        let replacement = replacement.trim();
        if word_ids.is_empty()
            || word_ids.iter().any(|id| id.trim().is_empty())
            || replacement.is_empty()
        {
            return Err(EditError::Invalid(
                "a correction needs word IDs and replacement text".into(),
            ));
        }
        let mut unique = std::collections::HashSet::new();
        if word_ids.iter().any(|id| !unique.insert(id)) {
            return Err(EditError::Invalid(
                "a correction cannot repeat word IDs".into(),
            ));
        }
        let mut log = self.log.lock().await;
        self.ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        let row = sqlx::query(
            "SELECT id, words_json, ended_at_ms FROM transcripts
             WHERE session_id = ? AND deleted_at IS NULL ORDER BY started_at_ms DESC LIMIT 1",
        )
        .bind(session_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(EditError::NoMeeting)?;
        let transcript_id: String = row.try_get("id")?;
        let words_before: String = row.try_get("words_json")?;
        let ended_at_ms: Option<i64> = row.try_get("ended_at_ms")?;
        if ended_at_ms.is_none() {
            return Err(EditError::Invalid(
                "transcript corrections are available after the meeting ends".into(),
            ));
        }
        let mut words: Vec<Value> = serde_json::from_str(&words_before)?;
        let positions: Vec<usize> = word_ids
            .iter()
            .map(|id| {
                words
                    .iter()
                    .position(|word| word.get("id").and_then(Value::as_str) == Some(id))
            })
            .collect::<Option<Vec<_>>>()
            .ok_or(EditError::ChangedSince)?;
        if positions.windows(2).any(|pair| pair[1] != pair[0] + 1) {
            return Err(EditError::Invalid(
                "corrected words must be one continuous transcript span".into(),
            ));
        }
        let actual = positions
            .iter()
            .filter_map(|index| words[*index].get("text").and_then(Value::as_str))
            .collect::<String>();
        if actual.trim() != expected {
            return Err(EditError::ChangedSince);
        }
        let first = positions[0];
        let original = words[first]["text"].as_str().unwrap_or_default();
        let leading = &original[..original.len() - original.trim_start().len()];
        words[first]["text"] = json!(format!("{leading}{replacement}"));
        for index in positions.iter().skip(1) {
            words[*index]["text"] = json!("");
        }
        let words_after = serde_json::to_string(&words)?;
        let edit = new_edit(
            session_id,
            EditKind::CorrectTranscript,
            format!("Corrected transcript: {}", preview(expected)),
            None,
        );
        let result = sqlx::query(
            "UPDATE transcripts SET words_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ? AND session_id = ? AND words_json = ? AND ended_at_ms IS NOT NULL AND deleted_at IS NULL",
        ).bind(&words_after).bind(&transcript_id).bind(session_id).bind(&words_before).execute(&mut *tx).await?;
        if result.rows_affected() != 1 {
            return Err(EditError::ChangedSince);
        }
        tx.commit().await?;
        log.push(UndoEntry {
            edit: edit.clone(),
            change: Change::Transcript(TranscriptUndo {
                transcript_id,
                field: TranscriptField::Words,
                before: words_before,
                after: words_after,
            }),
        });
        Ok(edit)
    }

    pub async fn undo_last(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        edit_id: Option<&str>,
    ) -> EditResult<CoachEdit> {
        let mut log = self.log.lock().await;
        self.ensure_current(pool, session_id).await?;
        let index = log
            .iter()
            .rposition(|entry| entry.edit.session_id == session_id)
            .ok_or(EditError::NothingToUndo)?;
        if edit_id.is_some_and(|id| id != log[index].edit.id) {
            return Err(EditError::NotLatest);
        }
        let entry = &log[index];
        let mut tx = pool.begin().await?;
        match &entry.change {
            Change::Note(note) => undo_note(&mut tx, session_id, entry.edit.kind, note).await?,
            Change::Transcript(change) => undo_transcript(&mut tx, change).await?,
            Change::Library(change) => crate::library::undo(&mut tx, change).await?,
        }
        tx.commit().await?;
        Ok(log.remove(index).edit)
    }
}

async fn undo_transcript(tx: &mut SqliteConnection, entry: &TranscriptUndo) -> EditResult<()> {
    let current: Option<String> =
        match entry.field {
            TranscriptField::Words => {
                sqlx::query_scalar(
                    "SELECT words_json FROM transcripts WHERE id = ? AND deleted_at IS NULL",
                )
                .bind(&entry.transcript_id)
                .fetch_optional(&mut *tx)
                .await?
            }
            TranscriptField::SpeakerHints => sqlx::query_scalar(
                "SELECT speaker_hints_json FROM transcripts WHERE id = ? AND deleted_at IS NULL",
            )
            .bind(&entry.transcript_id)
            .fetch_optional(&mut *tx)
            .await?,
        };
    if current.as_deref() != Some(entry.after.as_str()) {
        return Err(EditError::ChangedSince);
    }
    let result = match entry.field {
        TranscriptField::Words => sqlx::query("UPDATE transcripts SET words_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND words_json = ? AND deleted_at IS NULL")
            .bind(&entry.before).bind(&entry.transcript_id).bind(&entry.after).execute(&mut *tx).await?,
        TranscriptField::SpeakerHints => sqlx::query("UPDATE transcripts SET speaker_hints_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND speaker_hints_json = ? AND deleted_at IS NULL")
            .bind(&entry.before).bind(&entry.transcript_id).bind(&entry.after).execute(&mut *tx).await?,
    };
    if result.rows_affected() != 1 {
        return Err(EditError::ChangedSince);
    }
    Ok(())
}

async fn undo_note(
    tx: &mut SqliteConnection,
    session_id: &str,
    kind: EditKind,
    entry: &NoteUndo,
) -> EditResult<()> {
    let current = read_note(&mut *tx, session_id).await?;
    if parse_doc(current.as_ref()).ok().as_ref() != Some(&entry.note_after) {
        return Err(EditError::ChangedSince);
    }
    if let Some(item_id) = &entry.item_id {
        let item = read_item(&mut *tx, session_id, item_id).await?;
        let status = item
            .as_ref()
            .filter(|item| item.deleted_at.is_none())
            .map(|item| item.status.clone());
        if status != entry.item_status_after {
            return Err(EditError::ChangedSince);
        }
    }

    match &entry.note_before {
        Some(note) => {
            sqlx::query(
                "UPDATE session_documents
                     SET body = ?, body_format = ?, generation_metadata_json = ?,
                         updated_at = ?, updated_by = ?, deleted_at = ?
                     WHERE id = ? AND kind = 'note'",
            )
            .bind(&note.body)
            .bind(&note.body_format)
            .bind(&note.generation_metadata_json)
            .bind(&note.updated_at)
            .bind(&note.updated_by)
            .bind(&note.deleted_at)
            .bind(session_id)
            .execute(&mut *tx)
            .await?;
        }
        None => {
            sqlx::query("DELETE FROM session_documents WHERE id = ? AND kind = 'note'")
                .bind(session_id)
                .execute(&mut *tx)
                .await?;
        }
    }
    if let Some(item_id) = &entry.item_id {
        match (&entry.item_before, kind) {
            (Some(item), _) => {
                sqlx::query(
                    "UPDATE action_items
                         SET status = ?, metadata_json = ?, updated_at = ?, updated_by = ?,
                             deleted_at = ?
                         WHERE id = ? AND source_type = ? AND source_id = ?",
                )
                .bind(&item.status)
                .bind(&item.metadata_json)
                .bind(&item.updated_at)
                .bind(&item.updated_by)
                .bind(&item.deleted_at)
                .bind(item_id)
                .bind(RAW_NOTE_SOURCE)
                .bind(session_id)
                .execute(&mut *tx)
                .await?;
            }
            (None, EditKind::AddActionItem) => {
                sqlx::query(
                    "DELETE FROM action_items WHERE id = ? AND source_type = ? AND source_id = ?",
                )
                .bind(item_id)
                .bind(RAW_NOTE_SOURCE)
                .bind(session_id)
                .execute(&mut *tx)
                .await?;
            }
            (None, _) => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const MEETING: &str = "meeting-1";
    const OTHER: &str = "meeting-2";
    const NOTE: &str = r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Agenda: pricing"}]}]}"#;

    async fn pool() -> SqlitePool {
        let db = anlg_db_core::Db::connect_memory_plain().await.unwrap();
        anlg_db_app::prepare_schema(&db).await.unwrap();
        let pool = db.pool().clone();
        for (id, started) in [(OTHER, 1_000), (MEETING, 2_000)] {
            sqlx::query(
                "INSERT INTO sessions (id, workspace_id, owner_user_id, title) VALUES (?, 'ws', 'me', ?)",
            )
            .bind(id)
            .bind(format!("Meeting {id}"))
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO session_documents (id, workspace_id, session_id, kind, body_format, body, created_by, updated_by, updated_at)
                 VALUES (?, 'ws', ?, 'note', 'prosemirror_json', ?, 'me', 'me', '2026-10-18T09:00:00.000Z')",
            )
            .bind(id)
            .bind(id)
            .bind(NOTE)
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
        pool
    }

    async fn seed_transcript(pool: &SqlitePool, session_id: &str, ended_at_ms: Option<i64>) {
        let words = json!([
            {"id":"w1","text":" We","start_ms":0,"end_ms":200,"channel":1,"speaker_index":2},
            {"id":"w2","text":" ship","start_ms":210,"end_ms":400,"channel":1,"speaker_index":2},
            {"id":"w3","text":" Friday","start_ms":410,"end_ms":700,"channel":1,"speaker_index":2},
            {"id":"w4","text":" soon","start_ms":800,"end_ms":1000,"channel":1,"speaker_index":3}
        ]);
        sqlx::query("UPDATE transcripts SET words_json = ?, ended_at_ms = ? WHERE session_id = ?")
            .bind(words.to_string())
            .bind(ended_at_ms)
            .bind(session_id)
            .execute(pool)
            .await
            .unwrap();
    }

    async fn seed_person(pool: &SqlitePool, session_id: &str, human_id: &str, name: &str) {
        sqlx::query("INSERT INTO humans (id, name, email) VALUES (?, ?, '')")
            .bind(human_id)
            .bind(name)
            .execute(pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO session_participants (id, session_id, human_id, source) VALUES (?, ?, ?, 'manual')")
            .bind(format!("{session_id}:{human_id}"))
            .bind(session_id)
            .bind(human_id)
            .execute(pool)
            .await
            .unwrap();
    }

    async fn note(pool: &SqlitePool, id: &str) -> NoteRow {
        let mut conn = pool.acquire().await.unwrap();
        read_note(&mut conn, id).await.unwrap().unwrap()
    }

    async fn items(pool: &SqlitePool) -> Vec<(String, String, String, String, String)> {
        sqlx::query_as(
            "SELECT id, source_type, source_id, status, metadata_json FROM action_items
             WHERE deleted_at IS NULL ORDER BY id",
        )
        .fetch_all(pool)
        .await
        .unwrap()
    }

    fn texts(doc: &str) -> Vec<String> {
        let value: Value = serde_json::from_str(doc).unwrap();
        let mut walked = value.clone();
        let mut tasks = Vec::new();
        walk_tasks(&mut walked, &mut tasks);
        let mut out: Vec<String> = value["content"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|node| node["type"] == "paragraph")
            .map(node_text)
            .collect();
        out.extend(tasks.iter().map(|task| {
            format!(
                "[{}] {}",
                task["attrs"]["status"].as_str().unwrap(),
                node_text(task)
            )
        }));
        out
    }

    #[tokio::test]
    async fn speaker_assignment_is_scoped_to_a_meeting_participant_and_can_be_undone() {
        let pool = pool().await;
        seed_transcript(&pool, MEETING, None).await;
        seed_person(&pool, MEETING, "sara", "Sara").await;
        let edits = Edits::default();

        let edit = edits
            .assign_transcript_speaker(&pool, MEETING, 1, 2, "sara")
            .await
            .unwrap();

        let hints: String =
            sqlx::query_scalar("SELECT speaker_hints_json FROM transcripts WHERE session_id = ?")
                .bind(MEETING)
                .fetch_one(&pool)
                .await
                .unwrap();
        let hints: Value = serde_json::from_str(&hints).unwrap();
        assert_eq!(edit.kind, EditKind::AssignSpeaker);
        assert_eq!(hints[0]["word_id"], "w1");
        assert_eq!(
            serde_json::from_str::<Value>(hints[0]["value"].as_str().unwrap()).unwrap(),
            json!({
                "human_id": "sara", "scope": "speaker", "channel": 1, "speaker_index": 2
            })
        );
        assert!(matches!(
            edits
                .assign_transcript_speaker(&pool, MEETING, 1, 3, "absent")
                .await,
            Err(EditError::Invalid(_))
        ));

        edits
            .undo_last(&pool, MEETING, Some(&edit.id))
            .await
            .unwrap();
        let restored: String =
            sqlx::query_scalar("SELECT speaker_hints_json FROM transcripts WHERE session_id = ?")
                .bind(MEETING)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(restored, "[]");
    }

    #[tokio::test]
    async fn transcript_correction_preserves_word_ids_and_timing_and_refuses_stale_text() {
        let pool = pool().await;
        seed_transcript(&pool, MEETING, Some(2_000)).await;
        let edits = Edits::default();

        let edit = edits
            .correct_transcript_words(
                &pool,
                MEETING,
                &["w1".into(), "w2".into(), "w3".into()],
                "We ship Friday",
                "We ship Monday",
            )
            .await
            .unwrap();

        let words: String =
            sqlx::query_scalar("SELECT words_json FROM transcripts WHERE session_id = ?")
                .bind(MEETING)
                .fetch_one(&pool)
                .await
                .unwrap();
        let words: Value = serde_json::from_str(&words).unwrap();
        assert_eq!(edit.kind, EditKind::CorrectTranscript);
        assert_eq!(words[0]["id"], "w1");
        assert_eq!(words[0]["start_ms"], 0);
        assert_eq!(words[0]["text"], " We ship Monday");
        assert_eq!(words[1]["id"], "w2");
        assert_eq!(words[1]["start_ms"], 210);
        assert_eq!(words[1]["text"], "");
        assert_eq!(words[3]["text"], " soon");
        assert!(matches!(
            edits
                .correct_transcript_words(&pool, MEETING, &["w1".into()], "stale", "changed")
                .await,
            Err(EditError::ChangedSince)
        ));

        edits
            .undo_last(&pool, MEETING, Some(&edit.id))
            .await
            .unwrap();
        let restored: String =
            sqlx::query_scalar("SELECT words_json FROM transcripts WHERE session_id = ?")
                .bind(MEETING)
                .fetch_one(&pool)
                .await
                .unwrap();
        let restored: Value = serde_json::from_str(&restored).unwrap();
        assert_eq!(restored[0]["text"], " We");
        assert_eq!(restored[1]["text"], " ship");
    }

    #[tokio::test]
    async fn transcript_undo_refuses_to_overwrite_a_later_transcript_change() {
        let pool = pool().await;
        seed_transcript(&pool, MEETING, Some(2_000)).await;
        let edits = Edits::default();
        let edit = edits
            .correct_transcript_words(&pool, MEETING, &["w1".into()], "We", "I")
            .await
            .unwrap();
        let mut current: String =
            sqlx::query_scalar("SELECT words_json FROM transcripts WHERE session_id = ?")
                .bind(MEETING)
                .fetch_one(&pool)
                .await
                .unwrap();
        let mut words: Value = serde_json::from_str(&current).unwrap();
        words[0]["start_ms"] = json!(10);
        current = serde_json::to_string(&words).unwrap();
        sqlx::query("UPDATE transcripts SET words_json = ? WHERE session_id = ?")
            .bind(current)
            .bind(MEETING)
            .execute(&pool)
            .await
            .unwrap();

        assert!(matches!(
            edits.undo_last(&pool, MEETING, Some(&edit.id)).await,
            Err(EditError::ChangedSince)
        ));
        let retained: String =
            sqlx::query_scalar("SELECT words_json FROM transcripts WHERE session_id = ?")
                .bind(MEETING)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&retained).unwrap()[0]["start_ms"],
            10
        );
    }

    #[tokio::test]
    async fn an_appended_note_is_tagged_and_undo_restores_the_row_exactly() {
        let pool = pool().await;
        let edits = Edits::default();
        let before = note(&pool, MEETING).await;

        let edit = edits
            .append_note(
                &pool,
                MEETING,
                &["Decision: ship Friday".into()],
                NoteStyle::Paragraphs,
            )
            .await
            .unwrap();

        let after = note(&pool, MEETING).await;
        assert_ne!(after.body, before.body);
        assert_eq!(
            texts(&after.body),
            ["Agenda: pricing", "Decision: ship Friday"]
        );
        let metadata: Value = serde_json::from_str(&after.generation_metadata_json).unwrap();
        assert_eq!(metadata["coach_edits"], json!([edit.id]));

        let undone = edits
            .undo_last(&pool, MEETING, Some(&edit.id))
            .await
            .unwrap();

        assert_eq!(undone, edit);
        assert_eq!(note(&pool, MEETING).await, before);
    }

    #[tokio::test]
    async fn an_added_action_item_lands_in_the_note_and_the_task_table_and_undo_removes_both() {
        let pool = pool().await;
        let edits = Edits::default();
        let before = note(&pool, MEETING).await;

        let edit = edits
            .add_action_item(&pool, MEETING, "Send Sara the pricing sheet")
            .await
            .unwrap();
        let task_id = edit.task_id.clone().unwrap();

        let after = note(&pool, MEETING).await;
        assert_eq!(
            texts(&after.body),
            ["Agenda: pricing", "[todo] Send Sara the pricing sheet"]
        );
        let rows = items(&pool).await;
        assert_eq!(rows.len(), 1);
        let (id, source_type, source_id, status, metadata) = &rows[0];
        assert_eq!(
            (
                id.as_str(),
                source_type.as_str(),
                source_id.as_str(),
                status.as_str()
            ),
            (task_id.as_str(), RAW_NOTE_SOURCE, MEETING, "todo")
        );
        assert_eq!(
            serde_json::from_str::<Value>(metadata).unwrap()["by"],
            "coach"
        );

        edits.undo_last(&pool, MEETING, None).await.unwrap();

        assert_eq!(note(&pool, MEETING).await, before);
        let remaining: i64 = sqlx::query_scalar("SELECT count(*) FROM action_items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn completing_an_action_item_checks_it_and_undo_unchecks_it() {
        let pool = pool().await;
        let edits = Edits::default();
        let added = edits
            .add_action_item(&pool, MEETING, "Book the venue")
            .await
            .unwrap();
        let task_id = added.task_id.unwrap();
        let open_note = note(&pool, MEETING).await;

        let done = edits
            .complete_action_item(&pool, MEETING, &task_id)
            .await
            .unwrap();

        assert_eq!(done.summary, "Marked done: Book the venue");
        assert_eq!(
            texts(&note(&pool, MEETING).await.body),
            ["Agenda: pricing", "[done] Book the venue"]
        );
        assert_eq!(items(&pool).await[0].3, "done");

        edits
            .undo_last(&pool, MEETING, Some(&done.id))
            .await
            .unwrap();

        assert_eq!(note(&pool, MEETING).await, open_note);
        assert_eq!(items(&pool).await[0].3, "todo");
    }

    #[tokio::test]
    async fn edits_to_a_meeting_other_than_the_current_one_are_refused() {
        let pool = pool().await;
        let edits = Edits::default();
        let other_before = note(&pool, OTHER).await;

        let refused = edits
            .append_note(&pool, OTHER, &["Leaked".into()], NoteStyle::Paragraphs)
            .await;
        let refused_task = edits.add_action_item(&pool, OTHER, "Leaked").await;

        assert!(
            matches!(refused, Err(EditError::NotCurrentMeeting)),
            "{refused:?}"
        );
        assert!(
            matches!(refused_task, Err(EditError::NotCurrentMeeting)),
            "{refused_task:?}"
        );
        assert_eq!(note(&pool, OTHER).await, other_before);
        assert!(items(&pool).await.is_empty());
        edits
            .append_note(&pool, MEETING, &["Allowed".into()], NoteStyle::Paragraphs)
            .await
            .unwrap();
        assert_ne!(note(&pool, MEETING).await.body, other_before.body);
    }

    #[tokio::test]
    async fn edits_follow_the_app_not_a_transcript_left_open_by_a_crash() {
        let pool = pool().await;
        sqlx::query("UPDATE transcripts SET ended_at_ms = 3_000 WHERE session_id = ?")
            .bind(MEETING)
            .execute(&pool)
            .await
            .unwrap();
        let edits = Edits::following(std::sync::Arc::new(|| Box::pin(async { Some(Vec::new()) })));
        let zombie_before = note(&pool, OTHER).await;

        let zombie = edits.add_action_item(&pool, OTHER, "Leaked").await;
        let stopped = edits
            .add_action_item(&pool, MEETING, "Send the proposal")
            .await;

        assert!(
            matches!(zombie, Err(EditError::NotCurrentMeeting)),
            "{zombie:?}"
        );
        assert_eq!(stopped.unwrap().session_id, MEETING);
        assert_eq!(note(&pool, OTHER).await, zombie_before);
    }

    #[tokio::test]
    async fn completing_a_task_from_another_meeting_is_refused() {
        let pool = pool().await;
        let edits = Edits::default();
        let own = edits
            .add_action_item(&pool, MEETING, "Own task")
            .await
            .unwrap();

        let foreign = edits
            .complete_action_item(&pool, MEETING, "task-from-elsewhere")
            .await;

        assert!(
            matches!(foreign, Err(EditError::UnknownTask(_))),
            "{foreign:?}"
        );
        edits
            .complete_action_item(&pool, MEETING, &own.task_id.unwrap())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn undo_is_refused_once_the_user_changed_the_note_and_only_the_latest_edit_undoes() {
        let pool = pool().await;
        let edits = Edits::default();
        let first = edits
            .append_note(&pool, MEETING, &["First".into()], NoteStyle::Bullets)
            .await
            .unwrap();
        let second = edits
            .append_note(&pool, MEETING, &["Second".into()], NoteStyle::Paragraphs)
            .await
            .unwrap();

        let out_of_order = edits.undo_last(&pool, MEETING, Some(&first.id)).await;
        assert!(
            matches!(out_of_order, Err(EditError::NotLatest)),
            "{out_of_order:?}"
        );

        sqlx::query("UPDATE session_documents SET body = ? WHERE id = ?")
            .bind(NOTE)
            .bind(MEETING)
            .execute(&pool)
            .await
            .unwrap();
        let changed = edits.undo_last(&pool, MEETING, Some(&second.id)).await;
        assert!(
            matches!(changed, Err(EditError::ChangedSince)),
            "{changed:?}"
        );
        assert_eq!(note(&pool, MEETING).await.body, NOTE);
    }

    #[tokio::test]
    async fn a_meeting_without_notes_gets_one_and_undo_removes_it() {
        let pool = pool().await;
        sqlx::query("DELETE FROM session_documents WHERE id = ?")
            .bind(MEETING)
            .execute(&pool)
            .await
            .unwrap();
        let edits = Edits::default();

        edits
            .append_note(&pool, MEETING, &["Kickoff".into()], NoteStyle::Paragraphs)
            .await
            .unwrap();
        assert_eq!(texts(&note(&pool, MEETING).await.body), ["Kickoff"]);

        edits.undo_last(&pool, MEETING, None).await.unwrap();

        let mut conn = pool.acquire().await.unwrap();
        assert_eq!(read_note(&mut conn, MEETING).await.unwrap(), None);
    }
}
