use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};
use tauri_plugin_windows::{AppWindow, ChangelogState, OpenTab, TabInput, WindowsPluginExt};
use tauri_specta::Event;

use super::MenuItemHandler;

pub struct AppWhatsNew;

impl MenuItemHandler for AppWhatsNew {
    const ID: &'static str = "anlg_app_whats_new";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let item = MenuItem::with_id(app, Self::ID, "What's New", true, None::<&str>)?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        if let Err(error) = app.windows().show(AppWindow::Main) {
            tracing::warn!(%error, "failed to show the main window for What's New");
            return;
        }
        let event = OpenTab {
            tab: TabInput::Changelog {
                state: ChangelogState {
                    previous: None,
                    current: app.package_info().version.to_string(),
                },
            },
        };
        if let Err(error) = event.emit(app) {
            tracing::warn!(%error, "failed to open What's New");
        }
    }
}
