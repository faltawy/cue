use std::future::Future;
use std::sync::Mutex;

use crate::{Error, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum BusyReason {
    Recording,
    CoachAnswering,
}

impl BusyReason {
    pub fn message(&self) -> &'static str {
        match self {
            BusyReason::Recording => "Cue restarts once the recording stops.",
            BusyReason::CoachAnswering => "Cue restarts once the coach finishes answering.",
        }
    }
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UpdateStatus {
    Unsupported,
    NeedsToken,
    Idle,
    Checking,
    Downloading { version: String },
    Ready { version: String },
    Failed { message: String },
}

#[derive(
    Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize, specta::Type, tauri_specta::Event,
)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterState {
    pub current_version: String,
    pub status: UpdateStatus,
    pub last_checked_at_ms: Option<i64>,
}

pub struct Found<P> {
    pub version: String,
    pub pending: P,
}

pub trait Backend: Send + Sync + 'static {
    type Pending: Send + Sync + 'static;
    type Staged: Send + Sync + 'static;

    fn current_version(&self) -> String;
    fn supported(&self) -> bool;
    fn token(&self) -> Result<Option<String>>;
    fn save_token(&self, token: Option<&str>) -> Result<()>;
    fn check(
        &self,
        token: String,
    ) -> impl Future<Output = Result<Option<Found<Self::Pending>>>> + Send;
    fn download(
        &self,
        pending: &Self::Pending,
    ) -> impl Future<Output = Result<Self::Staged>> + Send;
    fn busy(&self) -> impl Future<Output = Option<BusyReason>> + Send;
    fn install(&self, pending: &Self::Pending, staged: &Self::Staged) -> Result<()>;
    fn relaunch(&self);
    fn publish(&self, state: &UpdaterState);
}

struct Staged<B: Backend> {
    version: String,
    pending: B::Pending,
    staged: B::Staged,
}

pub struct Core<B: Backend> {
    backend: B,
    state: Mutex<UpdaterState>,
    staged: tokio::sync::Mutex<Option<Staged<B>>>,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or_default()
}

impl<B: Backend> Core<B> {
    pub fn new(backend: B) -> Self {
        let status = if !backend.supported() {
            UpdateStatus::Unsupported
        } else {
            match backend.token() {
                Ok(Some(_)) => UpdateStatus::Idle,
                Ok(None) => UpdateStatus::NeedsToken,
                Err(error) => UpdateStatus::Failed {
                    message: error.to_string(),
                },
            }
        };
        let state = UpdaterState {
            current_version: backend.current_version(),
            status,
            last_checked_at_ms: None,
        };
        Self {
            backend,
            state: Mutex::new(state),
            staged: tokio::sync::Mutex::new(None),
        }
    }

    pub fn state(&self) -> UpdaterState {
        self.state.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn set(&self, status: UpdateStatus, checked: bool) {
        let next = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            state.status = status;
            if checked {
                state.last_checked_at_ms = Some(now_ms());
            }
            state.clone()
        };
        self.backend.publish(&next);
    }

    fn settle_failure(&self, staged: &Option<Staged<B>>, error: Error) {
        tracing::warn!(%error, "update_check_failed");
        match staged {
            Some(staged) => self.set(
                UpdateStatus::Ready {
                    version: staged.version.clone(),
                },
                true,
            ),
            None => self.set(
                UpdateStatus::Failed {
                    message: error.to_string(),
                },
                true,
            ),
        }
    }

    pub async fn check(&self) -> UpdaterState {
        if !self.backend.supported() {
            return self.state();
        }
        let token = match self.backend.token() {
            Ok(Some(token)) => token,
            Ok(None) => {
                self.set(UpdateStatus::NeedsToken, false);
                return self.state();
            }
            Err(error) => {
                self.set(
                    UpdateStatus::Failed {
                        message: error.to_string(),
                    },
                    false,
                );
                return self.state();
            }
        };
        let Ok(mut staged) = self.staged.try_lock() else {
            return self.state();
        };

        self.set(UpdateStatus::Checking, false);
        let found = match self.backend.check(token).await {
            Ok(Some(found)) => found,
            Ok(None) => {
                *staged = None;
                self.set(UpdateStatus::Idle, true);
                return self.state();
            }
            Err(error) => {
                self.settle_failure(&staged, error);
                return self.state();
            }
        };

        if staged
            .as_ref()
            .is_some_and(|current| current.version == found.version)
        {
            self.set(
                UpdateStatus::Ready {
                    version: found.version,
                },
                true,
            );
            return self.state();
        }

        self.set(
            UpdateStatus::Downloading {
                version: found.version.clone(),
            },
            true,
        );
        match self.backend.download(&found.pending).await {
            Ok(files) => {
                let version = found.version.clone();
                *staged = Some(Staged {
                    version: found.version,
                    pending: found.pending,
                    staged: files,
                });
                self.set(UpdateStatus::Ready { version }, false);
            }
            Err(error) => self.settle_failure(&staged, error),
        }
        self.state()
    }

    pub async fn restart(&self) -> Result<()> {
        let staged = self.staged.try_lock().map_err(|_| Error::NotReady)?;
        let staged = staged.as_ref().ok_or(Error::NotReady)?;
        if let Some(reason) = self.backend.busy().await {
            return Err(Error::Busy(reason));
        }
        self.backend.install(&staged.pending, &staged.staged)?;
        self.backend.relaunch();
        Ok(())
    }

