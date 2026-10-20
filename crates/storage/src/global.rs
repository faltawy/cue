use std::path::{Path, PathBuf};

pub const VAULT_CONFIG_FILENAME: &str = "global.json";
const STAGING_BUNDLE_ID: &str = "com.hyprnote.staging";
const NIGHTLY_BUNDLE_ID: &str = "com.hyprnote.nightly";
const RELEASE_APP_FOLDER: &str = "Cue";
const PREVIOUS_RELEASE_APP_FOLDER: &str = "anarlog";
const LEGACY_RELEASE_APP_FOLDER: &str = "hyprnote";

pub fn compute_vault_config_path(base: &Path) -> PathBuf {
    base.join(VAULT_CONFIG_FILENAME)
}

pub fn compute_default_base(bundle_id: &str) -> Option<PathBuf> {
    let data_dir = dirs::data_dir()?;
    let app_folder = resolve_app_folder(&data_dir, bundle_id, cfg!(debug_assertions));
    Some(data_dir.join(app_folder))
}

#[derive(Debug, PartialEq, Eq)]
pub enum FolderMigration {
    NotNeeded,
    Moved {
        from: PathBuf,
        to: PathBuf,
        downgrade_link_error: Option<String>,
    },
    NewFolderExists {
        kept: PathBuf,
    },
    Failed {
        kept: PathBuf,
        error: String,
    },
}

// Renames the release data folder from "anarlog" to "Cue" and leaves an
// "anarlog" symlink behind, so an older build still finds the same data. Call
// it before anything resolves the default base, and only while holding the
// launch lock so no other instance has the folder open.
pub fn migrate_release_app_folder(bundle_id: &str) -> FolderMigration {
    let Some(data_dir) = dirs::data_dir() else {
        return FolderMigration::NotNeeded;
    };
    migrate_app_folder(&data_dir, bundle_id, cfg!(debug_assertions))
}

fn migrate_app_folder(data_dir: &Path, bundle_id: &str, is_debug: bool) -> FolderMigration {
    if !uses_release_folder(bundle_id, is_debug) {
        return FolderMigration::NotNeeded;
    }

    let from = data_dir.join(PREVIOUS_RELEASE_APP_FOLDER);
    let to = data_dir.join(RELEASE_APP_FOLDER);
    if !is_unmigrated_folder(&from) {
        return FolderMigration::NotNeeded;
    }
    if to.symlink_metadata().is_ok() {
        return FolderMigration::NewFolderExists { kept: from };
    }
    if let Err(error) = std::fs::rename(&from, &to) {
        return FolderMigration::Failed {
            kept: from,
            error: error.to_string(),
        };
    }

    let downgrade_link_error = std::os::unix::fs::symlink(RELEASE_APP_FOLDER, &from)
        .err()
        .map(|error| error.to_string());
    FolderMigration::Moved {
        from,
        to,
        downgrade_link_error,
    }
}

// This base holds settings, the store, and the vault config. Nightly keeps its
// own; the desktop app maps only the database itself onto stable's folder.
fn resolve_app_folder<'a>(data_dir: &Path, bundle_id: &'a str, is_debug: bool) -> &'a str {
    if !uses_release_folder(bundle_id, is_debug) {
        bundle_id
    } else if is_unmigrated_folder(&data_dir.join(PREVIOUS_RELEASE_APP_FOLDER)) {
        PREVIOUS_RELEASE_APP_FOLDER
    } else if has_app_data(&data_dir.join(LEGACY_RELEASE_APP_FOLDER))
        && !has_app_data(&data_dir.join(RELEASE_APP_FOLDER))
    {
        LEGACY_RELEASE_APP_FOLDER
    } else {
        RELEASE_APP_FOLDER
    }
}

fn uses_release_folder(bundle_id: &str, is_debug: bool) -> bool {
    !is_debug && !matches!(bundle_id, STAGING_BUNDLE_ID | NIGHTLY_BUNDLE_ID)
}

// A real "anarlog" directory with data was never moved; after the move it is
// only a symlink to "Cue".
fn is_unmigrated_folder(path: &Path) -> bool {
    path.symlink_metadata()
        .is_ok_and(|metadata| metadata.is_dir())
        && has_app_data(path)
}

