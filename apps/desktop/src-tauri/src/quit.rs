use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_transcription::ListenerPluginExt;
use tauri_plugin_windows::AppWindow;
use tauri_specta::Event;

static QUIT_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
const RECORDING_POLL_INTERVAL: Duration = Duration::from_millis(250);
const RECORDING_SAVE_TIMEOUT: Duration = Duration::from_secs(120);

pub fn request_quit(app: &AppHandle) {
    if QUIT_IN_PROGRESS.swap(true, Ordering::SeqCst) {
        return;
    }

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if app.listener().is_capturing().await {
            if !confirm_stop_and_quit(&app).await {
                QUIT_IN_PROGRESS.store(false, Ordering::SeqCst);
                return;
            }
            stop_recording_and_wait(&app).await;
        }
        app.exit(0);
    });
}

async fn confirm_stop_and_quit(app: &AppHandle) -> bool {
    if let Err(error) = AppWindow::Main.show(app) {
        tracing::warn!(%error, "failed to show the main window before quitting");
    }

    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .message(format!(
            "{} saves the recording before it quits.",
            app.package_info().name
        ))
        .title("A recording is in progress — stop and quit?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Stop & Quit".to_string(),
            "Cancel".to_string(),
        ))
        .show(move |confirmed| {
            let _ = sender.send(confirmed);
        });
    receiver.await.unwrap_or(false)
}

async fn stop_recording_and_wait(app: &AppHandle) {
    if let Err(error) = (tauri_plugin_tray::TrayStopRecording {}).emit(app) {
        tracing::warn!(%error, "failed to request stop recording before quitting");
    }

    let saved = wait_until_idle(
        || async { app.listener().is_capturing().await },
        RECORDING_POLL_INTERVAL,
        RECORDING_SAVE_TIMEOUT,
    )
    .await;
    if saved {
        tracing::info!("recording stopped and saved before quitting");
    } else {
        tracing::warn!("quitting before the recording finished saving");
    }
}

async fn wait_until_idle<F, Fut>(mut busy: F, interval: Duration, timeout: Duration) -> bool
where
    F: FnMut() -> Fut,
    Fut: Future<Output = bool>,
{
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        if !busy().await {
            return true;
        }
        if tokio::time::Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(interval).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[tokio::test]
    async fn waits_for_the_recording_to_finish_saving() {
        let checks = Cell::new(0);
        let saved = wait_until_idle(
            || {
                checks.set(checks.get() + 1);
                let busy = checks.get() < 3;
                async move { busy }
            },
            Duration::from_millis(1),
            Duration::from_secs(5),
        )
        .await;

        assert!(saved);
        assert_eq!(checks.get(), 3);
    }

    #[tokio::test]
    async fn gives_up_when_the_recording_never_finishes_saving() {
        let saved = wait_until_idle(
            || async { true },
            Duration::from_millis(1),
            Duration::from_millis(20),
        )
        .await;

        assert!(!saved);
    }
}
