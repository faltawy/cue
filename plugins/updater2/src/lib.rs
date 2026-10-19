mod backend;
mod commands;
mod core;
mod error;
mod github;

use std::sync::Arc;
use std::time::Duration;

use tauri::Manager;

pub use backend::{BusyProbe, STABLE_IDENTIFIER, TauriBackend};
pub use core::{BusyReason, UpdateStatus, UpdaterState};
pub use error::{Error, Result};

const PLUGIN_NAME: &str = "updater2";
const FIRST_CHECK_DELAY: Duration = Duration::from_secs(30);
const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

pub type Updater = core::Core<TauriBackend>;

pub trait Updater2PluginExt {
    fn updater2(&self) -> Arc<Updater>;
}

impl<M: Manager<tauri::Wry>> Updater2PluginExt for M {
    fn updater2(&self) -> Arc<Updater> {
        self.state::<Arc<Updater>>().inner().clone()
    }
}

fn make_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .plugin_name(PLUGIN_NAME)
        .commands(tauri_specta::collect_commands![
            commands::get_state,
            commands::check,
            commands::restart,
            commands::set_token,
            commands::clear_token,
        ])
        .events(tauri_specta::collect_events![UpdaterState])
        .error_handling(tauri_specta::ErrorHandlingMode::Result)
}

pub fn init(probe: BusyProbe) -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let specta_builder = make_specta_builder();

    tauri::plugin::Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app, _api| {
            specta_builder.mount_events(app);
            let updater = Arc::new(core::Core::new(TauriBackend {
                app: app.clone(),
                probe: probe.clone(),
            }));
            app.manage(updater.clone());

            if updater.state().status != UpdateStatus::Unsupported {
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(FIRST_CHECK_DELAY).await;
                    loop {
                        updater.check().await;
                        tokio::time::sleep(CHECK_INTERVAL).await;
                    }
                });
            }
            Ok(())
        })
        .build()
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
