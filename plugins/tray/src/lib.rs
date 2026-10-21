mod commands;
mod events;
mod ext;
mod macos_position;
mod menu_items;
mod schedule;
mod tray_icon;

pub use events::*;
pub use ext::*;
pub use menu_items::{AnlgMenuItem, handle_agenda_menu_event};

const PLUGIN_NAME: &str = "anlg-tray";

pub type QuitHandler = std::sync::Arc<dyn Fn(&tauri::AppHandle<tauri::Wry>) + Send + Sync>;

struct QuitHandlerState(QuitHandler);

pub fn request_quit(app: &tauri::AppHandle<tauri::Wry>) {
    use tauri::Manager;

    match app.try_state::<QuitHandlerState>() {
        Some(handler) => (handler.0)(app),
        None => app.exit(0),
    }
}

pub fn init(quit: QuitHandler) -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::<tauri::Wry>::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app, _api| {
            use tauri::Manager;
            use tauri_specta::Event;

            app.manage(QuitHandlerState(quit));
            specta_builder.mount_events(app);
            let handle = app.clone();
            tauri_plugin_updater2::UpdaterState::listen(app, move |_| {
                let _ = handle.tray().refresh_menu();
            });
            let handle = app.clone();
            tauri::Listener::listen_any(app, tauri_plugin_coach::ATTENTION_EVENT, move |_| {
                // Off the emitting thread: the coach emits from its window's main-thread events.
                let handle = handle.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Err(error) = handle.tray().refresh_coach_state() {
                        tracing::warn!(%error, "failed to show the coach state in the menu bar");
                    }
                });
            });
            Ok(())
        })
        .build()
}

fn make_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .plugin_name(PLUGIN_NAME)
        .events(tauri_specta::collect_events![events::TrayStopRecording])
        .commands(tauri_specta::collect_commands![
            commands::set_tray_icon_visible,
            commands::set_tray_schedule,
            commands::set_tray_recording_title,
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn export_types() {
        const OUTPUT_FILE: &str = "./js/bindings.gen.ts";

        make_specta_builder()
            .export(
                specta_typescript::Typescript::default()
                    .formatter(specta_typescript::formatter::prettier)
                    .bigint(specta_typescript::BigIntExportBehavior::Number),
                OUTPUT_FILE,
            )
            .unwrap();

        let content = std::fs::read_to_string(OUTPUT_FILE).unwrap();
        std::fs::write(OUTPUT_FILE, format!("// @ts-nocheck\n{content}")).unwrap();
    }
}
