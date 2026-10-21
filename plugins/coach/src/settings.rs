use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use crate::auth::{self, McpAuth, SecretStore};
use crate::{Error, Result};

const FILE_NAME: &str = "coach.json";
const SERIES_KEY: &str = "series_projects";
const LEGACY_CHECK_IN_KEY: &str = "check_in_minutes";
const DEFAULT_NUDGE_LIMIT_CENTS: u32 = 50;
const MAX_NUDGE_LIMIT_CENTS: u32 = 10_000;
const RESERVED_SERVER: &str = "meeting";
const CONNECTOR_PREFIX: &str = "claude_ai_";

#[derive(
    Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type,
)]
#[serde(rename_all = "lowercase")]
pub enum CoachProvider {
    #[default]
    Claude,
    Codex,
}

impl CoachProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
        }
    }
}

#[derive(
    Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type,
)]
#[serde(rename_all = "lowercase")]
pub enum ClaudeModel {
    #[default]
    Sonnet,
    Opus,
    Haiku,
}

impl ClaudeModel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sonnet => "sonnet",
            Self::Opus => "opus",
            Self::Haiku => "haiku",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct McpServer {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub auth: McpAuth,
    #[serde(default)]
    pub allow_changes: bool,
    #[serde(default = "enabled_by_default")]
    pub enabled: bool,
}

fn enabled_by_default() -> bool {
    true
}

impl McpServer {
    fn validate(&self) -> Result<()> {
        let name = &self.name;
        let name_ok = !name.is_empty()
            && !name.contains("__")
            && name
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-');
        if !name_ok {
            return Err(Error::Other(format!(
                "\"{name}\" is not a valid tool name: use lowercase letters, digits, - or _"
            )));
        }
        if name == RESERVED_SERVER {
            return Err(Error::Other(format!(
                "\"{RESERVED_SERVER}\" is reserved for the coach's own tools"
            )));
        }
        if name.starts_with(CONNECTOR_PREFIX) {
            return Err(Error::Other(format!(
                "names starting with \"{CONNECTOR_PREFIX}\" are reserved for Claude connectors"
            )));
        }
        validate_url(&self.url)?;
        match &self.auth {
            McpAuth::Header { name: header }
                if header.is_empty()
                    || !header
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') =>
            {
                Err(Error::Other(format!(
                    "\"{header}\" is not a valid header name"
                )))
            }
            McpAuth::Basic { username } if username.is_empty() || username.contains(':') => {
                Err(Error::Other("enter a user name without \":\"".to_string()))
            }
            _ => Ok(()),
        }
    }
}

