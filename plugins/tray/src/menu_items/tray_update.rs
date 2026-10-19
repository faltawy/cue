use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater2::{UpdateStatus, Updater2PluginExt};

use super::MenuItemHandler;

pub struct TrayUpdate;

impl TrayUpdate {
    pub fn ready(app: &AppHandle<tauri::Wry>) -> bool {
        matches!(app.updater2().state().status, UpdateStatus::Ready { .. })
    }
}

impl MenuItemHandler for TrayUpdate {
    const ID: &'static str = "anlg_tray_update";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let text = match app.updater2().state().status {
            UpdateStatus::Ready { version } => format!("Restart to Update to {version}"),
            _ => "Restart to Update".into(),
        };
        let item = MenuItem::with_id(app, Self::ID, text, true, None::<&str>)?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        let updater = app.updater2();
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = updater.restart().await {
                app.dialog()
                    .message(error.to_string())
                    .title("Update Ready")
                    .show(|_| {});
            }
        });
    }
}
