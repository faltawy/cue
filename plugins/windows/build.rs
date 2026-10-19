const COMMANDS: &[&str] = &[
    "window_show",
    "window_hide",
    "window_destroy",
    "window_navigate",
    "window_emit_navigate",
    "window_is_exists",
    "window_is_occluded",
    "webview_health_ack",
    "webview_health_ready",
    "window_set_frame_animated",
    "window_save_frame",
    "window_restore_frame_animated",
    "window_expand_width",
    "window_restore_width",
    "set_show_app_in_dock",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
