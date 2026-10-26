const COMMANDS: &[&str] = &[
    "complete_dictation",
    "llm_endpoint",
    "assistant_endpoint",
    "show_assistant",
    "get_settings",
    "set_settings",
    "choose_project",
    "probe_mcp_server",
    "set_mcp_secret",
    "mcp_statuses",
    "find_claude_connectors",
    "add_knowledge",
    "show",
    "show_for_recording",
    "claude_signed_in",
    "sign_in_to_claude",
    "claude_code_status",
    "update_claude_code",
    "claude_setup",
    "retry_claude_setup",
    "provider_account",
    "sign_in_to_provider",
    "provider_setup",
    "retry_provider_setup",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
