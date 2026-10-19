const COMMANDS: &[&str] = &["get_state", "check", "restart"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
