use super::DockMenuItem;

pub struct DockRestart;

impl DockMenuItem for DockRestart {
    const SEPARATOR_BEFORE: bool = true;

    fn title(app: &tauri::AppHandle<tauri::Wry>) -> String {
        format!("Restart {}", app.package_info().name)
    }

    fn handle(app: &tauri::AppHandle<tauri::Wry>) {
        app.restart();
    }
}
