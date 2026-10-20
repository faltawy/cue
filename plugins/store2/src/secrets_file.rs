use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};

pub(crate) const SECRETS_FILENAME: &str = "secrets.json";

static FILE_LOCK: Mutex<()> = Mutex::new(());

type Entries = BTreeMap<String, Option<String>>;

pub(crate) struct SecretsFile {
    path: PathBuf,
}

impl SecretsFile {
    pub(crate) fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub(crate) fn read(
        &self,
        account: &str,
        keychain: impl FnOnce() -> Result<Option<String>, String>,
    ) -> Result<Option<String>, String> {
        let entries = self
            .load()
            .map_err(|error| format!("couldn't read secret {account}: {error}"))?;
        if let Some(entry) = entries.get(account) {
            return Ok(entry.clone());
        }

        let migrated = keychain()?;
        self.update(account, |entries| {
            entries
                .entry(account.to_string())
                .or_insert(migrated)
                .clone()
        })
    }

    pub(crate) fn write(&self, account: &str, value: &str) -> Result<(), String> {
        self.update(account, |entries| {
            entries.insert(account.to_string(), Some(value.to_string()));
        })
    }

    pub(crate) fn delete(&self, account: &str) -> Result<(), String> {
        self.update(account, |entries| {
            entries.insert(account.to_string(), None);
        })
    }

    fn update<T>(
        &self,
        account: &str,
        change: impl FnOnce(&mut Entries) -> T,
    ) -> Result<T, String> {
        let _guard = FILE_LOCK.lock().unwrap_or_else(PoisonError::into_inner);
        let mut entries = self
            .load()
            .map_err(|error| format!("couldn't read secret {account}: {error}"))?;
        let result = change(&mut entries);
        self.store(&entries)
            .map_err(|error| format!("couldn't save secret {account}: {error}"))?;
        Ok(result)
    }

    fn load(&self) -> Result<Entries, String> {
        let bytes = match std::fs::read(&self.path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Entries::new());
            }
            Err(error) => return Err(error.to_string()),
        };
        serde_json::from_slice(&bytes).map_err(|error| {
            format!(
                "{} is malformed at line {} column {}",
                self.path.display(),
                error.line(),
                error.column()
            )
        })
    }

    fn store(&self, entries: &Entries) -> Result<(), String> {
        let content = serde_json::to_string_pretty(entries).map_err(|error| error.to_string())?;
        anlg_storage::fs::atomic_write_private(&self.path, &content)
            .map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    fn secrets_file(dir: &tempfile::TempDir) -> SecretsFile {
        SecretsFile::new(dir.path().join(SECRETS_FILENAME))
    }

    fn keychain_never_consulted() -> Result<Option<String>, String> {
        panic!("the keychain must not be consulted once the file has the account")
    }

    #[cfg(unix)]
    #[test]
    fn round_trips_secrets_in_an_owner_only_file() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let file = secrets_file(&dir);
        let long_secret = "eyJ".repeat(3000);

        file.write("provider:deepgram", "sk-first").unwrap();
        file.write("provider:openai", &long_secret).unwrap();
        file.write("provider:deepgram", "sk-second").unwrap();

        assert_eq!(
            file.read("provider:deepgram", keychain_never_consulted)
                .unwrap(),
            Some("sk-second".to_string())
        );
        assert_eq!(
            file.read("provider:openai", keychain_never_consulted)
                .unwrap(),
            Some(long_secret)
        );
        let mode = std::fs::metadata(dir.path().join(SECRETS_FILENAME))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn delete_hides_the_secret_without_reviving_it_from_the_keychain() {
        let dir = tempfile::tempdir().unwrap();
        let file = secrets_file(&dir);
        file.write("provider:deepgram", "sk-live").unwrap();
        file.write("provider:openai", "sk-kept").unwrap();

        file.delete("provider:deepgram").unwrap();

        assert_eq!(
            file.read("provider:deepgram", keychain_never_consulted)
                .unwrap(),
            None
        );
        assert_eq!(
            file.read("provider:openai", keychain_never_consulted)
                .unwrap(),
            Some("sk-kept".to_string())
        );
    }

    #[test]
    fn migrates_a_keychain_secret_once_then_reads_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = secrets_file(&dir);
        let keychain_reads = Cell::new(0);
        let keychain = || {
            keychain_reads.set(keychain_reads.get() + 1);
            Ok(Some("sk-from-keychain".to_string()))
        };

        assert_eq!(
            file.read("provider:deepgram", keychain).unwrap(),
            Some("sk-from-keychain".to_string())
        );
        assert_eq!(
            file.read("provider:deepgram", keychain).unwrap(),
            Some("sk-from-keychain".to_string())
        );
        assert_eq!(keychain_reads.get(), 1);

        file.write("provider:deepgram", "sk-rotated").unwrap();
        assert_eq!(
            file.read("provider:deepgram", keychain).unwrap(),
            Some("sk-rotated".to_string())
        );
        assert_eq!(keychain_reads.get(), 1);
    }

    #[test]
    fn a_secret_missing_from_the_keychain_is_looked_up_once() {
        let dir = tempfile::tempdir().unwrap();
        let file = secrets_file(&dir);
        let keychain_reads = Cell::new(0);
        let keychain = || {
            keychain_reads.set(keychain_reads.get() + 1);
            Ok(None)
        };

        assert_eq!(file.read("provider:deepgram", keychain).unwrap(), None);
        assert_eq!(file.read("provider:deepgram", keychain).unwrap(), None);
        assert_eq!(keychain_reads.get(), 1);
    }

    #[test]
    fn a_failed_keychain_read_is_retried_and_not_recorded() {
        let dir = tempfile::tempdir().unwrap();
        let file = secrets_file(&dir);

        assert_eq!(
            file.read("provider:deepgram", || Err("keychain locked".to_string()))
                .unwrap_err(),
            "keychain locked"
        );
        assert_eq!(
            file.read("provider:deepgram", || Ok(Some("sk-later".to_string())))
                .unwrap(),
            Some("sk-later".to_string())
        );
    }

    #[test]
    fn a_secret_saved_during_migration_wins_over_the_keychain_copy() {
        let dir = tempfile::tempdir().unwrap();
        let file = secrets_file(&dir);

        let read = file
            .read("provider:deepgram", || {
                file.write("provider:deepgram", "sk-new").unwrap();
                Ok(Some("sk-stale".to_string()))
            })
            .unwrap();

        assert_eq!(read, Some("sk-new".to_string()));
        assert_eq!(
            file.read("provider:deepgram", keychain_never_consulted)
                .unwrap(),
            Some("sk-new".to_string())
        );
    }

    #[test]
    fn a_malformed_file_error_never_quotes_its_contents() {
        let dir = tempfile::tempdir().unwrap();
        let file = secrets_file(&dir);
        std::fs::write(dir.path().join(SECRETS_FILENAME), r#""sk-secret-value""#).unwrap();

        let error = file
            .read("provider:openai", keychain_never_consulted)
            .unwrap_err();

        assert!(error.contains("provider:openai"), "{error}");
        assert!(error.contains("malformed"), "{error}");
        assert!(!error.contains("sk-secret-value"), "{error}");
    }
}
