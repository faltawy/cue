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
    "claude_signed_in",
    "sign_in_to_claude",
    "claude_code_status",
    "update_claude_code",
    "claude_setup",
    "retry_claude_setup",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
