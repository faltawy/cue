use std::fs;
use std::io::Write;
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{Error, Result};

pub const REGISTRATION_FILE: &str = "browser-host.json";
pub const DISCOVERY_FILE: &str = "browser-bridge.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ChromiumBrowser {
    Chrome,
    Chromium,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct BrowserRegistration {
    pub browser: ChromiumBrowser,
    pub extension_id: String,
}

fn manifest_path(home: &Path, browser: ChromiumBrowser, host_name: &str) -> PathBuf {
    home.join("Library/Application Support")
        .join(match browser {
            ChromiumBrowser::Chrome => "Google/Chrome/NativeMessagingHosts",
            ChromiumBrowser::Chromium => "Chromium/NativeMessagingHosts",
        })
        .join(format!("{host_name}.json"))
}

pub fn host_name(config: &Path) -> Result<String> {
    let identifier = config
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| {
            s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._".contains(&b))
        })
        .ok_or_else(|| Error::Other("invalid browser host identifier".into()))?;
    Ok(format!("{identifier}.browser"))
}

pub fn read(config: &Path) -> Result<Option<BrowserRegistration>> {
    match fs::read(config.join(REGISTRATION_FILE)) {
        Ok(bytes) => Ok(Some(serde_json::from_slice(&bytes)?)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn write_private(path: &Path, value: &impl Serialize) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| Error::Other("missing browser host directory".into()))?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(".browser-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .mode(0o600)
            .open(&temporary)?;
        file.write_all(&serde_json::to_vec(value)?)?;
        file.sync_all()?;
        fs::rename(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

fn remove(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub fn register(
    config: &Path,
    home: &Path,
    binary: &Path,
    registration: Option<&BrowserRegistration>,
) -> Result<()> {
    if let Some(registration) = registration {
        if registration.extension_id.len() != 32
            || !registration
                .extension_id
                .bytes()
                .all(|b| (b'a'..=b'p').contains(&b))
        {
            return Err(Error::Other(
                "a Chrome extension ID must contain 32 letters from a to p".into(),
            ));
        }
        if !binary.is_file() {
            return Err(Error::Other(
                "install a bundled Cue app before connecting a browser extension".into(),
            ));
        }
    }
    let name = host_name(config)?;
    for browser in [ChromiumBrowser::Chrome, ChromiumBrowser::Chromium] {
        remove(&manifest_path(home, browser, &name))?;
    }
    remove(&config.join(DISCOVERY_FILE))?;
    remove(&config.join(REGISTRATION_FILE))?;
    if let Some(registration) = registration {
        write_private(
            &manifest_path(home, registration.browser, &name),
            &serde_json::json!({
                "name": name,
                "description": "Cue private meeting context and coaching",
                "path": binary,
                "type": "stdio",
                "allowed_origins": [format!("chrome-extension://{}/", registration.extension_id)]
            }),
        )?;
        write_private(&config.join(REGISTRATION_FILE), registration)?;
    }
    Ok(())
}

pub fn publish(
    config: &Path,
    binary: &Path,
    url: &str,
    token: &str,
    registration: &BrowserRegistration,
) -> Result<()> {
    write_private(
        &config.join(DISCOVERY_FILE),
        &serde_json::json!({
            "version": 1, "host_path": binary, "url": url, "token": token,
            "origin": format!("chrome-extension://{}/", registration.extension_id)
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn registration_scopes_the_host_to_one_extension_and_can_reset_corrupt_configuration() {
        let root = tempfile::tempdir().unwrap();
        let config = root.path().join("com.hyprnote.stable");
        let binary = root.path().join("cue-coach");
        fs::write(&binary, "binary").unwrap();
        let registration = BrowserRegistration {
            browser: ChromiumBrowser::Chrome,
            extension_id: "abcdefghijklmnopabcdefghijklmnop".into(),
        };
        register(&config, root.path(), &binary, Some(&registration)).unwrap();
        let manifest = manifest_path(
            root.path(),
            ChromiumBrowser::Chrome,
            "com.hyprnote.stable.browser",
        );
        let content: serde_json::Value =
            serde_json::from_slice(&fs::read(&manifest).unwrap()).unwrap();
        assert_eq!(
            content["allowed_origins"],
            serde_json::json!(["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"])
        );
        assert_eq!(content["path"], binary.to_string_lossy().as_ref());
        publish(
            &config,
            &binary,
            "http://127.0.0.1:1234",
            "private",
            &registration,
        )
        .unwrap();
        assert_eq!(
            fs::metadata(config.join(DISCOVERY_FILE))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
        let moved = root.path().join("new-cue-coach");
        fs::write(&moved, "binary").unwrap();
        register(&config, root.path(), &moved, Some(&registration)).unwrap();
        let refreshed: serde_json::Value =
            serde_json::from_slice(&fs::read(&manifest).unwrap()).unwrap();
        assert_eq!(refreshed["path"], moved.to_string_lossy().as_ref());
        fs::write(config.join(REGISTRATION_FILE), "broken").unwrap();
        register(&config, root.path(), &moved, None).unwrap();
        assert!(!manifest.exists());
        assert!(!config.join(REGISTRATION_FILE).exists());
        assert!(!config.join(DISCOVERY_FILE).exists());
    }
}
