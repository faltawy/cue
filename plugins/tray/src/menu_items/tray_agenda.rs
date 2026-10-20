use tauri::{
    AppHandle, Result,
    menu::{MenuId, MenuItem, MenuItemKind},
};
use tauri_plugin_windows::{AppWindow, Navigate, WindowsPluginExt};

use crate::ext::scheduled_event;

const OPEN_PREFIX: &str = "anlg_tray_agenda_open_";
const RECORD_PREFIX: &str = "anlg_tray_agenda_record_";

#[derive(Debug, PartialEq, Eq)]
enum AgendaAction<'a> {
    OpenNote(&'a str),
    JoinAndRecord(&'a str),
}

pub fn build_agenda_item(
    app: &AppHandle<tauri::Wry>,
    event_id: &str,
    text: &str,
) -> Result<MenuItemKind<tauri::Wry>> {
    let item = MenuItem::with_id(
        app,
        format!("{OPEN_PREFIX}{event_id}"),
        text,
        true,
        None::<&str>,
    )?;
    Ok(MenuItemKind::MenuItem(item))
}

pub fn build_agenda_record_item(
    app: &AppHandle<tauri::Wry>,
    event_id: &str,
) -> Result<MenuItemKind<tauri::Wry>> {
    let item = MenuItem::with_id(
        app,
        format!("{RECORD_PREFIX}{event_id}"),
        "Join & record",
        true,
        None::<&str>,
    )?;
    Ok(MenuItemKind::MenuItem(item))
}

pub fn handle_agenda_menu_event(app: &AppHandle<tauri::Wry>, id: &MenuId) -> bool {
    let Some(action) = agenda_action(id) else {
        return false;
    };
    let (event_id, record) = match action {
        AgendaAction::OpenNote(event_id) => (event_id, false),
        AgendaAction::JoinAndRecord(event_id) => (event_id, true),
    };

    let Some(event) = scheduled_event(event_id) else {
        return true;
    };

    if app.windows().show(AppWindow::Main).is_ok() {
        let _ = app
            .windows()
            .emit_navigate(AppWindow::Main, event_navigation(event.id, record));
    }

    if record
        && let Some(meeting_link) = event.meeting_link.filter(|link| !link.trim().is_empty())
        && let Err(error) = open::that(meeting_link)
    {
        tracing::warn!(%error, "failed to open meeting from tray agenda");
    }

    true
}

fn agenda_action(id: &MenuId) -> Option<AgendaAction<'_>> {
    if let Some(event_id) = id.0.strip_prefix(OPEN_PREFIX) {
        Some(AgendaAction::OpenNote(event_id))
    } else {
        id.0.strip_prefix(RECORD_PREFIX)
            .map(AgendaAction::JoinAndRecord)
    }
}

fn event_navigation(event_id: String, record: bool) -> Navigate {
    let mut search = serde_json::Map::new();
    search.insert(
        "calendarEventId".to_string(),
        serde_json::Value::String(event_id),
    );
    if record {
        search.insert(
            "record".to_string(),
            serde_json::Value::String("true".to_string()),
        );
    }

    Navigate {
        path: "/app/new".to_string(),
        search: Some(search),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clicking_an_event_opens_its_note_without_recording() {
        let id = MenuId::new(format!("{OPEN_PREFIX}event-123"));
        assert_eq!(
            agenda_action(&id),
            Some(AgendaAction::OpenNote("event-123"))
        );

        let search = event_navigation("event-123".to_string(), false)
            .search
            .unwrap();
        assert_eq!(search["calendarEventId"], "event-123");
        assert!(!search.contains_key("record"));
    }

    #[test]
    fn join_and_record_is_its_own_item_and_records() {
        let id = MenuId::new(format!("{RECORD_PREFIX}event-123"));
        assert_eq!(
            agenda_action(&id),
            Some(AgendaAction::JoinAndRecord("event-123"))
        );

        let navigation = event_navigation("event-123".to_string(), true);
        let search = navigation.search.unwrap();
        assert_eq!(navigation.path, "/app/new");
        assert_eq!(search["calendarEventId"], "event-123");
        assert_eq!(search["record"], "true");
    }

    #[test]
    fn section_headings_are_not_agenda_actions() {
        assert_eq!(
            agenda_action(&MenuId::new("anlg_tray_agenda_section_0")),
            None
        );
    }
}
