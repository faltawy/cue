use std::collections::BTreeMap;
use std::collections::hash_map::DefaultHasher;
use std::fs::OpenOptions;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::Result;
use crate::settings::ClaudeConnector;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ResolvedServer {
    pub name: String,
    pub url: String,
    pub headers: BTreeMap<String, String>,
    pub allow_changes: bool,
}

pub fn config_json(servers: &[ResolvedServer], connectors: &[ClaudeConnector]) -> serde_json::Value {
    let entries: serde_json::Map<String, serde_json::Value> = servers
        .iter()
        .map(|server| {
            (
                server.name.clone(),
                serde_json::json!({
                    "type": "http",
                    "url": server.url,
                    "headers": server.headers,
                }),
            )
        })
        .chain(connectors.iter().map(|connector| {
            (
                connector.server_name(),
                serde_json::json!({
                    "type": "claudeai-proxy",
                    "url": connector.url,
                    "id": connector.id,
                }),
            )
        }))
        .collect();
    serde_json::json!({ "mcpServers": entries })
}

pub fn allowed_changes(servers: &[ResolvedServer], connectors: &[ClaudeConnector]) -> Vec<String> {
    servers
        .iter()
        .filter(|server| server.allow_changes)
        .map(|server| server.name.clone())
        .chain(
            connectors
                .iter()
                .filter(|connector| connector.allow_changes)
                .map(ClaudeConnector::server_name),
        )
        .collect()
}

pub fn fingerprint(servers: &[ResolvedServer], connectors: &[ClaudeConnector]) -> u64 {
    let mut hasher = DefaultHasher::new();
    servers.hash(&mut hasher);
    connectors.hash(&mut hasher);
    hasher.finish()
}

pub fn context_fingerprint(instructions: &str, knowledge: &[String]) -> u64 {
    let mut hasher = DefaultHasher::new();
    instructions.hash(&mut hasher);
    knowledge.hash(&mut hasher);
    hasher.finish()
}

fn replace_private_file(dir: &Path, name: &str, contents: Option<&[u8]>) -> Result<Option<PathBuf>> {
    if dir.exists() {
        std::fs::remove_dir_all(dir)?;
    }
    let Some(contents) = contents else {
        return Ok(None);
    };
    std::fs::create_dir_all(dir)?;
    let path = dir.join(name);
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut file = options.open(&path)?;
    file.write_all(contents)?;
    Ok(Some(path))
}

pub fn write_config(
    dir: &Path,
    servers: &[ResolvedServer],
    connectors: &[ClaudeConnector],
) -> Result<Option<PathBuf>> {
    let config = (!servers.is_empty() || !connectors.is_empty())
        .then(|| serde_json::to_vec(&config_json(servers, connectors)))
        .transpose()?;
    replace_private_file(dir, "mcp.json", config.as_deref())
}

pub fn write_instructions(dir: &Path, instructions: &str) -> Result<Option<PathBuf>> {
    let contents = (!instructions.trim().is_empty()).then_some(instructions.as_bytes());
    replace_private_file(dir, "instructions.md", contents)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server(name: &str, allow_changes: bool) -> ResolvedServer {
        ResolvedServer {
            name: name.into(),
            url: format!("http://127.0.0.1:7777/{name}"),
            headers: BTreeMap::from([("Authorization".into(), format!("Bearer {name}"))]),
            allow_changes,
        }
    }

    #[test]
    fn servers_reach_the_coach_in_claude_code_shape() {
        assert_eq!(
            config_json(&[server("clients", true)], &[]),
            serde_json::json!({
                "mcpServers": {
                    "clients": {
                        "type": "http",
                        "url": "http://127.0.0.1:7777/clients",
                        "headers": { "Authorization": "Bearer clients" },
                    }
                }
            })
        );
    }

    fn gmail(allow_changes: bool) -> ClaudeConnector {
        ClaudeConnector {
            name: "Gmail".into(),
            id: "mcpsrv_01gmail".into(),
            url: "https://gmailmcp.googleapis.com/mcp/v1".into(),
            allow_changes,
        }
    }

    #[test]
    fn turned_on_connectors_reach_the_coach_as_claude_ai_proxies() {
        let root = tempfile::tempdir().unwrap();
        let path = write_config(&root.path().join("mcp"), &[], &[gmail(false)])
            .unwrap()
            .unwrap();

        let written: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(
            written,
            serde_json::json!({
                "mcpServers": {
                    "claude_ai_Gmail": {
                        "type": "claudeai-proxy",
                        "url": "https://gmailmcp.googleapis.com/mcp/v1",
                        "id": "mcpsrv_01gmail",
                    }
                }
            })
        );
        assert_eq!(
            allowed_changes(&[server("docs", false)], &[gmail(true)]),
            vec!["claude_ai_Gmail".to_string()]
        );
        assert!(allowed_changes(&[], &[gmail(false)]).is_empty());
        assert_ne!(fingerprint(&[], &[]), fingerprint(&[], &[gmail(false)]));
        assert_ne!(
            fingerprint(&[], &[gmail(false)]),
            fingerprint(&[], &[gmail(true)])
        );
    }

    #[test]
    fn instructions_are_written_verbatim_to_a_private_file_and_blank_ones_are_not() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("context");
        let text = "I'm the CTO.\n\n- never promise dates\n";

        let path = write_instructions(&dir, text).unwrap().unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), text);
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }

        assert_eq!(write_instructions(&dir, " \n").unwrap(), None);
        assert!(!path.exists());
        assert_ne!(
            context_fingerprint("", &[]),
            context_fingerprint(text, &[])
        );
        assert_ne!(
            context_fingerprint("", &[]),
            context_fingerprint("", &["/work/kb".into()])
        );
    }

    #[test]
    fn read_only_servers_are_not_in_the_change_list() {
        let servers = [server("docs", false), server("clients", true)];
        assert_eq!(allowed_changes(&servers, &[]), vec!["clients".to_string()]);
    }

    #[test]
    fn fingerprint_changes_when_a_token_or_switch_changes() {
        let base = [server("clients", false)];
        let allowed = [server("clients", true)];
        let rotated = [ResolvedServer {
            headers: BTreeMap::from([("Authorization".into(), "Bearer new".into())]),
            ..server("clients", false)
        }];

        assert_ne!(fingerprint(&base, &[]), fingerprint(&allowed, &[]));
        assert_ne!(fingerprint(&base, &[]), fingerprint(&rotated, &[]));
        assert_eq!(
            fingerprint(&base, &[]),
            fingerprint(&[server("clients", false)], &[])
        );
    }

    #[test]
    fn config_file_is_private_and_replaced_on_each_launch() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("mcp");

        let path = write_config(&dir, &[server("clients", false)], &[])
            .unwrap()
            .unwrap();
        let written: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(written, config_json(&[server("clients", false)], &[]));
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }

        assert_eq!(write_config(&dir, &[], &[]).unwrap(), None);
        assert!(!path.exists());
    }
}
