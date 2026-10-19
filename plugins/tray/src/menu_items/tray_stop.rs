use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};
use tauri_specta::Event;

use super::MenuItemHandler;

pub struct TrayStop;

impl MenuItemHandler for TrayStop {
    const ID: &'static str = "anlg_tray_stop";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let item = MenuItem::with_id(app, Self::ID, "Stop recording", true, None::<&str>)?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        let request = crate::TrayStopRecording {};
        if let Err(error) = request.emit(app) {
            tracing::warn!(%error, "failed to request stop recording from tray");
        }
    }
}
