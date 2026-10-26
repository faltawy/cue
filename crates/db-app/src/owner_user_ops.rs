pub async fn current_owner_user_id(
    conn: &mut sqlx::SqliteConnection,
) -> Result<String, sqlx::Error> {
    Ok(
        sqlx::query_scalar::<_, String>(include_str!("../sql/owner-user.sql"))
            .fetch_optional(conn)
            .await?
            .filter(|id| !id.trim().is_empty())
            .unwrap_or_else(|| "00000000-0000-0000-0000-000000000000".to_string()),
    )
}