fn validate_url(value: &str) -> Result<()> {
    let url =
        tauri::Url::parse(value).map_err(|error| Error::Other(format!("{value}: {error}")))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(Error::Other(format!(
            "{value} must be an http or https address"
        )));
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct FoundConnector {
    pub name: String,
    pub id: String,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct ClaudeConnector {
    pub name: String,
    pub id: String,
    pub url: String,
    #[serde(default)]
    pub allow_changes: bool,
}

impl ClaudeConnector {
    pub fn server_name(&self) -> String {
        let words: Vec<&str> = self
            .name
            .split(|c: char| !c.is_ascii_alphanumeric())
            .filter(|word| !word.is_empty())
            .collect();
        format!("{CONNECTOR_PREFIX}{}", words.join("_"))
    }

    fn validate(&self) -> Result<()> {
        if self.server_name() == CONNECTOR_PREFIX {
            return Err(Error::Other(format!(
                "\"{}\" is not a usable connector name",
                self.name
            )));
        }
        if self.id.is_empty()
            || !self
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_')
        {
            return Err(Error::Other(format!(
                "\"{}\" is not a Claude connector id",
                self.id
            )));
        }
        validate_url(&self.url)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(default)]
pub struct CoachSettings {
    pub project: Option<String>,
    pub model: ClaudeModel,
    pub provider: CoachProvider,
    pub codex_model: String,
    pub nudges: bool,
    pub nudge_limit_cents: u32,
    pub mcp_servers: Vec<McpServer>,
    pub claude_connectors: Vec<ClaudeConnector>,
    pub instructions: String,
    pub knowledge: Vec<String>,
    pub web_access: bool,
}

impl Default for CoachSettings {
    fn default() -> Self {
        Self {
            project: None,
            model: ClaudeModel::Sonnet,
            provider: CoachProvider::Claude,
            codex_model: String::new(),
            nudges: true,
            nudge_limit_cents: DEFAULT_NUDGE_LIMIT_CENTS,
            mcp_servers: Vec::new(),
            claude_connectors: Vec::new(),
            instructions: String::new(),
            knowledge: Vec::new(),
            web_access: true,
        }
    }
}

impl CoachSettings {
    pub fn selected_model(&self) -> &str {
        match self.provider {
            CoachProvider::Claude => self.model.as_str(),
            CoachProvider::Codex => &self.codex_model,
        }
    }

    pub fn project_dir(&self) -> Option<PathBuf> {
        self.project
            .as_deref()
            .map(PathBuf::from)
            .filter(|path| path.is_dir())
    }

    fn validate(&self) -> Result<()> {
        if !(1..=MAX_NUDGE_LIMIT_CENTS).contains(&self.nudge_limit_cents) {
            return Err(Error::Other(format!(
                "the spend limit must be between $0.01 and ${}",
                MAX_NUDGE_LIMIT_CENTS / 100
            )));
        }
        if let Some(project) = &self.project
            && !Path::new(project).is_dir()
        {
            return Err(Error::Other(format!("{project} is not a folder")));
        }
        let mut names = BTreeSet::new();
        for server in &self.mcp_servers {
            server.validate()?;
            if !names.insert(server.name.as_str()) {
                return Err(Error::Other(format!(
                    "two tools are named \"{}\"",
                    server.name
                )));
            }
        }
        let mut knowledge = BTreeSet::new();
        for entry in &self.knowledge {
            if !Path::new(entry).is_absolute() || !Path::new(entry).exists() {
                return Err(Error::Other(format!("{entry} is not a file or folder")));
            }
            if !knowledge.insert(entry.as_str()) {
                return Err(Error::Other(format!("{entry} is listed twice")));
            }
        }
        let mut connectors = BTreeSet::new();
        for connector in &self.claude_connectors {
            connector.validate()?;
            if !connectors.insert(connector.server_name()) {
                return Err(Error::Other(format!(
                    "the Claude connector \"{}\" is listed twice",
                    connector.name
                )));
            }
        }
        Ok(())
    }
}

fn move_legacy_headers(raw: &mut serde_json::Value, secrets: &dyn SecretStore) -> Result<bool> {
    let Some(servers) = raw
        .get_mut("mcp_servers")
        .and_then(serde_json::Value::as_array_mut)
    else {
        return Ok(false);
    };
    let mut moved = false;
    for server in servers
        .iter_mut()
        .filter_map(serde_json::Value::as_object_mut)
    {
        let Some(headers) = server.remove("headers") else {
            continue;
        };
        moved = true;
        let headers: BTreeMap<String, String> = serde_json::from_value(headers)?;
        let name = server
            .get("name")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string();
        if let Some((auth, secret)) = auth::legacy_auth(&headers) {
            auth::write_secret(secrets, &name, &secret)?;
            server.insert("auth".into(), serde_json::to_value(auth)?);
        }
    }
    Ok(moved)
}

fn retire_oauth(raw: &mut serde_json::Value, secrets: &dyn SecretStore) -> Result<bool> {
    let Some(servers) = raw
        .get_mut("mcp_servers")
        .and_then(serde_json::Value::as_array_mut)
    else {
        return Ok(false);
    };
    let mut retired = false;
    for server in servers
        .iter_mut()
        .filter_map(serde_json::Value::as_object_mut)
    {
        let oauth = server
            .get("auth")
            .and_then(|auth| auth.get("kind"))
            .and_then(serde_json::Value::as_str)
            == Some("oauth");
        if !oauth {
            continue;
        }
        retired = true;
        if let Some(name) = server.get("name").and_then(serde_json::Value::as_str) {
            secrets.delete(name)?;
        }
        server.insert("auth".into(), serde_json::to_value(McpAuth::Bearer)?);
    }
    Ok(retired)
}

fn migrate_check_ins(raw: &mut serde_json::Value) -> bool {
    let Some(settings) = raw.as_object_mut() else {
        return false;
    };
    let Some(minutes) = settings.remove(LEGACY_CHECK_IN_KEY) else {
        return false;
    };
    if !settings.contains_key("nudges") {
        let on = minutes.as_u64().is_none_or(|minutes| minutes > 0);
        settings.insert("nudges".into(), serde_json::Value::Bool(on));
    }
    true
}

fn file_lock() -> Result<MutexGuard<'static, ()>> {
    static FILE: Mutex<()> = Mutex::new(());
    FILE.lock().map_err(|error| Error::Other(error.to_string()))
}

fn read_raw(config_dir: &Path) -> Result<Option<serde_json::Value>> {
    let path = config_dir.join(FILE_NAME);
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&std::fs::read(&path)?)?))
}

