const COMMANDS: &[&str] = &["dispatch_event", "export_meeting_markdown"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
