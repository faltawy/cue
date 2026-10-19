use anlg_apple_todo::types::{
    CreateReminderInput, Reminder, ReminderFilter, ReminderIdentifierInput, ReminderList,
};

use crate::error::Error;
use crate::read_path::{ReadPathResult, parse_apple_path};

#[tauri::command]
#[specta::specta]
pub fn authorization_status() -> Result<String, Error> {
    #[cfg(target_os = "macos")]
    {
        let status = anlg_apple_todo::Handle::authorization_status();
        Ok(format!("{:?}", status))
    }
}

#[tauri::command]
#[specta::specta]
pub fn request_full_access() -> Result<bool, Error> {
    #[cfg(target_os = "macos")]
    {
        Ok(anlg_apple_todo::Handle::request_full_access())
    }
}

#[tauri::command]
#[specta::specta]
pub fn list_todo_lists() -> Result<Vec<ReminderList>, Error> {
    #[cfg(target_os = "macos")]
    {
        let handle = anlg_apple_todo::Handle;
        handle.list_reminder_lists().map_err(Into::into)
    }
}

#[tauri::command]
#[specta::specta]
pub fn fetch_todos(filter: ReminderFilter) -> Result<Vec<Reminder>, Error> {
    #[cfg(target_os = "macos")]
    {
        let handle = anlg_apple_todo::Handle;
        handle.fetch_reminders(filter).map_err(Into::into)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn read_path(path: String) -> Result<ReadPathResult, Error> {
    let path = parse_apple_path(&path)?;

    #[cfg(target_os = "macos")]
    {
        let handle = anlg_apple_todo::Handle;
        match handle.read_path(path)? {
            anlg_apple_todo::ReadPathResult::Lists(items) => {
                Ok(ReadPathResult::ReminderLists(items))
            }
            anlg_apple_todo::ReadPathResult::Reminders(items) => {
                Ok(ReadPathResult::Reminders(items))
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn create_todo(input: CreateReminderInput) -> Result<String, Error> {
    #[cfg(target_os = "macos")]
    {
        let handle = anlg_apple_todo::Handle;
        handle.create_reminder_identifier(input).map_err(Into::into)
    }
}

#[tauri::command]
#[specta::specta]
pub fn complete_todo(target: ReminderIdentifierInput) -> Result<(), Error> {
    #[cfg(target_os = "macos")]
    {
        let handle = anlg_apple_todo::Handle;
        handle.complete_reminder(&target).map_err(Into::into)
    }
}

#[tauri::command]
#[specta::specta]
pub fn delete_todo(target: ReminderIdentifierInput) -> Result<(), Error> {
    #[cfg(target_os = "macos")]
    {
        let handle = anlg_apple_todo::Handle;
        handle.delete_reminder(&target).map_err(Into::into)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn github_issue_state(
    owner: String,
    repo: String,
    number: u64,
) -> Result<crate::github_state::GitHubIssueState, Error> {
    crate::github_state::fetch_public(&owner, &repo, number).await
}

#[tauri::command]
#[specta::specta]
pub async fn github_issue_detail(
    owner: String,
    repo: String,
    number: u64,
) -> Result<anlg_github_issues::Issue, Error> {
    crate::github_state::fetch_issue_detail(&owner, &repo, number).await
}

#[tauri::command]
#[specta::specta]
pub async fn github_issue_comments(
    owner: String,
    repo: String,
    number: u64,
) -> Result<Vec<anlg_github_issues::IssueComment>, Error> {
    crate::github_state::fetch_issue_comments(&owner, &repo, number).await
}
