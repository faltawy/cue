#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "macos")]
pub use macos::*;

// Keep prior bundle identities recognizable alongside Cue’s current display name.
const SELF_BUNDLE_IDS: &[&str] = &[
    "com.anarlog.dev",
    "com.anarlog.stable",
    "com.anarlog.staging",
    "com.anarlog.nightly",
    "com.hyprnote.dev",
    "com.hyprnote.stable",
    "com.hyprnote.staging",
    "com.hyprnote.nightly",
];

const SELF_APP_NAMES: &[&str] = &[
    "cue",
    "cue dev",
    "cue staging",
    "cue nightly",
    "anarlog",
    "anarlog staging",
    "anarlog nightly",
    "hyprnote",
    "hyprnote staging",
    "hyprnote nightly",
    "char",
    "char staging",
    "char nightly",
];

const SELF_APP_PATH_SEGMENTS: &[&str] = &[
    "/cue.app/",
    "/cue dev.app/",
    "/cue staging.app/",
    "/cue nightly.app/",
    "/anarlog.app/",
    "/anarlog staging.app/",
    "/anarlog nightly.app/",
    "/hyprnote.app/",
    "/hyprnote staging.app/",
    "/hyprnote nightly.app/",
    "/char.app/",
    "/char staging.app/",
    "/char nightly.app/",
];

fn is_self_app(app: &InstalledApp) -> bool {
    let id = app.id.to_lowercase();
    let name = app.name.to_lowercase();

    SELF_BUNDLE_IDS.contains(&id.as_str())
        || SELF_APP_NAMES.contains(&name.as_str())
        || SELF_APP_PATH_SEGMENTS
            .iter()
            .any(|segment| id.contains(segment))
}

pub fn list_mic_using_apps() -> Result<Vec<InstalledApp>, crate::Error> {
    let apps = {
        #[cfg(target_os = "macos")]
        {
            macos::list_mic_using_apps()?
        }
    };

    Ok(apps.into_iter().filter(|app| !is_self_app(app)).collect())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(id: &str, name: &str) -> InstalledApp {
        InstalledApp {
            id: id.to_string(),
            name: name.to_string(),
        }
    }

    #[test]
    fn is_self_app_matches_cue_and_legacy_identities() {
        for (id, name, expected) in [
            ("com.anarlog.stable", "Unknown", true),
            ("com.hyprnote.stable", "Unknown", true),
            ("com.hyprnote.Hyprnote", "Hyprnote", true),
            ("pid:42", "Cue", true),
            ("pid:45", "Cue Dev", true),
            (
                "/Applications/Cue Dev.app/Contents/MacOS/cue",
                "Unknown",
                true,
            ),
            ("pid:43", "Char Nightly", true),
            ("pid:44", "Hyprnote Staging", true),
            ("/Applications/Cue.app/Contents/MacOS/cue", "Unknown", true),
            (
                "/Applications/Hyprnote Nightly.app/Contents/MacOS/Hyprnote Nightly",
                "Unknown",
                true,
            ),
            ("com.adobe.character-animator", "Character Animator", false),
            (
                "/Applications/Chart.app/Contents/MacOS/Chart",
                "Chart",
                false,
            ),
        ] {
            assert_eq!(
                is_self_app(&app(id, name)),
                expected,
                "is_self_app({id:?}, {name:?})"
            );
        }
    }
}
