use anlg_apple_todo::types::{Reminder, ReminderList};

use crate::error::Error;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case")]
pub enum ReadPathResult {
    ReminderLists(Vec<ReminderList>),
    Reminders(Vec<Reminder>),
}

pub fn parse_apple_path(path: &str) -> Result<&str, Error> {
    let trimmed = path.trim_matches('/');
    match trimmed.split('/').find(|segment| !segment.is_empty()) {
        Some("apple") if trimmed == "apple" => Ok(""),
        Some("apple") => Ok(&trimmed["apple/".len()..]),
        _ => Err(Error::InvalidReadPath(path.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_apple_path;

    #[test]
    fn parses_apple_paths() {
        assert_eq!(parse_apple_path("apple").unwrap(), "");
        assert_eq!(parse_apple_path("/apple/").unwrap(), "");
        assert_eq!(parse_apple_path("apple/list-1").unwrap(), "list-1");
    }

    #[test]
    fn rejects_non_apple_paths() {
        assert!(parse_apple_path("linear/conn-1/teams/team-1").is_err());
        assert!(parse_apple_path("github/conn-1/repos/openai/char").is_err());
        assert!(parse_apple_path("").is_err());
    }
}
