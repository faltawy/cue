use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_specta::Event;

use crate::core::{Backend, BusyReason, Found, UpdaterState};
use crate::{Error, Result, github};

pub const STABLE_IDENTIFIER: &str = "com.hyprnote.stable";
const SECRET_SCOPE: &str = "updater";
const SECRET_KEY: &str = "github_token";

pub type BusyProbe = Arc<
    dyn Fn(AppHandle) -> std::pin::Pin<Box<dyn Future<Output = Option<BusyReason>> + Send>>
        + Send
        + Sync,
>;

pub struct TauriBackend {
    pub(crate) app: AppHandle,
    pub(crate) probe: BusyProbe,
}

impl TauriBackend {
    fn updates_dir(&self) -> Result<PathBuf> {
        Ok(self.app.path().app_cache_dir()?.join("updates"))
    }
}

fn prune_except(dir: &Path, keep: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for path in entries.flatten().map(|entry| entry.path()) {
        if path != keep
            && let Err(error) = std::fs::remove_file(&path)
        {
            tracing::warn!(%error, path = %path.display(), "update_prune_failed");
        }
    }
}

impl Backend for TauriBackend {
    type Pending = Update;
    type Staged = PathBuf;

    fn current_version(&self) -> String {
        self.app.package_info().version.to_string()
    }

    fn supported(&self) -> bool {
        self.app.config().identifier == STABLE_IDENTIFIER
    }

    fn token(&self) -> Result<Option<String>> {
        tauri_plugin_store2::read_secret_blocking(&self.app, SECRET_SCOPE, SECRET_KEY)
            .map(|token| token.filter(|t| !t.is_empty()))
            .map_err(Error::Secret)
    }

    fn save_token(&self, token: Option<&str>) -> Result<()> {
        match token {
            Some(token) => tauri_plugin_store2::write_secret_blocking(
                &self.app,
                SECRET_SCOPE,
                SECRET_KEY,
                token,
            ),
            None => {
                tauri_plugin_store2::delete_secret_blocking(&self.app, SECRET_SCOPE, SECRET_KEY)
            }
        }
        .map_err(Error::Secret)
    }

    async fn check(&self, token: String) -> Result<Option<Found<Update>>> {
        let manifest = github::latest_manifest_url(&token).await?;
        let updater = self
            .app
            .updater_builder()
            .endpoints(vec![manifest])?
            .headers(github::auth_headers(&token, "application/octet-stream")?)
            .build()?;
        Ok(updater.check().await?.map(|update| Found {
            version: update.version.clone(),
            pending: update,
        }))
    }

    async fn download(&self, pending: &Update) -> Result<PathBuf> {
        let bytes = pending.download(|_, _| {}, || {}).await?;
        let dir = self.updates_dir()?;
        std::fs::create_dir_all(&dir)?;
        let path = dir.join(format!("{}.app.tar.gz", pending.version));
        std::fs::write(&path, bytes)?;
        prune_except(&dir, &path);
        Ok(path)
    }

    async fn busy(&self) -> Option<BusyReason> {
        (self.probe)(self.app.clone()).await
    }

    fn install(&self, pending: &Update, staged: &PathBuf) -> Result<()> {
        pending.install(std::fs::read(staged)?)?;
        Ok(())
    }

    fn relaunch(&self) {
        self.app.restart();
    }

    fn publish(&self, state: &UpdaterState) {
        if let Err(error) = state.clone().emit(&self.app) {
            tracing::warn!(%error, "update_state_emit_failed");
        }
    }
}