fn write_raw(config_dir: &Path, raw: &serde_json::Value) -> Result<()> {
    std::fs::create_dir_all(config_dir)?;
    std::fs::write(config_dir.join(FILE_NAME), serde_json::to_vec_pretty(raw)?)?;
    Ok(())
}

pub fn load(config_dir: &Path, secrets: &dyn SecretStore) -> Result<CoachSettings> {
    let _file = file_lock()?;
    let Some(mut raw) = read_raw(config_dir)? else {
        return Ok(CoachSettings::default());
    };
    let moved = move_legacy_headers(&mut raw, secrets)?;
    let retired = retire_oauth(&mut raw, secrets)?;
    let migrated = migrate_check_ins(&mut raw);
    if moved || retired || migrated {
        write_raw(config_dir, &raw)?;
    }
    let mut settings: CoachSettings = serde_json::from_value(raw)?;
    settings.project = settings
        .project_dir()
        .map(|dir| dir.to_string_lossy().into_owned());
    settings
        .knowledge
        .retain(|entry| Path::new(entry).is_absolute() && Path::new(entry).exists());
    if !(1..=MAX_NUDGE_LIMIT_CENTS).contains(&settings.nudge_limit_cents) {
        settings.nudge_limit_cents = DEFAULT_NUDGE_LIMIT_CENTS;
    }
    Ok(settings)
}

