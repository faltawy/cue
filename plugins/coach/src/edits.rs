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
    Invalid(String),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

type EditResult<T> = std::result::Result<T, EditError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EditKind {
    Note,
    AddActionItem,
    CompleteActionItem,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct CoachEdit {
    pub id: String,
    pub session_id: String,
    pub kind: EditKind,
    pub summary: String,
    pub task_id: Option<String>,
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

struct UndoEntry {
    edit: CoachEdit,
    note_before: Option<NoteRow>,
    note_after: Value,
    item_id: Option<String>,
    item_before: Option<ItemRow>,
    item_status_after: Option<String>,
}

#[derive(Default)]
pub struct Edits {
    log: Mutex<Vec<UndoEntry>>,
}

pub async fn current_meeting(pool: &SqlitePool) -> EditResult<Option<String>> {
    Ok(sqlx::query_scalar(
        "SELECT session_id FROM transcripts WHERE deleted_at IS NULL
         ORDER BY (ended_at_ms IS NULL) DESC, started_at_ms DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await?)
}

async fn ensure_current(pool: &SqlitePool, session_id: &str) -> EditResult<()> {
    if current_meeting(pool).await?.as_deref() != Some(session_id) {
        return Err(EditError::NotCurrentMeeting);
    }
    let exists: Option<String> =
        sqlx::query_scalar("SELECT id FROM sessions WHERE id = ? AND deleted_at IS NULL")
            .bind(session_id)
            .fetch_optional(pool)
            .await?;
    exists.map(|_| ()).ok_or(EditError::NoMeeting)
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

async fn now(conn: &mut SqliteConnection) -> EditResult<String> {
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

fn new_edit(
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
    }
}

fn preview(text: &str) -> String {
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
        ensure_current(pool, session_id).await?;
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
            note_before: before,
            note_after: doc,
            item_id: None,
            item_before: None,
            item_status_after: None,
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
        ensure_current(pool, session_id).await?;
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
            note_before: before,
            note_after: doc,
            item_id: Some(task_id),
            item_before: None,
            item_status_after: Some("todo".into()),
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
        ensure_current(pool, session_id).await?;
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
            note_before: before,
            note_after: doc,
            item_id: Some(task_id.to_string()),
            item_before,
            item_status_after: tracked.then(|| "done".into()),
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
        ensure_current(pool, session_id).await?;
        let index = log
            .iter()
            .rposition(|entry| entry.edit.session_id == session_id)
            .ok_or(EditError::NothingToUndo)?;
        if edit_id.is_some_and(|id| id != log[index].edit.id) {
            return Err(EditError::NotLatest);
        }
        let entry = &log[index];
        let mut tx = pool.begin().await?;
        let current = read_note(&mut tx, session_id).await?;
        if parse_doc(current.as_ref()).ok().as_ref() != Some(&entry.note_after) {
            return Err(EditError::ChangedSince);
        }
        if let Some(item_id) = &entry.item_id {
            let item = read_item(&mut tx, session_id, item_id).await?;
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
            match (&entry.item_before, entry.edit.kind) {
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
        tx.commit().await?;
        Ok(log.remove(index).edit)
    }
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
