use std::path::Path;

use sqlx::{Row, SqlitePool};

use crate::settings::SeriesProjects;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Series {
    pub key: String,
    pub label: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectSource {
    Series,
    Default,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct MeetingProject {
    pub session_id: String,
    pub series: Option<Series>,
    pub project: String,
    pub source: ProjectSource,
    pub default_project: String,
}

fn event_title(event_json: &str) -> Option<String> {
    let event: serde_json::Value = serde_json::from_str(event_json).ok()?;
    let title = event.get("title")?.as_str()?.trim();
    (!title.is_empty()).then(|| title.to_string())
}

fn normalize(title: &str) -> String {
    title
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

pub fn series_of(series_id: &str, event_json: &str, title: &str) -> Option<Series> {
    let event_title = event_title(event_json);
    let series_id = series_id.trim();
    if !series_id.is_empty() {
        let label = event_title
            .or_else(|| (!title.trim().is_empty()).then(|| title.trim().to_string()))
            .unwrap_or_else(|| "this meeting series".into());
        return Some(Series {
            key: format!("series:{series_id}"),
            label,
        });
    }
    let title = event_title?;
    Some(Series {
        key: format!("title:{}", normalize(&title)),
        label: title,
    })
}

pub async fn meeting_series(
    pool: &SqlitePool,
    session_id: &str,
) -> sqlx::Result<Option<Option<Series>>> {
    let row = sqlx::query(
        "SELECT series_id, event_json, title FROM sessions WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;
    row.map(|row| {
        Ok(series_of(
            &row.try_get::<String, _>("series_id")?,
            &row.try_get::<String, _>("event_json")?,
            &row.try_get::<String, _>("title")?,
        ))
    })
    .transpose()
}

pub fn resolve(
    session_id: &str,
    series: Option<Series>,
    projects: &SeriesProjects,
    default_project: &Path,
) -> MeetingProject {
    let default_project = default_project.to_string_lossy().into_owned();
    let mapped = series
        .as_ref()
        .and_then(|series| projects.get(&series.key))
        .map(|mapped| mapped.project.clone());
    MeetingProject {
        session_id: session_id.to_string(),
        series,
        source: if mapped.is_some() {
            ProjectSource::Series
        } else {
            ProjectSource::Default
        },
        project: mapped.unwrap_or_else(|| default_project.clone()),
        default_project,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::SeriesProject;

    const WEEKLY: &str = r#"{"title":"  Acme   Weekly Sync ","started_at":"2026-10-17T16:00:00Z"}"#;

    #[test]
    fn a_calendar_series_id_wins_and_takes_the_event_title_as_its_label() {
        assert_eq!(
            series_of("rec-42", WEEKLY, "Edited title"),
            Some(Series {
                key: "series:rec-42".into(),
                label: "Acme   Weekly Sync".into()
            })
        );
    }

    #[test]
    fn without_a_series_id_the_normalized_event_title_groups_the_meetings() {
        let tuesday = series_of("", WEEKLY, "");
        let thursday = series_of("", r#"{"title":"acme weekly sync"}"#, "");

        assert_eq!(
            tuesday.as_ref().map(|s| s.key.as_str()),
            Some("title:acme weekly sync")
        );
        assert_eq!(tuesday.map(|s| s.key), thursday.map(|s| s.key));
    }

    #[test]
    fn an_ad_hoc_recording_without_an_event_has_no_series() {
        assert_eq!(series_of("", "", "Untitled"), None);
        assert_eq!(series_of("", r#"{"title":"  "}"#, "Untitled"), None);
        assert!(series_of("", r#"{"title":"Standup"}"#, "Untitled").is_some());
    }

    #[test]
    fn the_series_folder_is_used_when_mapped_otherwise_the_default_project() {
        let default_project = Path::new("/work/default");
        let acme = series_of("rec-42", WEEKLY, "").unwrap();
        let other = series_of("rec-7", r#"{"title":"Globex"}"#, "").unwrap();
        let projects = SeriesProjects::from([(
            acme.key.clone(),
            SeriesProject {
                project: "/work/acme".into(),
                label: acme.label.clone(),
            },
        )]);

        let mapped = resolve("s1", Some(acme), &projects, default_project);
        let unmapped = resolve("s2", Some(other), &projects, default_project);
        let ad_hoc = resolve("s3", None, &projects, default_project);

        assert_eq!(
            (mapped.project.as_str(), mapped.source),
            ("/work/acme", ProjectSource::Series)
        );
        assert_eq!(
            (unmapped.project.as_str(), unmapped.source),
            ("/work/default", ProjectSource::Default)
        );
        assert_eq!(
            (ad_hoc.project.as_str(), ad_hoc.source),
            ("/work/default", ProjectSource::Default)
        );
    }
}
