use serde::{Deserialize, Serialize};
use specta::Type;
use sqlx::{Row, SqliteConnection, SqlitePool};

use crate::transaction_utils::js_iso8601_timestamp;

const MAX_TAG_CHARS: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SessionTagRequest {
    pub session_id: String,
    pub tag_name: String,
}

fn clean_tag_name(raw: &str) -> Result<String, String> {
    let name = raw.trim().trim_start_matches('#').trim();
    if name.is_empty() {
        return Err("tag_name_empty".to_string());
    }
    if name.chars().count() > MAX_TAG_CHARS {
        return Err("tag_name_too_long".to_string());
    }
    Ok(name.to_string())
}

// Tags are matched without regard to case, so "Pricing" reuses "pricing".
async fn existing_tag_id(
    conn: &mut SqliteConnection,
    name: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT id FROM tags
         WHERE deleted_at IS NULL AND (lower(name) = lower(?) OR lower(id) = lower(?))
         ORDER BY created_at, id
         LIMIT 1",
    )
    .bind(name)
    .bind(name)
    .fetch_optional(&mut *conn)
    .await
}

pub async fn add_session_tag(
    pool: &SqlitePool,
    request: SessionTagRequest,
) -> Result<String, String> {
    let name = clean_tag_name(&request.tag_name)?;
    let now = js_iso8601_timestamp();
    let mut transaction = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())?;

    let owner: String = sqlx::query_scalar(
        "SELECT owner_user_id FROM sessions WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&request.session_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "session_not_found".to_string())?;

    let tag_id = match existing_tag_id(&mut transaction, &name)
        .await
        .map_err(|error| error.to_string())?
    {
        Some(id) => id,
        None => {
            anlg_db_app::upsert_tag(&mut transaction, &owner, &name, &now)
                .await
                .map_err(|error| error.to_string())?;
            name
        }
    };
    anlg_db_app::upsert_session_tag(&mut transaction, &request.session_id, &owner, &tag_id, &now)
        .await
        .map_err(|error| error.to_string())?;

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(tag_id)
}

pub async fn remove_session_tag(
    pool: &SqlitePool,
    request: SessionTagRequest,
) -> Result<(), String> {
    let name = clean_tag_name(&request.tag_name)?;
    let now = js_iso8601_timestamp();
    let mut transaction = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|error| error.to_string())?;

    let link_ids = sqlx::query(
        "SELECT st.id
         FROM session_tags st
         LEFT JOIN tags t ON t.id = st.tag_id
         WHERE st.session_id = ?
           AND st.deleted_at IS NULL
           AND (lower(st.tag_id) = lower(?) OR lower(COALESCE(t.name, '')) = lower(?))",
    )
    .bind(&request.session_id)
    .bind(&name)
    .bind(&name)
    .fetch_all(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .into_iter()
    .map(|row| row.get::<String, _>("id"))
    .collect::<Vec<_>>();

    for link_id in link_ids {
        sqlx::query("UPDATE session_tags SET deleted_at = ?, updated_at = ? WHERE id = ?")
            .bind(&now)
            .bind(&now)
            .bind(&link_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anlg_db_core::Db;

    async fn test_db() -> Db {
        let db = Db::connect_memory_plain().await.unwrap();
        anlg_db_app::prepare_schema(&db).await.unwrap();
        sqlx::query(
            "INSERT INTO sessions (id, owner_user_id) VALUES ('note-1', 'user-1'), ('note-2', 'user-1')",
        )
        .execute(db.pool())
        .await
        .unwrap();
        db
    }

    async fn live_tags(pool: &SqlitePool, session_id: &str) -> Vec<String> {
        sqlx::query_scalar(
            "SELECT t.name FROM session_tags st JOIN tags t ON t.id = st.tag_id
             WHERE st.session_id = ? AND st.deleted_at IS NULL AND t.deleted_at IS NULL
             ORDER BY t.name",
        )
        .bind(session_id)
        .fetch_all(pool)
        .await
        .unwrap()
    }

    fn request(session_id: &str, tag_name: &str) -> SessionTagRequest {
        SessionTagRequest {
            session_id: session_id.to_string(),
            tag_name: tag_name.to_string(),
        }
    }

    #[tokio::test]
    async fn adds_reuses_and_removes_tags_regardless_of_case() {
        let db = test_db().await;

        add_session_tag(db.pool(), request("note-1", "#Pricing"))
            .await
            .unwrap();
        add_session_tag(db.pool(), request("note-2", "pricing"))
            .await
            .unwrap();
        add_session_tag(db.pool(), request("note-2", "مبيعات"))
            .await
            .unwrap();

        assert_eq!(live_tags(db.pool(), "note-1").await, ["Pricing"]);
        assert_eq!(live_tags(db.pool(), "note-2").await, ["Pricing", "مبيعات"]);
        let tag_rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tags")
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(tag_rows, 2);

        remove_session_tag(db.pool(), request("note-2", "PRICING"))
            .await
            .unwrap();
        assert_eq!(live_tags(db.pool(), "note-2").await, ["مبيعات"]);
        assert_eq!(live_tags(db.pool(), "note-1").await, ["Pricing"]);

        add_session_tag(db.pool(), request("note-2", "pricing"))
            .await
            .unwrap();
        assert_eq!(live_tags(db.pool(), "note-2").await, ["Pricing", "مبيعات"]);
    }

    #[tokio::test]
    async fn rejects_empty_and_unknown_notes() {
        let db = test_db().await;

        assert_eq!(
            add_session_tag(db.pool(), request("note-1", " # ")).await,
            Err("tag_name_empty".to_string())
        );
        assert_eq!(
            add_session_tag(db.pool(), request("missing", "pricing")).await,
            Err("session_not_found".to_string())
        );
        assert!(live_tags(db.pool(), "note-1").await.is_empty());
        add_session_tag(db.pool(), request("note-1", "pricing"))
            .await
            .unwrap();
        assert_eq!(live_tags(db.pool(), "note-1").await, ["pricing"]);
    }
}
