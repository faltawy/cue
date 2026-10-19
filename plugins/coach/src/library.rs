use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::{Row, SqliteConnection, SqlitePool};

use crate::edits::{
    Change, CoachEdit, EditError, EditKind, EditResult, Edits, UndoEntry, ensure_current, new_edit,
    now, preview,
};

const MANUAL_SOURCE: &str = "manual";
const MAX_FOLDER_PATH: usize = 200;
const MAX_FOLDER_SEGMENT: usize = 80;
const SESSION_CHILD_TABLES: &[&str] = &[
    "session_documents",
    "transcripts",
    "session_participants",
    "session_tags",
    "action_items",
    "session_attachments",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LibraryChange {
    pub edit: Option<CoachEdit>,
    pub id: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct NewNote {
    pub title: String,
    pub folder: Option<String>,
    pub content_markdown: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct NoteChanges {
    pub title: Option<String>,
    pub folder: Option<String>,
    #[serde(default)]
    pub add_tags: Vec<String>,
    #[serde(default)]
    pub remove_tags: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct PersonFields {
    pub name: Option<String>,
    pub email: Option<String>,
    pub job_title: Option<String>,
    pub phone: Option<String>,
    pub memo: Option<String>,
    pub organization: Option<String>,
    #[serde(default)]
    pub create_organization: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct OrganizationFields {
    pub name: Option<String>,
    pub memo: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TemplateSection {
    pub title: String,
    pub description: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct TemplateFields {
    pub title: Option<String>,
    pub description: Option<String>,
    pub sections: Option<Vec<TemplateSection>>,
}

pub(crate) struct Table {
    name: &'static str,
    columns: &'static [&'static str],
    soft_delete: bool,
}

const HUMANS: Table = Table {
    name: "humans",
    columns: &[
        "name",
        "email",
        "phone",
        "job_title",
        "linkedin_username",
        "memo",
        "organization_id",
        "metadata_json",
        "updated_at",
    ],
    soft_delete: true,
};

const ORGANIZATIONS: Table = Table {
    name: "organizations",
    columns: &["name", "memo", "metadata_json", "updated_at"],
    soft_delete: true,
};

const TEMPLATES: Table = Table {
    name: "templates",
    columns: &["title", "description", "sections_json", "updated_at"],
    soft_delete: false,
};

const PARTICIPANTS: Table = Table {
    name: "session_participants",
    columns: &["source", "updated_at"],
    soft_delete: true,
};

const SESSIONS: Table = Table {
    name: "sessions",
    columns: &["title", "folder_path", "updated_at"],
    soft_delete: true,
};

const SESSION_TAGS: Table = Table {
    name: "session_tags",
    columns: &["owner_user_id", "updated_at", "deleted_at"],
    soft_delete: false,
};

const TAGS: Table = Table {
    name: "tags",
    columns: &["owner_user_id", "name", "updated_at", "deleted_at"],
    soft_delete: false,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Created {
    Person,
    Organization,
    Template,
    Participant,
}

impl Created {
    fn table(self) -> &'static Table {
        match self {
            Self::Person => &HUMANS,
            Self::Organization => &ORGANIZATIONS,
            Self::Template => &TEMPLATES,
            Self::Participant => &PARTICIPANTS,
        }
    }
}

pub(crate) enum Undo {
    CreateNote {
        note_id: String,
        label: String,
        fingerprint: String,
    },
    Created {
        kind: Created,
        id: String,
        label: String,
        after: Value,
    },
    Updated {
        table: &'static Table,
        id: String,
        label: String,
        before: Value,
        after: Value,
    },
    Rows {
        table: &'static Table,
        rows: Vec<RowUndo>,
        label: String,
    },
    CreateFolder {
        folders: Vec<FolderUndo>,
    },
    Many(Vec<Undo>),
}

pub(crate) struct RowUndo {
    id: String,
    before: Option<Value>,
    after: Value,
}

pub(crate) struct FolderUndo {
    id: String,
    path: String,
    revived_from: Option<String>,
}

pub fn normalize_folder_path(path: &str) -> Option<String> {
    let replaced = path.replace('\\', "/");
    let replaced = replaced.trim();
    if replaced.is_empty() {
        return Some(String::new());
    }
    if replaced.starts_with('/') {
        return None;
    }
    let mut segments = Vec::new();
    for raw in replaced.trim_end_matches('/').split('/') {
        if raw.is_empty() || raw == "." || raw == ".." || raw.chars().count() > MAX_FOLDER_SEGMENT {
            return None;
        }
        segments.push(raw);
    }
    let joined = segments.join("/");
    (joined.chars().count() <= MAX_FOLDER_PATH).then_some(joined)
}

fn ancestors(path: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut acc = String::new();
    for segment in path.split('/') {
        if !acc.is_empty() {
            acc.push('/');
        }
        acc.push_str(segment);
        out.push(acc.clone());
    }
    out
}

fn clean(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn normalized_name(name: &str) -> String {
    name.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn quoted(text: &str) -> String {
    format!("“{}”", preview(text))
}

async fn snapshot(
    conn: &mut SqliteConnection,
    table: &Table,
    id: &str,
) -> EditResult<Option<Value>> {
    let fields = table
        .columns
        .iter()
        .map(|column| format!("'{column}', {column}"))
        .collect::<Vec<_>>()
        .join(", ");
    let alive = if table.soft_delete {
        " AND deleted_at IS NULL"
    } else {
        ""
    };
    let sql = format!(
        "SELECT json_object({fields}) FROM {} WHERE id = ?{alive}",
        table.name
    );
    let row: Option<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
    Ok(row.map(|row| serde_json::from_str(&row)).transpose()?)
}

async fn restore(
    conn: &mut SqliteConnection,
    table: &Table,
    id: &str,
    row: &Value,
) -> EditResult<()> {
    let assignments = table
        .columns
        .iter()
        .map(|column| format!("{column} = ?"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!("UPDATE {} SET {assignments} WHERE id = ?", table.name);
    let mut query = sqlx::query(sqlx::AssertSqlSafe(sql));
    for column in table.columns {
        query = match row.get(*column) {
            Some(Value::String(text)) => query.bind(text.clone()),
            Some(Value::Number(number)) => query.bind(number.as_i64()),
            _ => query.bind(Option::<String>::None),
        };
    }
    query.bind(id).execute(&mut *conn).await?;
    Ok(())
}

async fn folder_exists(conn: &mut SqliteConnection, path: &str) -> EditResult<bool> {
    let under = format!("{path}/%");
    let found: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM (
           SELECT path AS folder_path FROM folders
           WHERE deleted_at IS NULL AND (path = ? OR path LIKE ?)
           UNION ALL
           SELECT folder_path FROM folder_attachments
           WHERE deleted_at IS NULL AND (folder_path = ? OR folder_path LIKE ?)
           UNION ALL
           SELECT folder_path FROM sessions
           WHERE deleted_at IS NULL AND (folder_path = ? OR folder_path LIKE ?)
         ) LIMIT 1",
    )
    .bind(path)
    .bind(&under)
    .bind(path)
    .bind(&under)
    .bind(path)
    .bind(&under)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(found.is_some())
}

async fn catalog_folder_id(conn: &mut SqliteConnection, path: &str) -> EditResult<Option<String>> {
    Ok(sqlx::query_scalar(
        "SELECT id FROM folders WHERE path = ? AND deleted_at IS NULL
         ORDER BY updated_at DESC, id LIMIT 1",
    )
    .bind(path)
    .fetch_optional(&mut *conn)
    .await?)
}

async fn resolve_folder(conn: &mut SqliteConnection, input: &str) -> EditResult<String> {
    let input = input.trim();
    if input.is_empty() {
        return Ok(String::new());
    }
    let by_id: Option<String> =
        sqlx::query_scalar("SELECT path FROM folders WHERE id = ? AND deleted_at IS NULL")
            .bind(input)
            .fetch_optional(&mut *conn)
            .await?;
    if let Some(path) = by_id {
        return Ok(path);
    }
    let path = normalize_folder_path(input).ok_or_else(|| {
        EditError::Invalid(format!("{} is not a valid folder path", quoted(input)))
    })?;
    if !folder_exists(conn, &path).await? {
        return Err(EditError::Invalid(format!(
            "there is no folder {}; create it first",
            quoted(&path)
        )));
    }
    Ok(path)
}

async fn open_note(conn: &mut SqliteConnection, note_id: &str) -> EditResult<Value> {
    let row = sqlx::query("SELECT locked FROM sessions WHERE id = ? AND deleted_at IS NULL")
        .bind(note_id)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or_else(|| EditError::Unknown("note", note_id.to_string()))?;
    if row.try_get::<i64, _>("locked")? != 0 {
        return Err(EditError::Locked);
    }
    snapshot(conn, &SESSIONS, note_id)
        .await?
        .ok_or_else(|| EditError::Unknown("note", note_id.to_string()))
}

fn text_of(row: &Value, column: &str) -> String {
    row.get(column)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

async fn note_fingerprint(
    conn: &mut SqliteConnection,
    note_id: &str,
) -> EditResult<Option<String>> {
    Ok(sqlx::query_scalar(
        "SELECT json_array(
           s.title, s.folder_path, s.updated_at, s.locked, s.event_json,
           (SELECT json_group_array(json_array(d.id, d.kind, d.body, d.updated_at))
            FROM session_documents d WHERE d.session_id = s.id AND d.deleted_at IS NULL),
           (SELECT json_group_array(json_array(p.id, p.human_id, p.source, p.updated_at))
            FROM session_participants p WHERE p.session_id = s.id AND p.deleted_at IS NULL),
           (SELECT count(*) FROM transcripts WHERE session_id = s.id AND deleted_at IS NULL),
           (SELECT count(*) FROM session_tags WHERE session_id = s.id AND deleted_at IS NULL),
           (SELECT count(*) FROM action_items WHERE session_id = s.id AND deleted_at IS NULL),
           (SELECT count(*) FROM session_attachments WHERE session_id = s.id AND deleted_at IS NULL)
         )
         FROM sessions s WHERE s.id = ? AND s.deleted_at IS NULL",
    )
    .bind(note_id)
    .fetch_optional(&mut *conn)
    .await?)
}

async fn owner_of(conn: &mut SqliteConnection, session_id: &str) -> EditResult<String> {
    sqlx::query_scalar("SELECT owner_user_id FROM sessions WHERE id = ? AND deleted_at IS NULL")
        .bind(session_id)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or(EditError::NoMeeting)
}

struct Named {
    id: String,
    name: String,
    email: String,
}

async fn named_rows(conn: &mut SqliteConnection, table: &Table) -> EditResult<Vec<Named>> {
    let email = if table.columns.contains(&"email") {
        "email"
    } else {
        "''"
    };
    let sql = format!(
        "SELECT id, name, {email} AS email FROM {} WHERE deleted_at IS NULL ORDER BY created_at, id",
        table.name
    );
    sqlx::query(sqlx::AssertSqlSafe(sql))
        .fetch_all(&mut *conn)
        .await?
        .into_iter()
        .map(|row| {
            Ok(Named {
                id: row.try_get("id")?,
                name: row.try_get("name")?,
                email: row.try_get("email")?,
            })
        })
        .collect()
}

async fn find_organization(conn: &mut SqliteConnection, name: &str) -> EditResult<Option<String>> {
    let wanted = normalized_name(name);
    Ok(named_rows(conn, &ORGANIZATIONS)
        .await?
        .into_iter()
        .find(|row| normalized_name(&row.name) == wanted)
        .map(|row| row.id))
}

async fn create_organization_row(
    conn: &mut SqliteConnection,
    owner: &str,
    name: &str,
    memo: Option<&str>,
    now: &str,
) -> EditResult<(String, Undo)> {
    let id = uuid::Uuid::new_v4().to_string();
    anlg_db_app::create_organization(conn, &id, owner, name, now).await?;
    if let Some(memo) = memo {
        anlg_db_app::update_contact_fields(
            conn,
            "organizations",
            &[("memo = ?", memo.to_string())],
            now,
            &id,
        )
        .await?;
    }
    let after = snapshot(conn, &ORGANIZATIONS, &id)
        .await?
        .ok_or_else(|| EditError::Unknown("organization", id.clone()))?;
    Ok((
        id.clone(),
        Undo::Created {
            kind: Created::Organization,
            id,
            label: name.to_string(),
            after,
        },
    ))
}

async fn organization_for(
    conn: &mut SqliteConnection,
    owner: &str,
    name: &str,
    create: bool,
    now: &str,
) -> EditResult<(String, Option<Undo>)> {
    if let Some(id) = find_organization(conn, name).await? {
        return Ok((id, None));
    }
    if !create {
        return Err(EditError::Invalid(format!(
            "there is no organization named {}; ask the user before creating it, then pass create_organization: true",
            quoted(name)
        )));
    }
    let (id, undo) = create_organization_row(conn, owner, name, None, now).await?;
    Ok((id, Some(undo)))
}

async fn find_person(
    conn: &mut SqliteConnection,
    name: &str,
    email: Option<&str>,
) -> EditResult<Option<Named>> {
    let rows = named_rows(conn, &HUMANS).await?;
    let email = email.map(|email| email.trim().to_lowercase());
    let wanted = normalized_name(name);
    let by_email = email.as_deref().and_then(|email| {
        rows.iter()
            .position(|row| row.email.trim().to_lowercase() == email)
    });
    let index = by_email.or_else(|| {
        rows.iter()
            .position(|row| normalized_name(&row.name) == wanted)
    });
    Ok(index.and_then(|index| rows.into_iter().nth(index)))
}

fn person_label(name: &str, email: &str) -> String {
    if email.trim().is_empty() {
        name.trim().to_string()
    } else {
        format!("{} ({})", name.trim(), email.trim())
    }
}

fn person_assignments(fields: &PersonFields) -> Vec<(&'static str, String, &'static str)> {
    [
        ("name = ?", fields.name.as_deref(), "name"),
        ("email = ?", fields.email.as_deref(), "email"),
        ("job_title = ?", fields.job_title.as_deref(), "title"),
        ("phone = ?", fields.phone.as_deref(), "phone"),
        ("memo = ?", fields.memo.as_deref(), "memo"),
    ]
    .into_iter()
    .filter_map(|(column, value, label)| {
        value.map(|value| (column, value.trim().to_string(), label))
    })
    .collect()
}

async fn drop_primary_from_additional_emails(
    conn: &mut SqliteConnection,
    human_id: &str,
    email: &str,
    now: &str,
) -> EditResult<()> {
    let metadata: Option<String> =
        sqlx::query_scalar("SELECT metadata_json FROM humans WHERE id = ? AND deleted_at IS NULL")
            .bind(human_id)
            .fetch_optional(&mut *conn)
            .await?;
    let stored =
        anlg_db_app::human_additional_emails_from_metadata(metadata.as_deref().unwrap_or("{}"));
    let normalized = anlg_db_app::normalize_additional_emails(email, stored.iter().cloned());
    if normalized == stored {
        return Ok(());
    }
    let json = if normalized.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&normalized)?)
    };
    anlg_db_app::update_human_additional_emails(conn, json.as_deref(), now, human_id).await?;
    Ok(())
}

async fn in_use(conn: &mut SqliteConnection, kind: Created, id: &str) -> EditResult<bool> {
    let sql = match kind {
        Created::Person => {
            "SELECT 1 FROM session_participants WHERE human_id = ?1 AND deleted_at IS NULL
             UNION ALL
             SELECT 1 FROM action_items WHERE assignee_human_id = ?1 AND deleted_at IS NULL
             LIMIT 1"
        }
        Created::Organization => {
            "SELECT 1 FROM humans WHERE organization_id = ?1 AND deleted_at IS NULL LIMIT 1"
        }
        Created::Template | Created::Participant => return Ok(false),
    };
    let found: Option<i64> = sqlx::query_scalar(sql)
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
    Ok(found.is_some())
}

async fn remove_created(
    conn: &mut SqliteConnection,
    kind: Created,
    id: &str,
    now: &str,
) -> EditResult<()> {
    match kind {
        Created::Person => {
            anlg_db_app::soft_delete_contact(conn, "humans", id, now).await?;
        }
        Created::Organization => {
            anlg_db_app::soft_delete_contact(conn, "organizations", id, now).await?;
        }
        Created::Template => {
            sqlx::query("DELETE FROM templates WHERE id = ?")
                .bind(id)
                .execute(&mut *conn)
                .await?;
        }
        Created::Participant => {
            anlg_db_app::remove_session_participant_mapping(conn, id, now).await?;
        }
    }
    Ok(())
}

fn kept_created(kind: Created, label: &str) -> EditError {
    let what = match kind {
        Created::Person => "contact",
        Created::Organization => "organization",
        Created::Template => "template",
        Created::Participant => "participant",
    };
    EditError::Kept(format!(
        "{} changed or is in use since the coach added this {what}, so undo leaves it in place",
        quoted(label)
    ))
}

fn kept_updated(label: &str) -> EditError {
    EditError::Kept(format!(
        "{} changed after the coach's edit; change it back in the app",
        quoted(label)
    ))
}

pub(crate) async fn undo(conn: &mut SqliteConnection, change: &Undo) -> EditResult<()> {
    Box::pin(undo_change(conn, change)).await
}

async fn undo_change(conn: &mut SqliteConnection, change: &Undo) -> EditResult<()> {
    let now = now(conn).await?;
    match change {
        Undo::CreateNote {
            note_id,
            label,
            fingerprint,
        } => {
            let Some(current) = note_fingerprint(conn, note_id).await? else {
                return Ok(());
            };
            if &current != fingerprint {
                return Err(EditError::Kept(format!(
                    "{} was changed after the coach created it, so undo leaves it in place; delete it in the app if you don't need it",
                    quoted(label)
                )));
            }
            for table in SESSION_CHILD_TABLES {
                anlg_db_app::update_session_child_tombstone(conn, table, note_id, &now, false)
                    .await?;
            }
            anlg_db_app::update_entity_mentions_tombstone(conn, note_id, &now, false).await?;
            anlg_db_app::update_sessions_tombstone(conn, note_id, &now, false).await?;
        }
        Undo::Created {
            kind,
            id,
            label,
            after,
        } => {
            let current = snapshot(conn, kind.table(), id).await?;
            let Some(current) = current else {
                return Ok(());
            };
            if &current != after || in_use(conn, *kind, id).await? {
                return Err(kept_created(*kind, label));
            }
            remove_created(conn, *kind, id, &now).await?;
        }
        Undo::Updated {
            table,
            id,
            label,
            before,
            after,
        } => {
            if snapshot(conn, table, id).await?.as_ref() != Some(after) {
                return Err(kept_updated(label));
            }
            restore(conn, table, id, before).await?;
        }
        Undo::Rows { table, rows, label } => {
            for row in rows {
                if snapshot(conn, table, &row.id).await?.as_ref() != Some(&row.after) {
                    return Err(kept_updated(label));
                }
            }
            for row in rows {
                match &row.before {
                    Some(before) => restore(conn, table, &row.id, before).await?,
                    None => {
                        let mut gone = row.after.clone();
                        if let Some(object) = gone.as_object_mut() {
                            object.insert("deleted_at".into(), Value::String(now.clone()));
                            object.insert("updated_at".into(), Value::String(now.clone()));
                        }
                        restore(conn, table, &row.id, &gone).await?;
                    }
                }
            }
        }
        Undo::CreateFolder { folders } => {
            for folder in folders.iter().rev() {
                let row = sqlx::query("SELECT path, deleted_at FROM folders WHERE id = ?")
                    .bind(&folder.id)
                    .fetch_optional(&mut *conn)
                    .await?;
                let Some(row) = row else { continue };
                if row.try_get::<Option<String>, _>("deleted_at")?.is_some() {
                    continue;
                }
                let path: String = row.try_get("path")?;
                let under = format!("{path}/%");
                let used: Option<i64> = sqlx::query_scalar(
                    "SELECT 1 FROM sessions
                     WHERE deleted_at IS NULL AND (folder_path = ? OR folder_path LIKE ?)
                     UNION ALL
                     SELECT 1 FROM folder_attachments
                     WHERE deleted_at IS NULL AND (folder_path = ? OR folder_path LIKE ?)
                     UNION ALL
                     SELECT 1 FROM folders
                     WHERE deleted_at IS NULL AND path LIKE ?
                     LIMIT 1",
                )
                .bind(&path)
                .bind(&under)
                .bind(&path)
                .bind(&under)
                .bind(&under)
                .fetch_optional(&mut *conn)
                .await?;
                if path != folder.path || used.is_some() {
                    return Err(EditError::Kept(format!(
                        "the folder {} is no longer empty or was renamed, so undo leaves it in place",
                        quoted(&folder.path)
                    )));
                }
                sqlx::query("UPDATE folders SET deleted_at = ?, updated_at = ? WHERE id = ?")
                    .bind(folder.revived_from.as_deref().unwrap_or(&now))
                    .bind(&now)
                    .bind(&folder.id)
                    .execute(&mut *conn)
                    .await?;
            }
        }
        Undo::Many(changes) => {
            for change in changes.iter().rev() {
                Box::pin(undo_change(conn, change)).await?;
            }
        }
    }
    Ok(())
}

fn done(edit: CoachEdit, id: String) -> LibraryChange {
    LibraryChange {
        message: edit.summary.clone(),
        edit: Some(edit),
        id: Some(id),
    }
}

fn unchanged(id: Option<String>, message: String) -> LibraryChange {
    LibraryChange {
        edit: None,
        id,
        message,
    }
}

impl Edits {
    fn push(
        log: &mut Vec<UndoEntry>,
        session_id: &str,
        kind: EditKind,
        summary: String,
        target: &str,
        undo: Undo,
    ) -> CoachEdit {
        let mut edit = new_edit(session_id, kind, summary, None);
        edit.target_id = Some(target.to_string());
        log.push(UndoEntry {
            edit: edit.clone(),
            change: Change::Library(undo),
        });
        edit
    }

    pub async fn create_note(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        input: NewNote,
    ) -> EditResult<LibraryChange> {
        let title = clean(Some(&input.title))
            .ok_or_else(|| EditError::Invalid("a note needs a title".into()))?;
        let body = match clean(input.content_markdown.as_deref()) {
            Some(markdown) => serde_json::to_string(
                &anlg_tiptap::md_to_tiptap_json(&markdown).map_err(EditError::Invalid)?,
            )?,
            None => String::new(),
        };
        let mut log = self.log.lock().await;
        ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        let folder = resolve_folder(&mut tx, input.folder.as_deref().unwrap_or_default()).await?;
        let owner = owner_of(&mut tx, session_id).await?;
        let note_id = uuid::Uuid::new_v4().to_string();
        let now = now(&mut tx).await?;
        anlg_db_app::insert_session(&mut tx, &note_id, &title, &owner, "", &folder, &now).await?;
        anlg_db_app::insert_empty_session_note(&mut tx, &note_id, &body, &now).await?;
        anlg_db_app::upsert_session_owner_human(&mut tx, &note_id, &now).await?;
        anlg_db_app::insert_owner_session_participant(
            &mut tx,
            &uuid::Uuid::new_v4().to_string(),
            &note_id,
            &now,
        )
        .await?;
        let fingerprint = note_fingerprint(&mut tx, &note_id)
            .await?
            .ok_or_else(|| EditError::Unknown("note", note_id.clone()))?;
        tx.commit().await?;
        let summary = if folder.is_empty() {
            format!("Created note {}", quoted(&title))
        } else {
            format!("Created note {} in {folder}", quoted(&title))
        };
        let edit = Self::push(
            &mut log,
            session_id,
            EditKind::CreateNote,
            summary,
            &note_id,
            Undo::CreateNote {
                note_id: note_id.clone(),
                label: title,
                fingerprint,
            },
        );
        Ok(done(edit, note_id))
    }

    pub async fn update_note(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        note_id: &str,
        changes: NoteChanges,
    ) -> EditResult<LibraryChange> {
        let mut log = self.log.lock().await;
        ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        let before = open_note(&mut tx, note_id).await?;
        let old_title = text_of(&before, "title");
        let old_folder = text_of(&before, "folder_path");
        let label = if old_title.trim().is_empty() {
            "Untitled".to_string()
        } else {
            old_title.clone()
        };
        let mut parts = Vec::new();
        let mut title = old_title.clone();
        if let Some(next) = changes.title.as_deref() {
            let next = clean(Some(next))
                .ok_or_else(|| EditError::Invalid("a title can't be empty".into()))?;
            if next != old_title {
                parts.push(format!("Renamed {} to {}", quoted(&label), quoted(&next)));
                title = next;
            }
        }
        let mut folder = old_folder.clone();
        if let Some(next) = changes.folder.as_deref() {
            let next = resolve_folder(&mut tx, next).await?;
            if next != old_folder {
                let name = quoted(&title);
                parts.push(if next.is_empty() {
                    format!("Moved {name} out of {old_folder}")
                } else {
                    format!("Moved {name} to {next}")
                });
                folder = next;
            }
        }

        let alive = sqlx::query(
            "SELECT st.id, st.tag_id, COALESCE(t.name, st.tag_id) AS name
             FROM session_tags st LEFT JOIN tags t ON t.id = st.tag_id
             WHERE st.session_id = ? AND st.deleted_at IS NULL",
        )
        .bind(note_id)
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(|row| -> EditResult<(String, String, String)> {
            Ok((
                row.try_get("id")?,
                row.try_get("tag_id")?,
                row.try_get("name")?,
            ))
        })
        .collect::<EditResult<Vec<_>>>()?;
        let matches = |tag: &str, (_, id, name): &(String, String, String)| {
            id.eq_ignore_ascii_case(tag) || name.eq_ignore_ascii_case(tag)
        };
        let mut removed = Vec::new();
        for tag in changes
            .remove_tags
            .iter()
            .filter_map(|tag| clean(Some(tag)))
        {
            let found = alive
                .iter()
                .find(|link| matches(&tag, link))
                .ok_or_else(|| {
                    EditError::Invalid(format!("{} is not a tag on this note", quoted(&tag)))
                })?;
            if !removed
                .iter()
                .any(|(id, _): &(String, String)| id == &found.0)
            {
                removed.push((found.0.clone(), found.2.clone()));
            }
        }
        let mut added: Vec<String> = Vec::new();
        for tag in changes.add_tags.iter().filter_map(|tag| clean(Some(tag))) {
            if tag.chars().count() > 64 {
                return Err(EditError::Invalid(format!(
                    "{} is too long for a tag",
                    quoted(&tag)
                )));
            }
            let present = alive
                .iter()
                .any(|link| matches(&tag, link) && !removed.iter().any(|(id, _)| id == &link.0));
            if !present && !added.iter().any(|seen| seen.eq_ignore_ascii_case(&tag)) {
                added.push(tag);
            }
        }

        let tag_parts = added
            .iter()
            .map(|tag| format!("+{tag}"))
            .chain(removed.iter().map(|(_, tag)| format!("−{tag}")))
            .collect::<Vec<_>>();
        if !tag_parts.is_empty() {
            parts.push(format!(
                "Tags on {}: {}",
                quoted(&title),
                tag_parts.join(" ")
            ));
        }
        if parts.is_empty() {
            return Ok(unchanged(
                Some(note_id.to_string()),
                format!("Nothing to change on {}", quoted(&label)),
            ));
        }

        let now = now(&mut tx).await?;
        let mut undos = Vec::new();
        if title != old_title || folder != old_folder {
            sqlx::query(
                "UPDATE sessions SET title = ?, folder_path = ?, updated_at = ? WHERE id = ?",
            )
            .bind(&title)
            .bind(&folder)
            .bind(&now)
            .bind(note_id)
            .execute(&mut *tx)
            .await?;
            let after = snapshot(&mut tx, &SESSIONS, note_id)
                .await?
                .ok_or_else(|| EditError::Unknown("note", note_id.to_string()))?;
            undos.push(Undo::Updated {
                table: &SESSIONS,
                id: note_id.to_string(),
                label: title.clone(),
                before,
                after,
            });
        }

        let owner = owner_of(&mut tx, note_id).await?;
        let mut links = Vec::new();
        let mut tags = Vec::new();
        for tag in &added {
            let link_id = format!("{note_id}:{tag}");
            let link_before = snapshot(&mut tx, &SESSION_TAGS, &link_id).await?;
            let tag_before = snapshot(&mut tx, &TAGS, tag).await?;
            anlg_db_app::upsert_tag(&mut tx, &owner, tag, &now).await?;
            anlg_db_app::upsert_session_tag(&mut tx, note_id, &owner, tag, &now).await?;
            if tag_before
                .as_ref()
                .is_none_or(|row| !row["deleted_at"].is_null())
            {
                let after = snapshot(&mut tx, &TAGS, tag).await?.unwrap_or(Value::Null);
                tags.push(RowUndo {
                    id: tag.clone(),
                    before: tag_before,
                    after,
                });
            }
            let after = snapshot(&mut tx, &SESSION_TAGS, &link_id)
                .await?
                .unwrap_or(Value::Null);
            links.push(RowUndo {
                id: link_id,
                before: link_before,
                after,
            });
        }
        for (link_id, _) in &removed {
            let link_before = snapshot(&mut tx, &SESSION_TAGS, link_id).await?;
            sqlx::query("UPDATE session_tags SET deleted_at = ?, updated_at = ? WHERE id = ?")
                .bind(&now)
                .bind(&now)
                .bind(link_id)
                .execute(&mut *tx)
                .await?;
            let after = snapshot(&mut tx, &SESSION_TAGS, link_id)
                .await?
                .unwrap_or(Value::Null);
            links.push(RowUndo {
                id: link_id.clone(),
                before: link_before,
                after,
            });
        }
        if !links.is_empty() {
            undos.push(Undo::Rows {
                table: &SESSION_TAGS,
                rows: links,
                label: title.clone(),
            });
        }
        if !tags.is_empty() {
            undos.push(Undo::Rows {
                table: &TAGS,
                rows: tags,
                label: title.clone(),
            });
        }
        tx.commit().await?;
        let edit = Self::push(
            &mut log,
            session_id,
            EditKind::UpdateNote,
            parts.join("; "),
            note_id,
            Undo::Many(undos),
        );
        Ok(done(edit, note_id.to_string()))
    }

    pub async fn create_folder(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        path: &str,
    ) -> EditResult<LibraryChange> {
        let path = normalize_folder_path(path)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| {
                EditError::Invalid(format!("{} is not a valid folder path", quoted(path)))
            })?;
        let mut log = self.log.lock().await;
        ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        let mut folders = Vec::new();
        for ancestor in ancestors(&path) {
            if folder_exists(&mut tx, &ancestor).await? {
                continue;
            }
            let revived_from: Option<String> = sqlx::query_scalar(
                "SELECT deleted_at FROM folders WHERE path = ?
                 ORDER BY deleted_at IS NULL DESC, updated_at DESC, id LIMIT 1",
            )
            .bind(&ancestor)
            .fetch_optional(&mut *tx)
            .await?
            .flatten();
            anlg_db_app::revive_folder(&mut tx, &ancestor).await?;
            anlg_db_app::insert_folder_if_missing(
                &mut tx,
                &uuid::Uuid::new_v4().to_string(),
                &ancestor,
            )
            .await?;
            let id = catalog_folder_id(&mut tx, &ancestor)
                .await?
                .ok_or_else(|| EditError::Unknown("folder", ancestor.clone()))?;
            folders.push(FolderUndo {
                id,
                path: ancestor,
                revived_from,
            });
        }
        let id = catalog_folder_id(&mut tx, &path).await?;
        if folders.is_empty() {
            return Ok(unchanged(id, format!("The folder {path} already exists")));
        }
        tx.commit().await?;
        let id = id.ok_or_else(|| EditError::Unknown("folder", path.clone()))?;
        let edit = Self::push(
            &mut log,
            session_id,
            EditKind::CreateFolder,
            format!("Created folder {path}"),
            &id,
            Undo::CreateFolder { folders },
        );
        Ok(done(edit, id))
    }

    pub async fn create_person(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        fields: PersonFields,
    ) -> EditResult<LibraryChange> {
        let name = clean(fields.name.as_deref())
            .ok_or_else(|| EditError::Invalid("a contact needs a name".into()))?;
        let email = clean(fields.email.as_deref());
        let mut log = self.log.lock().await;
        ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        if let Some(existing) = find_person(&mut tx, &name, email.as_deref()).await? {
            return Ok(unchanged(
                Some(existing.id),
                format!(
                    "Already in contacts: {}; nothing was created",
                    person_label(&existing.name, &existing.email)
                ),
            ));
        }
        let owner = owner_of(&mut tx, session_id).await?;
        let now = now(&mut tx).await?;
        let mut undos = Vec::new();
        let id = uuid::Uuid::new_v4().to_string();
        let mut assignments: Vec<(&'static str, String)> = Vec::new();
        if let Some(organization) = clean(fields.organization.as_deref()) {
            let (organization_id, created) = organization_for(
                &mut tx,
                &owner,
                &organization,
                fields.create_organization,
                &now,
            )
            .await?;
            undos.extend(created);
            assignments.push(("organization_id = ?", organization_id));
        }
        anlg_db_app::create_human(
            &mut tx,
            &id,
            &owner,
            &name,
            email.as_deref().unwrap_or_default(),
            &now,
        )
        .await?;
        assignments.extend(
            person_assignments(&PersonFields {
                name: None,
                email: None,
                ..fields
            })
            .into_iter()
            .filter(|(_, value, _)| !value.is_empty())
            .map(|(column, value, _)| (column, value)),
        );
        if !assignments.is_empty() {
            anlg_db_app::update_contact_fields(&mut tx, "humans", &assignments, &now, &id).await?;
        }
        let after = snapshot(&mut tx, &HUMANS, &id)
            .await?
            .ok_or_else(|| EditError::Unknown("person", id.clone()))?;
        let label = person_label(&name, email.as_deref().unwrap_or_default());
        undos.push(Undo::Created {
            kind: Created::Person,
            id: id.clone(),
            label: label.clone(),
            after,
        });
        tx.commit().await?;
        let edit = Self::push(
            &mut log,
            session_id,
            EditKind::CreatePerson,
            format!("Created contact {label}"),
            &id,
            Undo::Many(undos),
        );
        Ok(done(edit, id))
    }

    pub async fn update_person(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        person_id: &str,
        fields: PersonFields,
    ) -> EditResult<LibraryChange> {
        let mut log = self.log.lock().await;
        ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        let before = snapshot(&mut tx, &HUMANS, person_id)
            .await?
            .ok_or_else(|| EditError::Unknown("person", person_id.to_string()))?;
        if fields
            .name
            .as_deref()
            .is_some_and(|name| name.trim().is_empty())
        {
            return Err(EditError::Invalid("a contact's name can't be empty".into()));
        }
        let mut changed: Vec<(&'static str, String, &'static str)> = person_assignments(&fields)
            .into_iter()
            .filter(|(column, value, _)| {
                text_of(&before, column.trim_end_matches(" = ?")) != *value
            })
            .collect();
        let owner = owner_of(&mut tx, session_id).await?;
        let now = now(&mut tx).await?;
        let mut undos = Vec::new();
        if let Some(organization) = fields.organization.as_deref() {
            let organization_id = match clean(Some(organization)) {
                Some(name) => {
                    let (id, created) =
                        organization_for(&mut tx, &owner, &name, fields.create_organization, &now)
                            .await?;
                    undos.extend(created);
                    id
                }
                None => String::new(),
            };
            if text_of(&before, "organization_id") != organization_id {
                changed.push(("organization_id = ?", organization_id, "organization"));
            }
        }
        let label = text_of(&before, "name");
        if changed.is_empty() {
            return Ok(unchanged(
                Some(person_id.to_string()),
                format!("Nothing to change on {}", quoted(&label)),
            ));
        }
        let assignments: Vec<(&'static str, String)> = changed
            .iter()
            .map(|(column, value, _)| (*column, value.clone()))
            .collect();
        anlg_db_app::update_contact_fields(&mut tx, "humans", &assignments, &now, person_id)
            .await?;
        if let Some((_, email, _)) = changed.iter().find(|(column, _, _)| *column == "email = ?") {
            drop_primary_from_additional_emails(&mut tx, person_id, email, &now).await?;
        }
        let after = snapshot(&mut tx, &HUMANS, person_id)
            .await?
            .ok_or_else(|| EditError::Unknown("person", person_id.to_string()))?;
        let name = text_of(&after, "name");
        undos.push(Undo::Updated {
            table: &HUMANS,
            id: person_id.to_string(),
            label: name.clone(),
            before,
            after,
        });
        tx.commit().await?;
        let fields = changed
            .iter()
            .map(|(_, _, field)| *field)
            .collect::<Vec<_>>()
            .join(", ");
        let edit = Self::push(
            &mut log,
            session_id,
            EditKind::UpdatePerson,
            format!("Updated {}: {fields}", preview(&name)),
            person_id,
            Undo::Many(undos),
        );
        Ok(done(edit, person_id.to_string()))
    }

    pub async fn create_organization(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        fields: OrganizationFields,
    ) -> EditResult<LibraryChange> {
        let name = clean(fields.name.as_deref())
            .ok_or_else(|| EditError::Invalid("an organization needs a name".into()))?;
        let mut log = self.log.lock().await;
        ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        if let Some(id) = find_organization(&mut tx, &name).await? {
            return Ok(unchanged(
                Some(id),
                format!("Already in contacts: {name}; nothing was created"),
            ));
        }
        let owner = owner_of(&mut tx, session_id).await?;
        let now = now(&mut tx).await?;
        let memo = clean(fields.memo.as_deref());
        let (id, undo) =
            create_organization_row(&mut tx, &owner, &name, memo.as_deref(), &now).await?;
        tx.commit().await?;
        let edit = Self::push(
            &mut log,
            session_id,
            EditKind::CreateOrganization,
            format!("Created organization {}", preview(&name)),
            &id,
            undo,
        );
        Ok(done(edit, id))
    }

    pub async fn update_organization(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        organization_id: &str,
        fields: OrganizationFields,
    ) -> EditResult<LibraryChange> {
        let mut log = self.log.lock().await;
        ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        let before = snapshot(&mut tx, &ORGANIZATIONS, organization_id)
            .await?
            .ok_or_else(|| EditError::Unknown("organization", organization_id.to_string()))?;
        if fields
            .name
            .as_deref()
            .is_some_and(|name| name.trim().is_empty())
        {
            return Err(EditError::Invalid(
                "an organization's name can't be empty".into(),
            ));
        }
        let changed: Vec<(&'static str, String, &'static str)> = [
            ("name = ?", fields.name.as_deref(), "name"),
            ("memo = ?", fields.memo.as_deref(), "memo"),
        ]
        .into_iter()
        .filter_map(|(column, value, field)| {
            value.map(|value| (column, value.trim().to_string(), field))
        })
        .filter(|(column, value, _)| text_of(&before, column.trim_end_matches(" = ?")) != *value)
        .collect();
        let label = text_of(&before, "name");
        if changed.is_empty() {
            return Ok(unchanged(
                Some(organization_id.to_string()),
                format!("Nothing to change on {}", quoted(&label)),
            ));
        }
        let now = now(&mut tx).await?;
        let assignments: Vec<(&'static str, String)> = changed
            .iter()
            .map(|(column, value, _)| (*column, value.clone()))
            .collect();
        anlg_db_app::update_contact_fields(
            &mut tx,
            "organizations",
            &assignments,
            &now,
            organization_id,
        )
        .await?;
        let after = snapshot(&mut tx, &ORGANIZATIONS, organization_id)
            .await?
            .ok_or_else(|| EditError::Unknown("organization", organization_id.to_string()))?;
        let name = text_of(&after, "name");
        tx.commit().await?;
        let fields = changed
            .iter()
            .map(|(_, _, field)| *field)
            .collect::<Vec<_>>()
            .join(", ");
        let edit = Self::push(
            &mut log,
            session_id,
            EditKind::UpdateOrganization,
            format!("Updated {}: {fields}", preview(&name)),
            organization_id,
            Undo::Updated {
                table: &ORGANIZATIONS,
                id: organization_id.to_string(),
                label: name,
                before,
                after,
            },
        );
        Ok(done(edit, organization_id.to_string()))
    }

    pub async fn add_participant(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        note_id: Option<&str>,
        person_id: &str,
    ) -> EditResult<LibraryChange> {
        let note_id = note_id
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .unwrap_or(session_id);
        let mut log = self.log.lock().await;
        ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        let note = open_note(&mut tx, note_id).await?;
        let person = snapshot(&mut tx, &HUMANS, person_id)
            .await?
            .ok_or_else(|| EditError::Unknown("person", person_id.to_string()))?;
        let label = person_label(&text_of(&person, "name"), &text_of(&person, "email"));
        let place = if note_id == session_id {
            "this meeting".to_string()
        } else {
            quoted(&text_of(&note, "title"))
        };
        let linked: Option<String> = sqlx::query_scalar(
            "SELECT id FROM session_participants
             WHERE session_id = ? AND human_id = ? AND deleted_at IS NULL AND source <> 'excluded'
             LIMIT 1",
        )
        .bind(note_id)
        .bind(person_id)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(id) = linked {
            return Ok(unchanged(
                Some(id),
                format!("{label} is already in {place}"),
            ));
        }
        let excluded: Option<String> = sqlx::query_scalar(
            "SELECT id FROM session_participants
             WHERE session_id = ? AND human_id = ? AND source = 'excluded' AND deleted_at IS NULL
             ORDER BY created_at, id LIMIT 1",
        )
        .bind(note_id)
        .bind(person_id)
        .fetch_optional(&mut *tx)
        .await?;
        let now = now(&mut tx).await?;
        let undo = match excluded {
            Some(id) => {
                let before = snapshot(&mut tx, &PARTICIPANTS, &id)
                    .await?
                    .ok_or_else(|| EditError::Unknown("participant", id.clone()))?;
                anlg_db_app::revive_excluded_session_participant(
                    &mut tx,
                    note_id,
                    person_id,
                    MANUAL_SOURCE,
                    &now,
                )
                .await?;
                let after = snapshot(&mut tx, &PARTICIPANTS, &id)
                    .await?
                    .ok_or_else(|| EditError::Unknown("participant", id.clone()))?;
                (
                    id.clone(),
                    Undo::Updated {
                        table: &PARTICIPANTS,
                        id,
                        label: label.clone(),
                        before,
                        after,
                    },
                )
            }
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                anlg_db_app::insert_manual_session_participant(
                    &mut tx,
                    &id,
                    note_id,
                    person_id,
                    MANUAL_SOURCE,
                    &now,
                )
                .await?;
                let after = snapshot(&mut tx, &PARTICIPANTS, &id)
                    .await?
                    .ok_or_else(|| EditError::Unknown("participant", id.clone()))?;
                (
                    id.clone(),
                    Undo::Created {
                        kind: Created::Participant,
                        id,
                        label: label.clone(),
                        after,
                    },
                )
            }
        };
        tx.commit().await?;
        let edit = Self::push(
            &mut log,
            session_id,
            EditKind::AddParticipant,
            format!("Added {label} to {place}"),
            &undo.0,
            undo.1,
        );
        Ok(done(edit, undo.0))
    }

    pub async fn create_template(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        fields: TemplateFields,
    ) -> EditResult<LibraryChange> {
        let title = clean(fields.title.as_deref())
            .ok_or_else(|| EditError::Invalid("a template needs a title".into()))?;
        let sections = template_sections(fields.sections.unwrap_or_default())?;
        let mut log = self.log.lock().await;
        ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO templates (id, title, description, pinned, sections_json, created_at, updated_at)
             VALUES (?, ?, ?, 0, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))",
        )
        .bind(&id)
        .bind(&title)
        .bind(fields.description.as_deref().map(str::trim).unwrap_or_default())
        .bind(&sections)
        .execute(&mut *tx)
        .await?;
        let after = snapshot(&mut tx, &TEMPLATES, &id)
            .await?
            .ok_or_else(|| EditError::Unknown("template", id.clone()))?;
        tx.commit().await?;
        let edit = Self::push(
            &mut log,
            session_id,
            EditKind::CreateTemplate,
            format!("Created template {}", quoted(&title)),
            &id,
            Undo::Created {
                kind: Created::Template,
                id: id.clone(),
                label: title,
                after,
            },
        );
        Ok(done(edit, id))
    }

    pub async fn update_template(
        &self,
        pool: &SqlitePool,
        session_id: &str,
        template_id: &str,
        fields: TemplateFields,
    ) -> EditResult<LibraryChange> {
        let mut log = self.log.lock().await;
        ensure_current(pool, session_id).await?;
        let mut tx = pool.begin().await?;
        let before = snapshot(&mut tx, &TEMPLATES, template_id)
            .await?
            .ok_or_else(|| EditError::Unknown("template", template_id.to_string()))?;
        if fields
            .title
            .as_deref()
            .is_some_and(|title| title.trim().is_empty())
        {
            return Err(EditError::Invalid(
                "a template's title can't be empty".into(),
            ));
        }
        let mut changed: Vec<(&'static str, String, &'static str)> = [
            (
                "title",
                fields.title.as_deref().map(str::trim).map(str::to_string),
                "title",
            ),
            (
                "description",
                fields
                    .description
                    .as_deref()
                    .map(str::trim)
                    .map(str::to_string),
                "description",
            ),
        ]
        .into_iter()
        .filter_map(|(column, value, field)| value.map(|value| (column, value, field)))
        .collect();
        if let Some(sections) = fields.sections {
            changed.push(("sections_json", template_sections(sections)?, "sections"));
        }
        changed.retain(|(column, value, _)| text_of(&before, column) != *value);
        let label = text_of(&before, "title");
        if changed.is_empty() {
            return Ok(unchanged(
                Some(template_id.to_string()),
                format!("Nothing to change on {}", quoted(&label)),
            ));
        }
        let mut next: Map<String, Value> = before.as_object().cloned().unwrap_or_default();
        for (column, value, _) in &changed {
            next.insert((*column).to_string(), Value::String(value.clone()));
        }
        let stamp: String = sqlx::query_scalar("SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now')")
            .fetch_one(&mut *tx)
            .await?;
        next.insert("updated_at".into(), Value::String(stamp));
        restore(&mut tx, &TEMPLATES, template_id, &Value::Object(next)).await?;
        let after = snapshot(&mut tx, &TEMPLATES, template_id)
            .await?
            .ok_or_else(|| EditError::Unknown("template", template_id.to_string()))?;
        let title = text_of(&after, "title");
        tx.commit().await?;
        let fields = changed
            .iter()
            .map(|(_, _, field)| *field)
            .collect::<Vec<_>>()
            .join(", ");
        let edit = Self::push(
            &mut log,
            session_id,
            EditKind::UpdateTemplate,
            format!("Updated template {}: {fields}", quoted(&title)),
            template_id,
            Undo::Updated {
                table: &TEMPLATES,
                id: template_id.to_string(),
                label: title,
                before,
                after,
            },
        );
        Ok(done(edit, template_id.to_string()))
    }
}

fn template_sections(sections: Vec<TemplateSection>) -> EditResult<String> {
    let sections: Vec<TemplateSection> = sections
        .into_iter()
        .map(|section| TemplateSection {
            title: section.title.trim().to_string(),
            description: section.description.trim().to_string(),
        })
        .collect();
    if sections.iter().any(|section| section.title.is_empty()) {
        return Err(EditError::Invalid(
            "every template section needs a title".into(),
        ));
    }
    Ok(serde_json::to_string(&sections)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MEETING: &str = "meeting-1";

    async fn pool() -> SqlitePool {
        let db = anlg_db_core::Db::connect_memory_plain().await.unwrap();
        anlg_db_app::prepare_schema(&db).await.unwrap();
        let pool = db.pool().clone();
        sqlx::query(
            "INSERT INTO sessions (id, workspace_id, owner_user_id, title) VALUES (?, 'ws', 'me', 'Weekly sync')",
        )
        .bind(MEETING)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO transcripts (id, session_id, started_at_ms) VALUES ('t-1', ?, 1)")
            .bind(MEETING)
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    async fn user_note(pool: &SqlitePool, id: &str, title: &str, folder: &str) {
        sqlx::query(
            "INSERT INTO sessions (id, workspace_id, owner_user_id, title, folder_path, updated_at)
             VALUES (?, 'ws', 'me', ?, ?, '2026-10-01T09:00:00.000Z')",
        )
        .bind(id)
        .bind(title)
        .bind(folder)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn user_folder(pool: &SqlitePool, id: &str, path: &str) {
        sqlx::query("INSERT INTO folders (id, path) VALUES (?, ?)")
            .bind(id)
            .bind(path)
            .execute(pool)
            .await
            .unwrap();
    }

    async fn user_person(pool: &SqlitePool, id: &str, name: &str, email: &str) {
        sqlx::query(
            "INSERT INTO humans (id, workspace_id, owner_user_id, name, email, updated_at)
             VALUES (?, 'ws', 'me', ?, ?, '2026-10-01T09:00:00.000Z')",
        )
        .bind(id)
        .bind(name)
        .bind(email)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn row(pool: &SqlitePool, table: &Table, id: &str) -> Option<Value> {
        let mut conn = pool.acquire().await.unwrap();
        snapshot(&mut conn, table, id).await.unwrap()
    }

    async fn deleted_at(pool: &SqlitePool, table: &str, id: &str) -> Option<Option<String>> {
        sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT deleted_at FROM {table} WHERE id = ?"
        )))
        .bind(id)
        .fetch_optional(pool)
        .await
        .unwrap()
    }

    async fn tags(pool: &SqlitePool, note: &str) -> Vec<String> {
        sqlx::query_scalar(
            "SELECT tag_id FROM session_tags WHERE session_id = ? AND deleted_at IS NULL ORDER BY tag_id",
        )
        .bind(note)
        .fetch_all(pool)
        .await
        .unwrap()
    }

    fn kept(result: EditResult<CoachEdit>) -> String {
        match result {
            Err(EditError::Kept(message)) => message,
            other => panic!("expected undo to be refused, got {other:?}"),
        }
    }

    #[test]
    fn folder_paths_normalize_like_the_app() {
        assert_eq!(
            normalize_folder_path(" Clients\\Lumen/ ").as_deref(),
            Some("Clients/Lumen")
        );
        assert_eq!(normalize_folder_path("").as_deref(), Some(""));
        for invalid in ["/abs", "a//b", "a/../b", "./a", &"x".repeat(81)] {
            assert_eq!(normalize_folder_path(invalid), None, "{invalid}");
        }
    }

    #[tokio::test]
    async fn a_created_note_lands_in_its_folder_and_undo_tombstones_it_while_untouched() {
        let pool = pool().await;
        user_folder(&pool, "folder-lumen", "Clients/Lumen").await;
        let edits = Edits::default();

        let created = edits
            .create_note(
                &pool,
                MEETING,
                NewNote {
                    title: "Pricing follow-up".into(),
                    folder: Some("folder-lumen".into()),
                    content_markdown: Some("- send the sheet".into()),
                },
            )
            .await
            .unwrap();

        let id = created.id.clone().unwrap();
        let edit = created.edit.unwrap();
        assert_eq!(edit.kind, EditKind::CreateNote);
        assert_eq!(
            edit.summary,
            "Created note “Pricing follow-up” in Clients/Lumen"
        );
        assert_eq!(edit.target_id.as_deref(), Some(id.as_str()));
        let session = row(&pool, &SESSIONS, &id).await.unwrap();
        assert_eq!(session["title"], "Pricing follow-up");
        assert_eq!(session["folder_path"], "Clients/Lumen");
        let body: String = sqlx::query_scalar("SELECT body FROM session_documents WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(body.contains("send the sheet"), "{body}");

        let undone = edits
            .undo_last(&pool, MEETING, Some(&edit.id))
            .await
            .unwrap();

        assert_eq!(undone.id, edit.id);
        assert!(deleted_at(&pool, "sessions", &id).await.unwrap().is_some());
        assert!(
            deleted_at(&pool, "session_documents", &id)
                .await
                .unwrap()
                .is_some()
        );
    }

    #[tokio::test]
    async fn undo_leaves_a_created_note_the_user_edited() {
        let pool = pool().await;
        let edits = Edits::default();
        let created = edits
            .create_note(
                &pool,
                MEETING,
                NewNote {
                    title: "Draft".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        let id = created.id.unwrap();
        sqlx::query("UPDATE session_documents SET body = 'typed by the user', updated_at = 'later' WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();

        let message = kept(edits.undo_last(&pool, MEETING, None).await);

        assert!(message.contains("“Draft” was changed"), "{message}");
        assert_eq!(deleted_at(&pool, "sessions", &id).await, Some(None));
    }

    #[tokio::test]
    async fn notes_go_only_into_folders_that_exist() {
        let pool = pool().await;
        user_note(&pool, "filed", "Filed", "Work/Acme").await;
        let edits = Edits::default();

        let missing = edits
            .create_note(
                &pool,
                MEETING,
                NewNote {
                    title: "X".into(),
                    folder: Some("Nope".into()),
                    ..Default::default()
                },
            )
            .await;
        let implicit = edits
            .create_note(
                &pool,
                MEETING,
                NewNote {
                    title: "Y".into(),
                    folder: Some("Work".into()),
                    ..Default::default()
                },
            )
            .await;

        assert!(
            matches!(&missing, Err(EditError::Invalid(message)) if message.contains("no folder “Nope”")),
            "{missing:?}"
        );
        assert_eq!(
            implicit.unwrap().edit.unwrap().summary,
            "Created note “Y” in Work"
        );
        let titles: Vec<String> = sqlx::query_scalar("SELECT title FROM sessions ORDER BY title")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(titles, ["Filed", "Weekly sync", "Y"]);
    }

    #[tokio::test]
    async fn renaming_moving_and_tagging_a_note_undoes_to_the_exact_previous_state() {
        let pool = pool().await;
        user_note(&pool, "note-1", "Kickoff", "Work").await;
        user_folder(&pool, "folder-clients", "Clients").await;
        {
            let mut conn = pool.acquire().await.unwrap();
            anlg_db_app::upsert_tag(&mut conn, "me", "draft", "2026-10-01T09:00:00.000Z")
                .await
                .unwrap();
            anlg_db_app::upsert_session_tag(
                &mut conn,
                "note-1",
                "me",
                "draft",
                "2026-10-01T09:00:00.000Z",
            )
            .await
            .unwrap();
        }
        let session_before = row(&pool, &SESSIONS, "note-1").await.unwrap();
        let link_before = row(&pool, &SESSION_TAGS, "note-1:draft").await.unwrap();
        let edits = Edits::default();

        let changed = edits
            .update_note(
                &pool,
                MEETING,
                "note-1",
                NoteChanges {
                    title: Some("Lumen kickoff".into()),
                    folder: Some("Clients".into()),
                    add_tags: vec!["pricing".into()],
                    remove_tags: vec!["Draft".into()],
                },
            )
            .await
            .unwrap();

        assert_eq!(
            changed.edit.unwrap().summary,
            "Renamed “Kickoff” to “Lumen kickoff”; Moved “Lumen kickoff” to Clients; Tags on “Lumen kickoff”: +pricing −draft"
        );
        let session = row(&pool, &SESSIONS, "note-1").await.unwrap();
        assert_eq!(
            (session["title"].as_str(), session["folder_path"].as_str()),
            (Some("Lumen kickoff"), Some("Clients"))
        );
        assert_eq!(tags(&pool, "note-1").await, ["pricing"]);

        edits.undo_last(&pool, MEETING, None).await.unwrap();

        assert_eq!(
            row(&pool, &SESSIONS, "note-1").await.unwrap(),
            session_before
        );
        assert_eq!(
            row(&pool, &SESSION_TAGS, "note-1:draft").await.unwrap(),
            link_before
        );
        assert_eq!(tags(&pool, "note-1").await, ["draft"]);
        assert!(
            deleted_at(&pool, "tags", "pricing")
                .await
                .unwrap()
                .is_some()
        );
        assert!(
            deleted_at(&pool, "session_tags", "note-1:pricing")
                .await
                .unwrap()
                .is_some()
        );
    }

    #[tokio::test]
    async fn undo_of_a_rename_is_refused_once_the_user_renamed_it_again() {
        let pool = pool().await;
        user_note(&pool, "note-1", "Kickoff", "").await;
        let edits = Edits::default();
        edits
            .update_note(
                &pool,
                MEETING,
                "note-1",
                NoteChanges {
                    title: Some("Coach title".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        sqlx::query("UPDATE sessions SET title = 'User title' WHERE id = 'note-1'")
            .execute(&pool)
            .await
            .unwrap();

        kept(edits.undo_last(&pool, MEETING, None).await);

        assert_eq!(
            row(&pool, &SESSIONS, "note-1").await.unwrap()["title"],
            "User title"
        );
    }

    #[tokio::test]
    async fn locked_notes_cannot_be_changed_or_given_participants() {
        let pool = pool().await;
        user_note(&pool, "locked", "Private", "").await;
        user_note(&pool, "open", "Public", "").await;
        sqlx::query("UPDATE sessions SET locked = 1 WHERE id = 'locked'")
            .execute(&pool)
            .await
            .unwrap();
        user_person(&pool, "sara", "Sara Haddad", "sara@lumen.test").await;
        let edits = Edits::default();
        let rename = |id: &'static str| NoteChanges {
            title: Some(format!("{id} renamed")),
            ..Default::default()
        };

        let locked = edits
            .update_note(&pool, MEETING, "locked", rename("locked"))
            .await;
        let locked_participant = edits
            .add_participant(&pool, MEETING, Some("locked"), "sara")
            .await;
        let open = edits
            .update_note(&pool, MEETING, "open", rename("open"))
            .await;

        assert!(matches!(locked, Err(EditError::Locked)), "{locked:?}");
        assert!(
            matches!(locked_participant, Err(EditError::Locked)),
            "{locked_participant:?}"
        );
        assert_eq!(
            row(&pool, &SESSIONS, "locked").await.unwrap()["title"],
            "Private"
        );
        assert!(open.unwrap().edit.is_some());
        assert_eq!(
            row(&pool, &SESSIONS, "open").await.unwrap()["title"],
            "open renamed"
        );
    }

    #[tokio::test]
    async fn a_nested_folder_is_created_once_and_undo_removes_it_only_while_empty() {
        let pool = pool().await;
        let edits = Edits::default();

        let created = edits
            .create_folder(&pool, MEETING, "Clients/Lumen")
            .await
            .unwrap();
        let again = edits
            .create_folder(&pool, MEETING, "Clients/Lumen/")
            .await
            .unwrap();

        assert_eq!(
            created.edit.as_ref().unwrap().summary,
            "Created folder Clients/Lumen"
        );
        assert!(again.edit.is_none());
        assert_eq!(again.id, created.id);
        let alive: Vec<String> =
            sqlx::query_scalar("SELECT path FROM folders WHERE deleted_at IS NULL ORDER BY path")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(alive, ["Clients", "Clients/Lumen"]);

        user_note(&pool, "filed", "Filed by the user", "Clients/Lumen").await;
        kept(edits.undo_last(&pool, MEETING, None).await);
        assert_eq!(
            deleted_at(&pool, "folders", created.id.as_deref().unwrap()).await,
            Some(None)
        );

        sqlx::query("UPDATE sessions SET folder_path = '' WHERE id = 'filed'")
            .execute(&pool)
            .await
            .unwrap();
        edits.undo_last(&pool, MEETING, None).await.unwrap();
        let alive: i64 =
            sqlx::query_scalar("SELECT count(*) FROM folders WHERE deleted_at IS NULL")
                .fetch_one(&pool)
                .await
                .unwrap();
        let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM folders")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!((alive, rows), (0, 2));
    }

    #[tokio::test]
    async fn an_existing_contact_is_returned_instead_of_a_duplicate() {
        let pool = pool().await;
        user_person(&pool, "sara", "Sara  Haddad", "Sara@Lumen.test").await;
        let edits = Edits::default();

        let by_email = edits
            .create_person(
                &pool,
                MEETING,
                PersonFields {
                    name: Some("S. Haddad".into()),
                    email: Some("sara@lumen.TEST".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        let by_name = edits
            .create_person(
                &pool,
                MEETING,
                PersonFields {
                    name: Some(" sara haddad ".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        let other = edits
            .create_person(
                &pool,
                MEETING,
                PersonFields {
                    name: Some("Omar Aziz".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(
            (by_email.id.as_deref(), by_email.edit.is_none()),
            (Some("sara"), true)
        );
        assert!(
            by_email.message.starts_with("Already in contacts"),
            "{}",
            by_email.message
        );
        assert_eq!(
            (by_name.id.as_deref(), by_name.edit.is_none()),
            (Some("sara"), true)
        );
        assert_ne!(other.id.as_deref(), Some("sara"));
        assert_eq!(other.edit.unwrap().summary, "Created contact Omar Aziz");
    }

    #[tokio::test]
    async fn a_new_contact_links_an_organization_only_when_it_exists_or_was_asked_for() {
        let pool = pool().await;
        let edits = Edits::default();
        let person = |org: &str, create: bool| PersonFields {
            name: Some(format!("Someone at {org}")),
            email: Some(format!("x@{org}.test")),
            job_title: Some("CFO".into()),
            organization: Some(org.into()),
            create_organization: create,
            ..Default::default()
        };

        let refused = edits
            .create_person(&pool, MEETING, person("Lumen", false))
            .await;
        let created = edits
            .create_person(&pool, MEETING, person("Lumen", true))
            .await
            .unwrap();
        let linked = edits
            .create_person(&pool, MEETING, person("lumen", false))
            .await
            .unwrap();

        assert!(
            matches!(&refused, Err(EditError::Invalid(message)) if message.contains("no organization named")),
            "{refused:?}"
        );
        let first = row(&pool, &HUMANS, created.id.as_deref().unwrap())
            .await
            .unwrap();
        let second = row(&pool, &HUMANS, linked.id.as_deref().unwrap())
            .await
            .unwrap();
        assert_eq!(first["job_title"], "CFO");
        assert_eq!(first["organization_id"], second["organization_id"]);
        let organizations: i64 = sqlx::query_scalar("SELECT count(*) FROM organizations")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(organizations, 1);
    }

    #[tokio::test]
    async fn undo_removes_a_created_contact_and_its_organization_only_while_unused() {
        let pool = pool().await;
        user_note(&pool, "other-meeting", "Other", "").await;
        let edits = Edits::default();
        let fields = |name: &str| PersonFields {
            name: Some(name.into()),
            organization: Some(format!("{name} Co")),
            create_organization: true,
            ..Default::default()
        };

        let used = edits
            .create_person(&pool, MEETING, fields("Used"))
            .await
            .unwrap();
        let used_id = used.id.unwrap();
        sqlx::query(
            "INSERT INTO session_participants (id, session_id, human_id, source) VALUES ('p-user', 'other-meeting', ?, 'manual')",
        )
        .bind(&used_id)
        .execute(&pool)
        .await
        .unwrap();
        kept(edits.undo_last(&pool, MEETING, None).await);
        assert_eq!(deleted_at(&pool, "humans", &used_id).await, Some(None));

        sqlx::query("UPDATE session_participants SET deleted_at = 'x' WHERE id = 'p-user'")
            .execute(&pool)
            .await
            .unwrap();
        edits.undo_last(&pool, MEETING, None).await.unwrap();
        assert!(
            deleted_at(&pool, "humans", &used_id)
                .await
                .unwrap()
                .is_some()
        );
        let organizations: Vec<Option<String>> =
            sqlx::query_scalar("SELECT deleted_at FROM organizations")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(organizations.len(), 1);
        assert!(organizations[0].is_some());
    }

    #[tokio::test]
    async fn contact_and_organization_edits_undo_to_the_previous_values() {
        let pool = pool().await;
        user_person(&pool, "sara", "Sara Haddad", "sara@lumen.test").await;
        sqlx::query(
            "INSERT INTO organizations (id, name, memo) VALUES ('org', 'Lumen', 'old memo')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let person_before = row(&pool, &HUMANS, "sara").await.unwrap();
        let org_before = row(&pool, &ORGANIZATIONS, "org").await.unwrap();
        let edits = Edits::default();

        let person = edits
            .update_person(
                &pool,
                MEETING,
                "sara",
                PersonFields {
                    job_title: Some("CFO".into()),
                    organization: Some("Lumen".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        let org = edits
            .update_organization(
                &pool,
                MEETING,
                "org",
                OrganizationFields {
                    memo: Some("new memo".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(
            person.edit.unwrap().summary,
            "Updated Sara Haddad: title, organization"
        );
        assert_eq!(org.edit.unwrap().summary, "Updated Lumen: memo");
        assert_eq!(
            row(&pool, &HUMANS, "sara").await.unwrap()["organization_id"],
            "org"
        );

        edits.undo_last(&pool, MEETING, None).await.unwrap();
        edits.undo_last(&pool, MEETING, None).await.unwrap();

        assert_eq!(row(&pool, &ORGANIZATIONS, "org").await.unwrap(), org_before);
        assert_eq!(row(&pool, &HUMANS, "sara").await.unwrap(), person_before);
    }

    #[tokio::test]
    async fn adding_a_participant_is_idempotent_and_undo_unlinks_or_re_excludes() {
        let pool = pool().await;
        user_person(&pool, "sara", "Sara Haddad", "sara@lumen.test").await;
        user_person(&pool, "omar", "Omar Aziz", "").await;
        sqlx::query(
            "INSERT INTO session_participants (id, session_id, human_id, source, updated_at)
             VALUES ('excluded-omar', ?, 'omar', 'excluded', '2026-10-01T09:00:00.000Z')",
        )
        .bind(MEETING)
        .execute(&pool)
        .await
        .unwrap();
        let excluded_before = row(&pool, &PARTICIPANTS, "excluded-omar").await.unwrap();
        let edits = Edits::default();

        let added = edits
            .add_participant(&pool, MEETING, None, "sara")
            .await
            .unwrap();
        let again = edits
            .add_participant(&pool, MEETING, None, "sara")
            .await
            .unwrap();
        let revived = edits
            .add_participant(&pool, MEETING, None, "omar")
            .await
            .unwrap();

        assert_eq!(
            added.edit.unwrap().summary,
            "Added Sara Haddad (sara@lumen.test) to this meeting"
        );
        assert!(again.edit.is_none());
        assert_eq!(again.id, added.id);
        assert_eq!(revived.id.as_deref(), Some("excluded-omar"));
        assert_eq!(
            row(&pool, &PARTICIPANTS, "excluded-omar").await.unwrap()["source"],
            "manual"
        );

        edits.undo_last(&pool, MEETING, None).await.unwrap();
        edits.undo_last(&pool, MEETING, None).await.unwrap();

        assert_eq!(
            row(&pool, &PARTICIPANTS, "excluded-omar").await.unwrap(),
            excluded_before
        );
        assert!(
            deleted_at(&pool, "session_participants", added.id.as_deref().unwrap())
                .await
                .unwrap()
                .is_some()
        );
    }

    #[tokio::test]
    async fn templates_are_created_and_edited_with_undo_that_respects_later_user_edits() {
        let pool = pool().await;
        let edits = Edits::default();
        let section = |title: &str| TemplateSection {
            title: title.into(),
            description: format!("About {title}"),
        };

        let created = edits
            .create_template(
                &pool,
                MEETING,
                TemplateFields {
                    title: Some("Discovery".into()),
                    sections: Some(vec![section("Pain")]),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        let id = created.id.unwrap();
        let before_edit = row(&pool, &TEMPLATES, &id).await.unwrap();
        edits
            .update_template(
                &pool,
                MEETING,
                &id,
                TemplateFields {
                    sections: Some(vec![section("Pain"), section("Budget")]),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        edits.undo_last(&pool, MEETING, None).await.unwrap();
        assert_eq!(row(&pool, &TEMPLATES, &id).await.unwrap(), before_edit);

        sqlx::query("UPDATE templates SET description = 'mine' WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();
        kept(edits.undo_last(&pool, MEETING, None).await);
        assert!(row(&pool, &TEMPLATES, &id).await.is_some());

        let invalid = edits
            .create_template(
                &pool,
                MEETING,
                TemplateFields {
                    title: Some("X".into()),
                    sections: Some(vec![section("")]),
                    ..Default::default()
                },
            )
            .await;
        assert!(matches!(invalid, Err(EditError::Invalid(_))), "{invalid:?}");
    }

    #[tokio::test]
    async fn undo_never_removes_rows_the_coach_did_not_create() {
        let pool = pool().await;
        user_note(&pool, "note-1", "Kickoff", "Work").await;
        user_folder(&pool, "folder-work", "Work").await;
        user_person(&pool, "sara", "Sara Haddad", "sara@lumen.test").await;
        sqlx::query("INSERT INTO organizations (id, name) VALUES ('org', 'Lumen')")
            .execute(&pool)
            .await
            .unwrap();
        let edits = Edits::default();

        edits.create_folder(&pool, MEETING, "Work").await.unwrap();
        edits
            .create_person(
                &pool,
                MEETING,
                PersonFields {
                    name: Some("Sara Haddad".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        edits
            .create_organization(
                &pool,
                MEETING,
                OrganizationFields {
                    name: Some("lumen".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        edits
            .update_note(
                &pool,
                MEETING,
                "note-1",
                NoteChanges {
                    title: Some("Renamed".into()),
                    add_tags: vec!["x".into()],
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        edits
            .update_person(
                &pool,
                MEETING,
                "sara",
                PersonFields {
                    memo: Some("met in Riyadh".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        edits
            .add_participant(&pool, MEETING, Some("note-1"), "sara")
            .await
            .unwrap();
        while edits.undo_last(&pool, MEETING, None).await.is_ok() {}

        for (table, id) in [
            ("sessions", "note-1"),
            ("folders", "folder-work"),
            ("humans", "sara"),
            ("organizations", "org"),
        ] {
            assert_eq!(
                deleted_at(&pool, table, id).await,
                Some(None),
                "{table} {id}"
            );
        }
        assert!(matches!(
            edits.undo_last(&pool, MEETING, None).await,
            Err(EditError::NothingToUndo)
        ));
    }
}
