use tauri::{
    AppHandle, Result,
    menu::{MenuItem, MenuItemKind},
};
use tauri_plugin_coach::CoachPluginExt;

use super::MenuItemHandler;

pub struct TrayCoach;

impl MenuItemHandler for TrayCoach {
    const ID: &'static str = "anlg_tray_coach";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let item = MenuItem::with_id(app, Self::ID, "Coach", true, None::<&str>)?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        app.coach().toggle();
    }
}

pub struct TrayCoachProject;

impl MenuItemHandler for TrayCoachProject {
    const ID: &'static str = "anlg_tray_coach_project";

    fn build(app: &AppHandle<tauri::Wry>) -> Result<MenuItemKind<tauri::Wry>> {
        let item = MenuItem::with_id(app, Self::ID, "Coach Project…", true, None::<&str>)?;
        Ok(MenuItemKind::MenuItem(item))
    }

    fn handle(app: &AppHandle<tauri::Wry>) {
        app.coach().choose_project();
    }
}
