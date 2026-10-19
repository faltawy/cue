const COMMANDS: &[&str] = &["get_state", "check", "restart", "set_token", "clear_token"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
