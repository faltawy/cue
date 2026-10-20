use tauri::{AppHandle, LogicalPosition, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{Endpoint, Error, Result, access};

pub const LABEL: &str = "coach";
const WIDTH: f64 = 440.0;
const HEIGHT: f64 = 680.0;
const MAX_WIDTH: f64 = 640.0;
const MAX_HEIGHT: f64 = 10_000.0;
const MARGIN: f64 = 24.0;

pub fn is_visible(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

pub fn is_focused(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL).is_some_and(|window| {
        window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false)
    })
}

pub fn hide(app: &AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window(LABEL) {
        window.hide()?;
    }
    Ok(())
}

fn parse(url: &str) -> Result<tauri::Url> {
    url.parse()
        .map_err(|error| Error::Other(format!("{error}")))
}

fn login(endpoint: &Endpoint) -> Result<tauri::Url> {
    parse(&access::login_url(&endpoint.url, &endpoint.token))
}

pub fn reload(app: &AppHandle, endpoint: &Endpoint) -> Result<()> {
    if let Some(window) = app.get_webview_window(LABEL) {
        window.navigate(login(endpoint)?)?;
    }
    Ok(())
}

pub fn show(app: &AppHandle, endpoint: &Endpoint) -> Result<()> {
    if let Some(window) = app.get_webview_window(LABEL) {
        if window.url()?.origin() != parse(&endpoint.url)?.origin() {
            window.navigate(login(endpoint)?)?;
        }
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(login(endpoint)?))
        .title("Coach")
        .inner_size(WIDTH, HEIGHT)
        .min_inner_size(360.0, 420.0)
        .max_inner_size(MAX_WIDTH, MAX_HEIGHT)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .visible(false)
        .build()?;

    place_at_right_edge(app, &window)?;
    join_full_screen_spaces(&window);

    let hide_on_close = window.clone();
    let focus_app = app.clone();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = hide_on_close.hide();
        }
        tauri::WindowEvent::Focused(true) => {
            if let Err(error) = tauri_specta::Event::emit(&crate::CoachFocused {}, &focus_app) {
                tracing::warn!(%error, "coach_focus_emit_failed");
            }
        }
        _ => {}
    });

    window.show()?;
    window.set_focus()?;
    Ok(())
}

fn place_at_right_edge(app: &AppHandle, window: &WebviewWindow) -> Result<()> {
    let Some(monitor) = app
        .cursor_position()
        .ok()
        .and_then(|cursor| app.monitor_from_point(cursor.x, cursor.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
    else {
        return Ok(());
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let size = area.size.to_logical::<f64>(scale);
    let origin = area.position.to_logical::<f64>(scale);
    window.set_position(LogicalPosition::new(
        origin.x + size.width - WIDTH - MARGIN,
        origin.y + MARGIN,
    ))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn join_full_screen_spaces(window: &WebviewWindow) {
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

    let target = window.clone();
    let result = window.run_on_main_thread(move || {
        let Ok(pointer) = target.ns_window() else {
            return;
        };
        let ns_window: &NSWindow = unsafe { &*pointer.cast() };
        ns_window.setCollectionBehavior(
            ns_window.collectionBehavior()
                | NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary,
        );
    });
    if let Err(error) = result {
        tracing::warn!(%error, "coach_full_screen_spaces_failed");
    }
}
