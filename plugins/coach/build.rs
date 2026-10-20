const COMMANDS: &[&str] = &[
    "llm_endpoint",
    "get_settings",
    "set_settings",
    "choose_project",
    "probe_mcp_server",
    "set_mcp_secret",
    "mcp_statuses",
    "find_claude_connectors",
    "add_knowledge",
    "show",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