    pub fn set_token(&self, token: &str) -> Result<()> {
        let token = token.trim();
        if token.is_empty() {
            return Err(Error::EmptyToken);
        }
        self.backend.save_token(Some(token))?;
        if self.backend.supported() {
            self.set(UpdateStatus::Idle, false);
        }
        Ok(())
    }

    pub fn clear_token(&self) -> Result<()> {
        self.backend.save_token(None)?;
        if self.backend.supported() {
            self.set(UpdateStatus::NeedsToken, false);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    #[derive(Default)]
    struct Fake {
        token: Mutex<Option<String>>,
        busy: Mutex<Option<BusyReason>>,
        latest: Option<&'static str>,
        checks: Mutex<Vec<String>>,
        downloads: Mutex<u32>,
        installs: Mutex<Vec<String>>,
        relaunches: Mutex<u32>,
    }

    impl Fake {
        fn with_release(token: Option<&str>, latest: &'static str) -> Self {
            Self {
                token: Mutex::new(token.map(str::to_string)),
                latest: Some(latest),
                ..Default::default()
            }
        }
    }

    impl Backend for Fake {
        type Pending = String;
        type Staged = String;

        fn current_version(&self) -> String {
            "0.1.0".into()
        }

        fn supported(&self) -> bool {
            true
        }

        fn token(&self) -> Result<Option<String>> {
            Ok(self.token.lock().unwrap().clone())
        }

        fn save_token(&self, token: Option<&str>) -> Result<()> {
            *self.token.lock().unwrap() = token.map(str::to_string);
            Ok(())
        }

        async fn check(&self, token: String) -> Result<Option<Found<String>>> {
            self.checks.lock().unwrap().push(token);
            Ok(self.latest.map(|version| Found {
                version: version.into(),
                pending: version.into(),
            }))
        }

        async fn download(&self, pending: &String) -> Result<String> {
            *self.downloads.lock().unwrap() += 1;
            Ok(format!("{pending}.app.tar.gz"))
        }

        async fn busy(&self) -> Option<BusyReason> {
            *self.busy.lock().unwrap()
        }

        fn install(&self, _pending: &String, staged: &String) -> Result<()> {
            self.installs.lock().unwrap().push(staged.clone());
            Ok(())
        }

        fn relaunch(&self) {
            *self.relaunches.lock().unwrap() += 1;
        }

        fn publish(&self, _state: &UpdaterState) {}
    }

    fn ready(version: &str) -> UpdateStatus {
        UpdateStatus::Ready {
            version: version.into(),
        }
    }

    #[tokio::test]
    async fn without_a_token_the_updater_stays_idle_and_never_calls_github() {
        let core = Core::new(Fake::with_release(None, "0.2.0"));
        assert_eq!(core.state().status, UpdateStatus::NeedsToken);

        let state = core.check().await;

        assert_eq!(state.status, UpdateStatus::NeedsToken);
        assert!(core.backend.checks.lock().unwrap().is_empty());
        assert_eq!(*core.backend.downloads.lock().unwrap(), 0);

        core.set_token("  github_pat_abc \n").unwrap();
        let state = core.check().await;

        assert_eq!(state.status, ready("0.2.0"));
        assert_eq!(*core.backend.checks.lock().unwrap(), vec!["github_pat_abc"]);
        assert_eq!(*core.backend.downloads.lock().unwrap(), 1);
    }

    async fn restart_is_refused_while(reason: BusyReason) {
        let core = Core::new(Fake::with_release(Some("tok"), "0.2.0"));
        assert_eq!(core.check().await.status, ready("0.2.0"));

        *core.backend.busy.lock().unwrap() = Some(reason);
        let refused = core.restart().await;

        assert!(matches!(refused, Err(Error::Busy(r)) if r == reason));
        assert!(core.backend.installs.lock().unwrap().is_empty());
        assert_eq!(*core.backend.relaunches.lock().unwrap(), 0);
        assert_eq!(core.state().status, ready("0.2.0"));

        *core.backend.busy.lock().unwrap() = None;
        core.restart().await.unwrap();

        assert_eq!(
            *core.backend.installs.lock().unwrap(),
            vec!["0.2.0.app.tar.gz"]
        );
        assert_eq!(*core.backend.relaunches.lock().unwrap(), 1);
    }

    #[tokio::test]
    async fn restart_never_installs_while_recording() {
        restart_is_refused_while(BusyReason::Recording).await;
    }

    #[tokio::test]
    async fn restart_never_installs_while_the_coach_is_answering() {
        restart_is_refused_while(BusyReason::CoachAnswering).await;
    }

    #[tokio::test]
    async fn a_repeated_check_for_the_staged_version_does_not_download_again() {
        let core = Core::new(Fake::with_release(Some("tok"), "0.2.0"));

        core.check().await;
        let state = core.check().await;

        assert_eq!(state.status, ready("0.2.0"));
        assert_eq!(core.backend.checks.lock().unwrap().len(), 2);
        assert_eq!(*core.backend.downloads.lock().unwrap(), 1);
    }
}
