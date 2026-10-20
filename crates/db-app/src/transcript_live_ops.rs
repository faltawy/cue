use sqlx::SqlitePool;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiveTranscriptInsert {
    pub id: String,
    pub session_id: String,
    pub owner_user_id: String,
    pub created_at: String,
    pub started_at_ms: i64,
    pub memo: String,
    pub provider: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AppendOutcome {
    pub transcript_exists: bool,
}

#[derive(Debug, Error)]
pub enum LiveTranscriptOpsError {
    #[error(transparent)]
    Sql(#[from] sqlx::Error),
    #[error("Transcript {0} does not exist")]
    TranscriptDoesNotExist(String),
}

pub async fn append_live_transcript_deltas(
    pool: &SqlitePool,
    target: &LiveTranscriptInsert,
    delta_jsons: &[String],
) -> Result<AppendOutcome, LiveTranscriptOpsError> {
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;

    sqlx::query(
        "INSERT OR IGNORE INTO transcripts (
            id, workspace_id, owner_user_id, session_id, source, provider, model,
            language, started_at_ms, ended_at_ms, audio_attachment_id, memo,
            words_json, speaker_hints_json, metadata_json, created_at, updated_at
         )
         SELECT ?, session.workspace_id, COALESCE(NULLIF(?, ''), session.owner_user_id),
                ?, 'live_capture', COALESCE(?, ''), COALESCE(?, ''), '', ?, NULL, '',
                ?, '[]', '[]', '{}', ?,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         FROM sessions AS session
         WHERE session.id = ? AND session.deleted_at IS NULL",
    )
    .bind(&target.id)
    .bind(&target.owner_user_id)
    .bind(&target.session_id)
    .bind(&target.provider)
    .bind(&target.model)
    .bind(target.started_at_ms)
    .bind(&target.memo)
    .bind(&target.created_at)
    .bind(&target.session_id)
    .execute(&mut *transaction)
    .await?;

    for delta_json in delta_jsons {
        sqlx::query(
            "INSERT OR IGNORE INTO transcript_live_state (
                transcript_id, next_sequence, updated_at
             )
             SELECT id, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             FROM transcripts
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(&target.id)
        .execute(&mut *transaction)
        .await?;

        let journal_id = format!("{}:{}", target.id, uuid::Uuid::new_v4());
        let inserted = sqlx::query(
            "INSERT INTO transcript_live_deltas (
                id, transcript_id, sequence, delta_json, created_at
             )
             SELECT ?, transcript_id, next_sequence, ?,
                    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             FROM transcript_live_state
             WHERE transcript_id = ?",
        )
        .bind(journal_id)
        .bind(delta_json)
        .bind(&target.id)
        .execute(&mut *transaction)
        .await?
        .rows_affected();

        if inserted == 0 {
            return Err(LiveTranscriptOpsError::TranscriptDoesNotExist(
                target.id.clone(),
            ));
        }

        sqlx::query(
            "UPDATE transcript_live_state
             SET next_sequence = next_sequence + 1,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE transcript_id = ?",
        )
        .bind(&target.id)
        .execute(&mut *transaction)
        .await?;
    }

    let transcript_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM transcripts
            WHERE id = ? AND deleted_at IS NULL
         )",
    )
    .bind(&target.id)
    .fetch_one(&mut *transaction)
    .await?;

    transaction.commit().await?;

    Ok(AppendOutcome { transcript_exists })
}

