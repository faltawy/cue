use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use tauri_plugin_tracing::make_file_writer;
use tempfile::tempdir;

use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, prelude::*};

fn create_test_file_writer(
    logs_dir: &PathBuf,
) -> (tracing_appender::non_blocking::NonBlocking, WorkerGuard) {
    make_file_writer(logs_dir).unwrap()
}

mod e2e {
    use super::*;

    #[test]
    fn test_file_log_redacts_secrets_and_keeps_diagnostics_e2e() {
        let temp = tempdir().unwrap();
        let logs_dir = temp.path().to_path_buf();
        fs::create_dir_all(&logs_dir).unwrap();

        let (file_writer, guard) = create_test_file_writer(&logs_dir);

        let subscriber = tracing_subscriber::registry()
            .with(fmt::layer().with_ansi(false).with_writer(file_writer));

        tracing::subscriber::with_default(subscriber, || {
            tracing::info!(
                "session 550e8400-e29b-41d4-a716-446655440000 from 192.168.1.100 saved to /Users/alice/notes for user@example.com"
            );
            tracing::warn!("Authorization: Bearer abcdefghijklmnop");
            tracing::error!("soniox rejected request: 402 Payment Required");
        });

        drop(guard);
        std::thread::sleep(Duration::from_millis(100));

        let log_file = logs_dir.join("app.log");
        assert!(log_file.exists(), "Log file should be created");

        let content = fs::read_to_string(&log_file).unwrap();

        for kept in [
            "550e8400-e29b-41d4-a716-446655440000",
            "192.168.1.100",
            "/Users/alice/notes",
            "user@example.com",
            "soniox rejected request: 402 Payment Required",
            "Bearer [SECRET_REDACTED]",
        ] {
            assert!(content.contains(kept), "missing {kept:?} in {content}");
        }
        assert!(!content.contains("abcdefghijklmnop"), "{content}");
    }

    #[test]
    fn test_log_file_rotation_e2e() {
        let temp = tempdir().unwrap();
        let logs_dir = temp.path().to_path_buf();
        fs::create_dir_all(&logs_dir).unwrap();

        let (file_writer, guard) = create_test_file_writer(&logs_dir);

        let subscriber = tracing_subscriber::registry()
            .with(fmt::layer().with_ansi(false).with_writer(file_writer));

        let large_message = "x".repeat(1024);
        tracing::subscriber::with_default(subscriber, || {
            for i in 0..6000 {
                tracing::info!("Log entry {} - {}", i, large_message);
            }
        });

        drop(guard);
        std::thread::sleep(Duration::from_millis(100));

        let app_log = logs_dir.join("app.log");
        assert!(app_log.exists(), "app.log should exist");

        let rotated_exists = (1..=5).any(|i| logs_dir.join(format!("app.log.{}", i)).exists());
        assert!(
            rotated_exists,
            "At least one rotated log file should exist after writing 6MB+ of data"
        );
    }

    #[test]
    fn test_structured_secret_fields_are_redacted_e2e() {
        let temp = tempdir().unwrap();
        let logs_dir = temp.path().to_path_buf();
        fs::create_dir_all(&logs_dir).unwrap();

        let (file_writer, guard) = create_test_file_writer(&logs_dir);

        let subscriber = tracing_subscriber::registry()
            .with(fmt::layer().with_ansi(false).with_writer(file_writer));

        tracing::subscriber::with_default(subscriber, || {
            tracing::info!(
                api_key = "sk_live_12345678",
                provider = "soniox",
                session_id = "550e8400-e29b-41d4-a716-446655440000",
                "listen_ws_connected"
            );
        });

        drop(guard);
        std::thread::sleep(Duration::from_millis(100));

        let content = fs::read_to_string(logs_dir.join("app.log")).unwrap();

        assert!(content.contains("listen_ws_connected"), "{content}");
        assert!(content.contains("provider=\"soniox\""), "{content}");
        assert!(
            content.contains("session_id=\"550e8400-e29b-41d4-a716-446655440000\""),
            "{content}"
        );
        assert!(
            content.contains("api_key=\"[SECRET_REDACTED]\""),
            "{content}"
        );
        assert!(!content.contains("sk_live_12345678"), "{content}");
    }
}
