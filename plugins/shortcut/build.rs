const COMMANDS: &[&str] = &[
    "register_hotkey",
    "unregister_hotkey",
    "configure",
    "validate",
    "set_active",
    "configure_coach",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