pub async fn close_interrupted_transcripts(
    pool: &SqlitePool,
    started_before_ms: i64,
) -> Result<u64, sqlx::Error> {
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;

    let session_ids: Vec<String> = sqlx::query_scalar(
        "UPDATE transcripts
         SET ended_at_ms = MAX(
               started_at_ms,
               COALESCE((
                 SELECT CAST(ROUND((julianday(MAX(delta.created_at)) - 2440587.5) * 86400000) AS INTEGER)
                 FROM transcript_live_deltas AS delta
                 WHERE delta.transcript_id = transcripts.id
               ), started_at_ms),
               started_at_ms + COALESCE((
                 SELECT MAX(CAST(json_extract(word.value, '$.end_ms') AS INTEGER))
                 FROM json_each(CASE WHEN json_valid(words_json) THEN words_json ELSE '[]' END) AS word
               ), 0)
             ),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE ended_at_ms IS NULL AND deleted_at IS NULL AND started_at_ms < ?
         RETURNING session_id",
    )
    .bind(started_before_ms)
    .fetch_all(&mut *transaction)
    .await?;

    sqlx::query(
        "UPDATE sessions
         SET started_at = CASE WHEN started_at = '' THEN
               strftime('%Y-%m-%dT%H:%M:%fZ', (
                 SELECT MIN(started_at_ms) FROM transcripts
                 WHERE session_id = sessions.id AND deleted_at IS NULL
               ) / 1000.0, 'unixepoch') ELSE started_at END,
             ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', (
               SELECT MAX(ended_at_ms) FROM transcripts
               WHERE session_id = sessions.id AND deleted_at IS NULL
             ) / 1000.0, 'unixepoch'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL",
    )
    .bind(serde_json::to_string(&session_ids).map_err(|error| sqlx::Error::Encode(error.into()))?)
    .execute(&mut *transaction)
    .await?;

    transaction.commit().await?;
    Ok(session_ids.len() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use anlg_db_core::Db;
    use sqlx::Row;

    async fn test_db() -> Db {
        let db = Db::connect_memory_plain().await.unwrap();
        crate::prepare_schema(&db).await.unwrap();
        sqlx::query(
            "INSERT INTO sessions (id, workspace_id, owner_user_id)
             VALUES ('session-1', 'workspace-1', 'session-owner')",
        )
        .execute(db.pool())
        .await
        .unwrap();
        db
    }

    fn target() -> LiveTranscriptInsert {
        LiveTranscriptInsert {
            id: "transcript-1".to_string(),
            session_id: "session-1".to_string(),
            owner_user_id: String::new(),
            created_at: "2026-08-15T12:00:00.000Z".to_string(),
            started_at_ms: 1000,
            memo: "meeting memo".to_string(),
            provider: Some("soniox".to_string()),
            model: Some("stt-rt-v3".to_string()),
        }
    }

    fn delta_json(word_id: &str, end_ms: i64) -> String {
        serde_json::json!({
            "new_words": [{
                "id": word_id,
                "text": word_id,
                "start_ms": end_ms - 100,
                "end_ms": end_ms,
                "channel": 0,
                "state": "final"
            }],
            "replaced_ids": [],
            "partials": []
        })
        .to_string()
    }

    #[tokio::test]
    async fn creates_once_and_appends_each_batch_in_sequence() {
        let db = test_db().await;
        let first_batch = vec![delta_json("word-1", 200), delta_json("word-2", 400)];
        let second_batch = vec![delta_json("word-3", 600)];

        let first = append_live_transcript_deltas(db.pool(), &target(), &first_batch)
            .await
            .unwrap();
        let second = append_live_transcript_deltas(db.pool(), &target(), &second_batch)
            .await
            .unwrap();

        assert!(first.transcript_exists);
        assert!(second.transcript_exists);

        let transcripts = sqlx::query("SELECT * FROM transcripts WHERE id = 'transcript-1'")
            .fetch_all(db.pool())
            .await
            .unwrap();
        assert_eq!(transcripts.len(), 1);
        assert_eq!(
            transcripts[0].get::<String, _>("owner_user_id"),
            "session-owner"
        );
        assert_eq!(transcripts[0].get::<String, _>("source"), "live_capture");
        assert_eq!(transcripts[0].get::<String, _>("language"), "");
        assert_eq!(transcripts[0].get::<Option<String>, _>("ended_at_ms"), None);
        assert_eq!(transcripts[0].get::<String, _>("audio_attachment_id"), "");
        assert_eq!(transcripts[0].get::<String, _>("words_json"), "[]");
        assert_eq!(transcripts[0].get::<String, _>("speaker_hints_json"), "[]");
        assert_eq!(transcripts[0].get::<String, _>("metadata_json"), "{}");

        let deltas = sqlx::query(
            "SELECT sequence, delta_json, created_at
             FROM transcript_live_deltas
             WHERE transcript_id = 'transcript-1'
             ORDER BY sequence",
        )
        .fetch_all(db.pool())
        .await
        .unwrap();
        assert_eq!(
            deltas
                .iter()
                .map(|row| row.get::<i64, _>("sequence"))
                .collect::<Vec<_>>(),
            [0, 1, 2]
        );
        assert_eq!(
            deltas
                .iter()
                .map(|row| serde_json::from_str::<serde_json::Value>(
                    &row.get::<String, _>("delta_json")
                )
                .unwrap())
                .collect::<Vec<_>>(),
            first_batch
                .iter()
                .chain(&second_batch)
                .map(|delta| serde_json::from_str::<serde_json::Value>(delta).unwrap())
                .collect::<Vec<_>>()
        );
        for row in deltas {
            let timestamp = row.get::<String, _>("created_at");
            assert!(timestamp.ends_with('Z'));
            assert_eq!(timestamp.len(), 24);
        }
    }

    #[tokio::test]
    async fn soft_deleted_transcript_rejects_delta_without_writing_rows() {
        let db = test_db().await;
        sqlx::query(
            "INSERT INTO transcripts (id, session_id, deleted_at)
             VALUES ('transcript-1', 'session-1', '2026-08-15T12:00:00.000Z')",
        )
        .execute(db.pool())
        .await
        .unwrap();

        let error =
            append_live_transcript_deltas(db.pool(), &target(), &[delta_json("word-1", 200)])
                .await
                .unwrap_err();
        assert_eq!(error.to_string(), "Transcript transcript-1 does not exist");
        let state_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM transcript_live_state")
            .fetch_one(db.pool())
            .await
            .unwrap();
        let delta_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM transcript_live_deltas")
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(state_count, 0);
        assert_eq!(delta_count, 0);
    }

    #[tokio::test]
    async fn startup_closes_transcripts_left_open_at_their_last_activity() {
        let db = test_db().await;
        let pool = db.pool();
        sqlx::query(
            "INSERT INTO sessions (id, workspace_id, owner_user_id) VALUES
                ('session-2', 'workspace-1', 'session-owner'),
                ('session-3', 'workspace-1', 'session-owner')",
        )
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO transcripts (id, session_id, started_at_ms, ended_at_ms, words_json, updated_at, deleted_at) VALUES
                ('spoken', 'session-1', 1792359420000, NULL, '[{\"id\":\"w\",\"end_ms\":60000}]', '2026-10-18T21:37:00.000Z', NULL),
                ('deleted', 'session-1', 1, NULL, '[]', '2026-10-18T21:37:00.000Z', '2026-10-18T21:38:00.000Z'),
                ('words-only', 'session-2', 1792359420000, NULL, '[{\"id\":\"w\",\"end_ms\":90000}]', '2026-10-18T21:37:00.000Z', NULL),
                ('silent', 'session-2', 1792359420005, NULL, '[]', '2026-10-18T21:37:00.000Z', NULL),
                ('closed', 'session-3', 1792359420000, 1792359999000, '[]', '2026-10-18T00:00:00.000Z', NULL),
                ('this-launch', 'session-3', 1792494000000, NULL, '[]', '2026-10-20T11:00:00.000Z', NULL)",
        )
        .execute(pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO transcript_live_state (transcript_id) VALUES ('spoken')")
            .execute(pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO transcript_live_deltas (id, transcript_id, sequence, delta_json, created_at) VALUES
                ('d0', 'spoken', 0, '{}', '2026-10-18T21:50:00.000Z'),
                ('d1', 'spoken', 1, '{}', '2026-10-18T22:10:00.250Z')",
        )
        .execute(pool)
        .await
        .unwrap();

        let closed = close_interrupted_transcripts(pool, 1792494000000)
            .await
            .unwrap();

        let transcripts: Vec<(String, Option<i64>, String)> =
            sqlx::query_as("SELECT id, ended_at_ms, updated_at FROM transcripts ORDER BY id")
                .fetch_all(pool)
                .await
                .unwrap();
        let ended = |id: &str| {
            transcripts
                .iter()
                .find(|row| row.0 == id)
                .map(|row| (row.1, row.2.as_str()))
                .unwrap()
        };
        assert_eq!(closed, 3);
        assert_eq!(ended("spoken").0, Some(1792361400250));
        assert_eq!(ended("words-only").0, Some(1792359510000));
        assert_eq!(ended("silent").0, Some(1792359420005));
        assert_ne!(ended("spoken").1, "2026-10-18T21:37:00.000Z");
        assert_eq!(
            ended("closed"),
            (Some(1792359999000), "2026-10-18T00:00:00.000Z")
        );
        assert_eq!(ended("deleted").0, None);
        assert_eq!(ended("this-launch").0, None);

        let sessions: Vec<(String, String, String)> =
            sqlx::query_as("SELECT id, started_at, ended_at FROM sessions ORDER BY id")
                .fetch_all(pool)
                .await
                .unwrap();
        assert_eq!(
            sessions,
            [
                (
                    "session-1".to_string(),
                    "2026-10-18T21:37:00.000Z".to_string(),
                    "2026-10-18T22:10:00.250Z".to_string()
                ),
                (
                    "session-2".to_string(),
                    "2026-10-18T21:37:00.000Z".to_string(),
                    "2026-10-18T21:38:30.000Z".to_string()
                ),
                ("session-3".to_string(), String::new(), String::new()),
            ]
        );
    }
}
