use std::time::Duration;

use tauri::Manager;

pub(crate) fn spawn<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    let launched_at_ms = crate::capture_gaps::unix_now_ms();
    tauri::async_runtime::spawn(async move {
        let Some(pool) = ready_pool(&app).await else {
            return;
        };
        match anlg_db_app::close_interrupted_transcripts(&pool, launched_at_ms).await {
            Ok(0) => {}
            Ok(closed) => tracing::info!(closed, "closed_interrupted_transcripts"),
            Err(error) => tracing::error!(%error, "close_interrupted_transcripts_failed"),
        }
    });
}

async fn ready_pool<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<sqlx::SqlitePool> {
    loop {
        if let Some(runtime) = app.try_state::<tauri_plugin_db::ManagedState>() {
            return match runtime.wait_until_ready().await {
                Ok(()) => Some(runtime.pool().clone()),
                Err(error) => {
                    tracing::error!(%error, "interrupted_transcripts_database_unavailable");
                    None
                }
            };
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}