pub fn save(config_dir: &Path, settings: &CoachSettings) -> Result<()> {
    settings.validate()?;
    let _file = file_lock()?;
    let mut next = serde_json::to_value(settings)?;
    if let Some(series) = read_raw(config_dir)?
        .and_then(|mut raw| raw.get_mut(SERIES_KEY).map(serde_json::Value::take))
    {
        next[SERIES_KEY] = series;
    }
    write_raw(config_dir, &next)
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SeriesProject {
    pub project: String,
    pub label: String,
}

pub type SeriesProjects = BTreeMap<String, SeriesProject>;

pub fn load_series_projects(config_dir: &Path) -> Result<SeriesProjects> {
    let _file = file_lock()?;
    let Some(series) = read_raw(config_dir)?
        .and_then(|mut raw| raw.get_mut(SERIES_KEY).map(serde_json::Value::take))
    else {
        return Ok(SeriesProjects::new());
    };
    let mut projects: SeriesProjects = serde_json::from_value(series)?;
    projects.retain(|_, series| Path::new(&series.project).is_dir());
    Ok(projects)
}

pub fn set_series_project(
    config_dir: &Path,
    key: &str,
    project: Option<SeriesProject>,
) -> Result<()> {
    if let Some(series) = &project
        && !Path::new(&series.project).is_dir()
    {
        return Err(Error::Other(format!("{} is not a folder", series.project)));
    }
    let _file = file_lock()?;
    let mut raw = read_raw(config_dir)?.unwrap_or_else(|| serde_json::json!({}));
    let object = raw
        .as_object_mut()
        .ok_or_else(|| Error::Other(format!("{FILE_NAME} is not a JSON object")))?;
    let series = object
        .entry(SERIES_KEY)
        .or_insert_with(|| serde_json::json!({}));
    let series = series
        .as_object_mut()
        .ok_or_else(|| Error::Other(format!("{SERIES_KEY} in {FILE_NAME} is not an object")))?;
    match project {
        Some(project) => series.insert(key.to_string(), serde_json::to_value(project)?),
        None => series.remove(key),
    };
    write_raw(config_dir, &raw)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::McpSecret;
    use crate::auth::memory::MemorySecrets;

    fn with_project(project: &Path) -> CoachSettings {
        CoachSettings {
            project: Some(project.to_string_lossy().into_owned()),
            model: ClaudeModel::Opus,
            provider: CoachProvider::Claude,
            codex_model: String::new(),
            nudges: false,
            nudge_limit_cents: 120,
            mcp_servers: Vec::new(),
            claude_connectors: Vec::new(),
            instructions: String::new(),
            knowledge: Vec::new(),
            web_access: false,
        }
    }

    #[test]
    fn missing_file_gives_sonnet_nudges_on_with_a_fifty_cent_limit_and_no_project() {
        let config = tempfile::tempdir().unwrap();
        assert_eq!(
            load(config.path(), &MemorySecrets::default()).unwrap(),
            CoachSettings {
                project: None,
                model: ClaudeModel::Sonnet,
                provider: CoachProvider::Claude,
                codex_model: String::new(),
                nudges: true,
                nudge_limit_cents: 50,
                mcp_servers: Vec::new(),
                claude_connectors: Vec::new(),
                instructions: String::new(),
                knowledge: Vec::new(),
                web_access: true,
            }
        );
    }

    #[test]
    fn switching_providers_preserves_legacy_claude_model_and_codex_preference() {
        let config = tempfile::tempdir().unwrap();
        let secrets = MemorySecrets::default();
        std::fs::write(config.path().join(FILE_NAME), r#"{"model":"opus"}"#).unwrap();
        let mut settings = load(config.path(), &secrets).unwrap();
        assert_eq!(settings.provider, CoachProvider::Claude);
        assert_eq!(settings.selected_model(), "opus");
        settings.provider = CoachProvider::Codex;
        settings.codex_model = "custom-codex-model".into();
        save(config.path(), &settings).unwrap();
        let mut restored = load(config.path(), &secrets).unwrap();
        assert_eq!(restored.provider, CoachProvider::Codex);
        assert_eq!(restored.selected_model(), "custom-codex-model");
        restored.provider = CoachProvider::Claude;
        save(config.path(), &restored).unwrap();
        let restored = load(config.path(), &secrets).unwrap();
        assert_eq!(restored.selected_model(), "opus");
        assert_eq!(restored.codex_model, "custom-codex-model");
    }

    #[test]
    fn saved_settings_are_loaded_back() {
        let config = tempfile::tempdir().unwrap();
        let project = tempfile::tempdir().unwrap();
        let settings = with_project(project.path());

        save(config.path(), &settings).unwrap();

        assert_eq!(
            load(config.path(), &MemorySecrets::default()).unwrap(),
            settings
        );
    }

    #[test]
    fn a_file_written_before_settings_existed_keeps_its_project() {
        let config = tempfile::tempdir().unwrap();
        let project = tempfile::tempdir().unwrap();
        std::fs::write(
            config.path().join(FILE_NAME),
            format!(r#"{{"project": "{}"}}"#, project.path().display()),
        )
        .unwrap();

        let settings = load(config.path(), &MemorySecrets::default()).unwrap();

        assert_eq!(
            settings.project.as_deref(),
            Some(project.path().to_str().unwrap())
        );
        assert_eq!(settings.model, ClaudeModel::Sonnet);
        assert!(settings.nudges);
        assert_eq!(settings.nudge_limit_cents, 50);
        assert!(settings.web_access);
    }

    #[test]
    fn old_check_in_intervals_become_the_nudges_switch_and_leave_the_file() {
        for (minutes, nudges) in [("0", false), ("2", true), ("10", true)] {
            let config = tempfile::tempdir().unwrap();
            std::fs::write(
                config.path().join(FILE_NAME),
                format!(r#"{{"model": "opus", "check_in_minutes": {minutes}}}"#),
            )
            .unwrap();

            let settings = load(config.path(), &MemorySecrets::default()).unwrap();

            assert_eq!(settings.nudges, nudges, "check_in_minutes {minutes}");
            assert_eq!(settings.nudge_limit_cents, 50);
            assert_eq!(settings.model, ClaudeModel::Opus);
            let file = std::fs::read_to_string(config.path().join(FILE_NAME)).unwrap();
            assert!(!file.contains("check_in_minutes"), "{file}");
            assert_eq!(
                load(config.path(), &MemorySecrets::default()).unwrap(),
                settings
            );
        }
    }

    #[test]
    fn a_saved_nudges_switch_wins_over_a_leftover_check_in_interval() {
        let config = tempfile::tempdir().unwrap();
        std::fs::write(
            config.path().join(FILE_NAME),
            r#"{"nudges": true, "check_in_minutes": 0}"#,
        )
        .unwrap();

        assert!(
            load(config.path(), &MemorySecrets::default())
                .unwrap()
                .nudges
        );
    }

    #[test]
    fn a_project_folder_that_no_longer_exists_is_dropped() {
        let config = tempfile::tempdir().unwrap();
        let project = tempfile::tempdir().unwrap();
        save(config.path(), &with_project(project.path())).unwrap();
        assert!(
            load(config.path(), &MemorySecrets::default())
                .unwrap()
                .project
                .is_some()
        );

        drop(project);

        let settings = load(config.path(), &MemorySecrets::default()).unwrap();
        assert_eq!(settings.project, None);
        assert_eq!(settings.model, ClaudeModel::Opus);
    }

    #[test]
    fn invalid_settings_are_refused_and_nothing_is_written() {
        let config = tempfile::tempdir().unwrap();
        let project = tempfile::tempdir().unwrap();

        let no_limit = CoachSettings {
            nudge_limit_cents: 0,
            ..with_project(project.path())
        };
        let too_high = CoachSettings {
            nudge_limit_cents: 10_001,
            ..with_project(project.path())
        };
        let not_a_folder = CoachSettings {
            project: Some("/definitely/not/here".into()),
            ..CoachSettings::default()
        };

        assert!(save(config.path(), &no_limit).is_err());
        assert!(save(config.path(), &too_high).is_err());
        assert!(save(config.path(), &not_a_folder).is_err());
        assert!(!config.path().join(FILE_NAME).exists());
        save(config.path(), &with_project(project.path())).unwrap();
        assert!(config.path().join(FILE_NAME).exists());
    }

    fn server(name: &str, url: &str) -> McpServer {
        McpServer {
            name: name.into(),
            url: url.into(),
            auth: McpAuth::None,
            allow_changes: false,
            enabled: true,
        }
    }

    #[test]
    fn mcp_servers_round_trip_with_auth_kind_and_switches() {
        let config = tempfile::tempdir().unwrap();
        let settings = CoachSettings {
            mcp_servers: vec![
                McpServer {
                    auth: McpAuth::Bearer,
                    allow_changes: true,
                    ..server("clients", "http://127.0.0.1:7777/mcp")
                },
                McpServer {
                    enabled: false,
                    ..server("docs-search", "https://example.com/mcp")
                },
            ],
            ..CoachSettings::default()
        };

        save(config.path(), &settings).unwrap();

        assert_eq!(
            load(config.path(), &MemorySecrets::default()).unwrap(),
            settings
        );
    }

    #[test]
    fn a_server_saved_without_switches_is_enabled_and_read_only() {
        let config = tempfile::tempdir().unwrap();
        std::fs::write(
            config.path().join(FILE_NAME),
            r#"{"mcp_servers": [{"name": "clients", "url": "http://127.0.0.1:7777/mcp"}]}"#,
        )
        .unwrap();

        assert_eq!(
            load(config.path(), &MemorySecrets::default())
                .unwrap()
                .mcp_servers,
            vec![server("clients", "http://127.0.0.1:7777/mcp")]
        );
    }

    #[test]
    fn invalid_mcp_servers_are_refused() {
        let config = tempfile::tempdir().unwrap();
        let with = |servers: Vec<McpServer>| CoachSettings {
            mcp_servers: servers,
            ..CoachSettings::default()
        };
        let bad_header = McpServer {
            auth: McpAuth::Header {
                name: "Bad Header".into(),
            },
            ..server("clients", "http://127.0.0.1:7777/mcp")
        };
        let bad_user = McpServer {
            auth: McpAuth::Basic {
                username: "a:b".into(),
            },
            ..server("clients", "http://127.0.0.1:7777/mcp")
        };

        for invalid in [
            with(vec![server("", "http://127.0.0.1:1/mcp")]),
            with(vec![server("Clients", "http://127.0.0.1:1/mcp")]),
            with(vec![server("a__b", "http://127.0.0.1:1/mcp")]),
            with(vec![server("meeting", "http://127.0.0.1:1/mcp")]),
            with(vec![server("clients", "ftp://127.0.0.1/mcp")]),
            with(vec![server("clients", "not a url")]),
            with(vec![
                server("clients", "http://127.0.0.1:1/mcp"),
                server("clients", "http://127.0.0.1:2/mcp"),
            ]),
            with(vec![bad_header]),
            with(vec![bad_user]),
            with(vec![server("claude_ai_gmail", "http://127.0.0.1:1/mcp")]),
        ] {
            assert!(save(config.path(), &invalid).is_err(), "{invalid:?}");
        }
        assert!(!config.path().join(FILE_NAME).exists());

        save(
            config.path(),
            &with(vec![
                server("clients", "http://127.0.0.1:7777/mcp"),
                server("my_docs-2", "https://docs.example.com/mcp"),
            ]),
        )
        .unwrap();
        assert!(config.path().join(FILE_NAME).exists());
    }

    #[test]
    fn instructions_and_knowledge_round_trip_and_vanished_knowledge_is_dropped() {
        let config = tempfile::tempdir().unwrap();
        let folder = tempfile::tempdir().unwrap();
        let file = tempfile::NamedTempFile::new().unwrap();
        let path = |p: &Path| p.to_string_lossy().into_owned();
        let settings = CoachSettings {
            instructions: "I'm the CTO.\n\n- never promise dates".into(),
            knowledge: vec![path(folder.path()), path(file.path())],
            ..CoachSettings::default()
        };

        save(config.path(), &settings).unwrap();
        assert_eq!(
            load(config.path(), &MemorySecrets::default()).unwrap(),
            settings
        );

        drop(folder);
        assert_eq!(
            load(config.path(), &MemorySecrets::default())
                .unwrap()
                .knowledge,
            vec![path(file.path())]
        );
    }

    #[test]
    fn knowledge_that_does_not_exist_or_is_relative_is_refused() {
        let config = tempfile::tempdir().unwrap();
        let folder = tempfile::tempdir().unwrap();
        let existing = folder.path().to_string_lossy().into_owned();
        let with = |knowledge: Vec<String>| CoachSettings {
            knowledge,
            ..CoachSettings::default()
        };

        for invalid in [
            with(vec!["/definitely/not/here".into()]),
            with(vec!["relative/notes".into()]),
            with(vec![existing.clone(), existing.clone()]),
        ] {
            assert!(save(config.path(), &invalid).is_err(), "{invalid:?}");
        }
        assert!(!config.path().join(FILE_NAME).exists());
        save(config.path(), &with(vec![existing])).unwrap();
    }

    fn connector(name: &str, id: &str) -> ClaudeConnector {
        ClaudeConnector {
            name: name.into(),
            id: id.into(),
            url: "https://gmailmcp.googleapis.com/mcp/v1".into(),
            allow_changes: false,
        }
    }

    #[test]
    fn claude_connectors_round_trip_and_get_tool_safe_server_names() {
        let config = tempfile::tempdir().unwrap();
        let settings = CoachSettings {
            claude_connectors: vec![
                ClaudeConnector {
                    allow_changes: true,
                    ..connector("Gmail", "mcpsrv_01gmail")
                },
                connector("Gmail (2)", "mcpsrv_02gmail"),
                connector("Interactive Brokers (IBKR)", "mcpsrv_01ibkr"),
            ],
            ..CoachSettings::default()
        };

        save(config.path(), &settings).unwrap();

        let loaded = load(config.path(), &MemorySecrets::default()).unwrap();
        assert_eq!(loaded, settings);
        assert_eq!(
            loaded
                .claude_connectors
                .iter()
                .map(ClaudeConnector::server_name)
                .collect::<Vec<_>>(),
            [
                "claude_ai_Gmail",
                "claude_ai_Gmail_2",
                "claude_ai_Interactive_Brokers_IBKR"
            ]
        );
    }

    #[test]
    fn invalid_claude_connectors_are_refused() {
        let config = tempfile::tempdir().unwrap();
        let with = |connectors: Vec<ClaudeConnector>| CoachSettings {
            claude_connectors: connectors,
            ..CoachSettings::default()
        };

        for invalid in [
            with(vec![
                connector("Gmail", "mcpsrv_01"),
                connector("Gmail", "mcpsrv_02"),
            ]),
            with(vec![connector("()", "mcpsrv_01")]),
            with(vec![connector("Gmail", "")]),
            with(vec![connector("Gmail", "mcpsrv_01\"x")]),
            with(vec![ClaudeConnector {
                url: "not a url".into(),
                ..connector("Gmail", "mcpsrv_01")
            }]),
        ] {
            assert!(save(config.path(), &invalid).is_err(), "{invalid:?}");
        }
        assert!(!config.path().join(FILE_NAME).exists());

        save(config.path(), &with(vec![connector("Gmail", "mcpsrv_01")])).unwrap();
        assert!(config.path().join(FILE_NAME).exists());
    }

    #[test]
    fn plaintext_headers_from_older_files_move_to_the_keychain_and_leave_the_file() {
        let config = tempfile::tempdir().unwrap();
        let secrets = MemorySecrets::default();
        std::fs::write(
            config.path().join(FILE_NAME),
            r#"{"mcp_servers": [
                {"name": "clients", "url": "http://127.0.0.1:7777/mcp",
                 "headers": {"Authorization": "Bearer s3cret"}},
                {"name": "docs", "url": "https://docs.example.com/mcp", "headers": {}}
            ]}"#,
        )
        .unwrap();

        let settings = load(config.path(), &secrets).unwrap();

        assert_eq!(settings.mcp_servers[0].auth, McpAuth::Bearer);
        assert_eq!(settings.mcp_servers[1].auth, McpAuth::None);
        assert_eq!(
            auth::read_secret(&secrets, "clients").unwrap(),
            Some(McpSecret::Token {
                token: "s3cret".into()
            })
        );
        assert_eq!(auth::read_secret(&secrets, "docs").unwrap(), None);
        let file = std::fs::read_to_string(config.path().join(FILE_NAME)).unwrap();
        assert!(!file.contains("s3cret"), "{file}");
        assert!(!file.contains("headers"), "{file}");
        assert_eq!(load(config.path(), &secrets).unwrap(), settings);
    }

    #[test]
    fn browser_sign_in_servers_become_token_servers_and_drop_their_stored_sign_in() {
        let config = tempfile::tempdir().unwrap();
        let secrets = MemorySecrets::default();
        secrets
            .set(
                "linear",
                r#"{"kind": "oauth", "access_token": "a", "client_id": "c"}"#,
            )
            .unwrap();
        auth::write_secret(
            &secrets,
            "clients",
            &McpSecret::Token {
                token: "keep".into(),
            },
        )
        .unwrap();
        std::fs::write(
            config.path().join(FILE_NAME),
            r#"{"mcp_servers": [
                {"name": "linear", "url": "https://mcp.linear.app/mcp",
                 "auth": {"kind": "oauth", "server": {"issuer": "https://mcp.linear.app"}}},
                {"name": "clients", "url": "http://127.0.0.1:7777/mcp", "auth": {"kind": "bearer"}}
            ]}"#,
        )
        .unwrap();

        let settings = load(config.path(), &secrets).unwrap();

        assert_eq!(settings.mcp_servers[0].auth, McpAuth::Bearer);
        assert_eq!(auth::read_secret(&secrets, "linear").unwrap(), None);
        assert_eq!(
            auth::read_secret(&secrets, "clients").unwrap(),
            Some(McpSecret::Token {
                token: "keep".into()
            })
        );
        let file = std::fs::read_to_string(config.path().join(FILE_NAME)).unwrap();
        assert!(!file.contains("oauth"), "{file}");
        assert_eq!(load(config.path(), &secrets).unwrap(), settings);
    }

    fn series(project: &Path, label: &str) -> SeriesProject {
        SeriesProject {
            project: project.to_string_lossy().into_owned(),
            label: label.into(),
        }
    }

    #[test]
    fn series_projects_survive_a_settings_save_from_the_settings_page() {
        let config = tempfile::tempdir().unwrap();
        let default_project = tempfile::tempdir().unwrap();
        let acme = tempfile::tempdir().unwrap();
        save(config.path(), &with_project(default_project.path())).unwrap();
        set_series_project(
            config.path(),
            "series:acme",
            Some(series(acme.path(), "Acme weekly")),
        )
        .unwrap();

        save(
            config.path(),
            &CoachSettings {
                nudge_limit_cents: 75,
                ..with_project(default_project.path())
            },
        )
        .unwrap();

        assert_eq!(
            load_series_projects(config.path()).unwrap(),
            SeriesProjects::from([("series:acme".into(), series(acme.path(), "Acme weekly"))])
        );
        assert_eq!(
            load(config.path(), &MemorySecrets::default())
                .unwrap()
                .nudge_limit_cents,
            75
        );
    }

    #[test]
    fn a_series_project_can_be_cleared_and_vanished_folders_are_dropped() {
        let config = tempfile::tempdir().unwrap();
        let acme = tempfile::tempdir().unwrap();
        let globex = tempfile::tempdir().unwrap();
        set_series_project(
            config.path(),
            "series:acme",
            Some(series(acme.path(), "Acme")),
        )
        .unwrap();
        set_series_project(
            config.path(),
            "title:globex sync",
            Some(series(globex.path(), "Globex sync")),
        )
        .unwrap();
        assert_eq!(load_series_projects(config.path()).unwrap().len(), 2);

        set_series_project(config.path(), "series:acme", None).unwrap();
        drop(globex);

        assert_eq!(
            load_series_projects(config.path()).unwrap(),
            SeriesProjects::new()
        );
        assert!(
            set_series_project(
                config.path(),
                "series:acme",
                Some(SeriesProject {
                    project: "/definitely/not/here".into(),
                    label: "Acme".into()
                })
            )
            .is_err()
        );
    }

    #[test]
    fn unknown_model_names_are_rejected_on_load() {
        let config = tempfile::tempdir().unwrap();
        std::fs::write(config.path().join(FILE_NAME), r#"{"model": "gpt"}"#).unwrap();
        assert!(load(config.path(), &MemorySecrets::default()).is_err());
        std::fs::write(config.path().join(FILE_NAME), r#"{"model": "haiku"}"#).unwrap();
        assert_eq!(
            load(config.path(), &MemorySecrets::default())
                .unwrap()
                .model,
            ClaudeModel::Haiku
        );
    }
}
