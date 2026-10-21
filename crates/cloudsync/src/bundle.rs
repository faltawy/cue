use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::CLOUDSYNC_VERSION;
use crate::error::Error;

static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
const CLOUDSYNC_BUNDLE_REVISION: &str = "cue-bounded-send-2";

macro_rules! configure_cloudsync_target {
    ($target:literal, $file_name:literal, $path:literal) => {
        const CLOUDSYNC_TARGET: &str = $target;
        const CLOUDSYNC_FILE_NAME: &str = $file_name;
        const BUNDLED_CLOUDSYNC_BYTES: &[u8] = include_bytes!($path);
    };
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
configure_cloudsync_target!(
    "macos/aarch64",
    "cloudsync.dylib",
    "../vendor/cloudsync/macos/aarch64/cloudsync.dylib"
);

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
configure_cloudsync_target!(
    "macos/x86_64",
    "cloudsync.dylib",
    "../vendor/cloudsync/macos/x86_64/cloudsync.dylib"
);

pub fn bundled_extension_path() -> Result<PathBuf, Error> {
    if let Some(path) = bundled_macos_extension_path() {
        return Ok(path);
    }

    let base_dir = dirs::cache_dir()
        .ok_or(Error::MissingCacheDir)?
        .join("char")
        .join("cloudsync")
        .join(CLOUDSYNC_VERSION)
        .join(CLOUDSYNC_BUNDLE_REVISION)
        .join(CLOUDSYNC_TARGET);

    fs::create_dir_all(&base_dir)?;

    let extension_path = base_dir.join(CLOUDSYNC_FILE_NAME);
    let needs_write = match fs::metadata(&extension_path) {
        Ok(metadata) => metadata.len() != BUNDLED_CLOUDSYNC_BYTES.len() as u64,
        Err(_) => true,
    };

    if needs_write {
        let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let tmp_path = base_dir.join(format!(
            "{CLOUDSYNC_FILE_NAME}.{}.{sequence}.tmp",
            std::process::id()
        ));
        fs::write(&tmp_path, BUNDLED_CLOUDSYNC_BYTES)?;

        fs::set_permissions(&tmp_path, fs::Permissions::from_mode(0o755))?;

        match fs::rename(&tmp_path, &extension_path) {
            Ok(()) => {}
            Err(error) if extension_path.exists() => {
                let _ = fs::remove_file(&tmp_path);

                if fs::metadata(&extension_path)?.len() != BUNDLED_CLOUDSYNC_BYTES.len() as u64 {
                    return Err(error.into());
                }
            }
            Err(error) => return Err(error.into()),
        }
    }

    Ok(extension_path)
}

fn bundled_macos_extension_path() -> Option<PathBuf> {
    let executable = std::env::current_exe().ok()?;
    macos_extension_path(&executable)
}

fn macos_extension_path(executable: &Path) -> Option<PathBuf> {
    let frameworks = executable.parent()?.parent()?.join("Frameworks");
    let extension = frameworks.join(CLOUDSYNC_FILE_NAME);
    extension.is_file().then_some(extension)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packaged_macos_extension_comes_from_frameworks() {
        let dir = tempfile::tempdir().unwrap();
        let executable = dir.path().join("Example.app/Contents/MacOS/example");
        let extension = dir
            .path()
            .join("Example.app/Contents/Frameworks")
            .join(CLOUDSYNC_FILE_NAME);
        fs::create_dir_all(extension.parent().unwrap()).unwrap();
        fs::write(&extension, BUNDLED_CLOUDSYNC_BYTES).unwrap();

        assert_eq!(macos_extension_path(&executable), Some(extension));
    }
}