fn has_app_data(path: &Path) -> bool {
    std::fs::read_dir(path)
        .map(|mut entries| entries.next().is_some())
        .unwrap_or_else(|_| path.exists())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn resolve_app_folder_uses_cue_for_new_stable_installs() {
        let temp = tempdir().unwrap();

        assert_eq!(
            resolve_app_folder(temp.path(), "com.hyprnote.stable", false),
            RELEASE_APP_FOLDER
        );
    }

    #[test]
    fn resolve_app_folder_keeps_legacy_stable_folder_when_it_has_data() {
        let temp = tempdir().unwrap();
        let legacy_base = temp.path().join(LEGACY_RELEASE_APP_FOLDER);
        std::fs::create_dir_all(&legacy_base).unwrap();
        std::fs::write(legacy_base.join("store.json"), "{}").unwrap();

        assert_eq!(
            resolve_app_folder(temp.path(), "com.hyprnote.stable", false),
            LEGACY_RELEASE_APP_FOLDER
        );
    }

    #[test]
    fn resolve_app_folder_prefers_cue_when_it_has_data() {
        let temp = tempdir().unwrap();
        let legacy_base = temp.path().join(LEGACY_RELEASE_APP_FOLDER);
        let new_base = temp.path().join(RELEASE_APP_FOLDER);
        std::fs::create_dir_all(&legacy_base).unwrap();
        std::fs::create_dir_all(&new_base).unwrap();
        std::fs::write(legacy_base.join("store.json"), "{}").unwrap();
        std::fs::write(new_base.join("app.db"), "").unwrap();

        assert_eq!(
            resolve_app_folder(temp.path(), "com.hyprnote.stable", false),
            RELEASE_APP_FOLDER
        );
    }

    #[test]
    fn resolve_app_folder_ignores_empty_legacy_stable_folder() {
        let temp = tempdir().unwrap();
        std::fs::create_dir_all(temp.path().join(LEGACY_RELEASE_APP_FOLDER)).unwrap();

        assert_eq!(
            resolve_app_folder(temp.path(), "com.hyprnote.stable", false),
            RELEASE_APP_FOLDER
        );
    }

    #[test]
    fn nightly_keeps_its_own_settings_base() {
        let temp = tempfile::tempdir().unwrap();
        for folder in [RELEASE_APP_FOLDER, LEGACY_RELEASE_APP_FOLDER] {
            std::fs::create_dir(temp.path().join(folder)).unwrap();
            std::fs::write(temp.path().join(folder).join("app.db"), "stable data").unwrap();
        }
        assert_eq!(
            resolve_app_folder(temp.path(), NIGHTLY_BUNDLE_ID, false),
            NIGHTLY_BUNDLE_ID
        );
    }

    #[test]
    fn resolve_app_folder_returns_bundle_id_in_debug_builds() {
        assert_eq!(
            resolve_app_folder(Path::new("/tmp"), "com.hyprnote.stable", true),
            "com.hyprnote.stable"
        );
    }

    const STABLE: &str = "com.hyprnote.stable";

    fn seed_previous_folder(data_dir: &Path) {
        let previous = data_dir.join(PREVIOUS_RELEASE_APP_FOLDER);
        std::fs::create_dir_all(previous.join("sessions")).unwrap();
        std::fs::write(previous.join("app.db"), "notes").unwrap();
    }

    #[test]
    fn migration_moves_the_previous_folder_once_and_leaves_a_downgrade_link() {
        let temp = tempdir().unwrap();
        seed_previous_folder(temp.path());
        let previous = temp.path().join(PREVIOUS_RELEASE_APP_FOLDER);
        let new = temp.path().join(RELEASE_APP_FOLDER);

        assert_eq!(
            migrate_app_folder(temp.path(), STABLE, false),
            FolderMigration::Moved {
                from: previous.clone(),
                to: new.clone(),
                downgrade_link_error: None,
            }
        );
        assert_eq!(
            std::fs::read_to_string(new.join("app.db")).unwrap(),
            "notes"
        );
        assert!(new.join("sessions").is_dir());
        assert!(previous.symlink_metadata().unwrap().is_symlink());
        assert_eq!(
            std::fs::read_to_string(previous.join("app.db")).unwrap(),
            "notes"
        );
        assert_eq!(
            resolve_app_folder(temp.path(), STABLE, false),
            RELEASE_APP_FOLDER
        );

        assert_eq!(
            migrate_app_folder(temp.path(), STABLE, false),
            FolderMigration::NotNeeded
        );
        assert_eq!(
            std::fs::read_to_string(new.join("app.db")).unwrap(),
            "notes"
        );
    }

    #[test]
    fn migration_keeps_the_previous_folder_when_the_new_one_exists() {
        let temp = tempdir().unwrap();
        seed_previous_folder(temp.path());
        let new = temp.path().join(RELEASE_APP_FOLDER);
        std::fs::create_dir(&new).unwrap();
        std::fs::write(new.join("unrelated.txt"), "other").unwrap();

        assert_eq!(
            migrate_app_folder(temp.path(), STABLE, false),
            FolderMigration::NewFolderExists {
                kept: temp.path().join(PREVIOUS_RELEASE_APP_FOLDER),
            }
        );
        assert!(!new.join("app.db").exists());
        assert_eq!(
            resolve_app_folder(temp.path(), STABLE, false),
            PREVIOUS_RELEASE_APP_FOLDER
        );
    }

    #[test]
    fn migration_failure_keeps_using_the_previous_folder() {
        use std::os::unix::fs::PermissionsExt;

        let temp = tempdir().unwrap();
        seed_previous_folder(temp.path());
        std::fs::set_permissions(temp.path(), std::fs::Permissions::from_mode(0o555)).unwrap();

        let outcome = migrate_app_folder(temp.path(), STABLE, false);
        let resolved = resolve_app_folder(temp.path(), STABLE, false);
        std::fs::set_permissions(temp.path(), std::fs::Permissions::from_mode(0o755)).unwrap();

        assert!(
            matches!(outcome, FolderMigration::Failed { ref kept, .. } if kept == &temp.path().join(PREVIOUS_RELEASE_APP_FOLDER)),
            "{outcome:?}"
        );
        assert_eq!(resolved, PREVIOUS_RELEASE_APP_FOLDER);
        assert!(!temp.path().join(RELEASE_APP_FOLDER).exists());
    }

    #[test]
    fn migration_leaves_dev_and_nightly_folders_alone() {
        let temp = tempdir().unwrap();
        seed_previous_folder(temp.path());

        for (bundle_id, is_debug) in [(STABLE, true), (NIGHTLY_BUNDLE_ID, false)] {
            assert_eq!(
                migrate_app_folder(temp.path(), bundle_id, is_debug),
                FolderMigration::NotNeeded
            );
        }
        assert!(
            temp.path()
                .join(PREVIOUS_RELEASE_APP_FOLDER)
                .symlink_metadata()
                .unwrap()
                .is_dir()
        );

        assert!(matches!(
            migrate_app_folder(temp.path(), STABLE, false),
            FolderMigration::Moved { .. }
        ));
    }
}
