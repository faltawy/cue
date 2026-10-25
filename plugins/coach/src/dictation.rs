use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use tokio::sync::oneshot;

use crate::{CoachDictationRequested, Error, Result};

const MAX_PENDING: usize = 16;

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum DictationAction {
    Start,
    Stop,
    Cancel,
}

#[derive(Debug, serde::Deserialize, specta::Type)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum DictationResult {
    Ok { text: Option<String> },
    Error { error: String },
}

#[derive(Default)]
pub(crate) struct Broker {
    pending: Mutex<HashMap<String, oneshot::Sender<DictationResult>>>,
}

impl Broker {
    pub async fn request(
        &self,
        recording_id: String,
        action: DictationAction,
        emit: impl FnOnce(CoachDictationRequested) -> Result<()>,
    ) -> Result<Option<String>> {
        let timeout = match action {
            DictationAction::Stop => Duration::from_secs(180),
            DictationAction::Start | DictationAction::Cancel => Duration::from_secs(15),
        };
        self.request_with_timeout(recording_id, action, timeout, emit)
            .await
    }

    async fn request_with_timeout(
        &self,
        recording_id: String,
        action: DictationAction,
        timeout: Duration,
        emit: impl FnOnce(CoachDictationRequested) -> Result<()>,
    ) -> Result<Option<String>> {
        let request_id = uuid::Uuid::new_v4().to_string();
        let (sender, receiver) = oneshot::channel();
        {
            let mut pending = self
                .pending
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if pending.len() >= MAX_PENDING {
                return Err(Error::Other("too many pending dictation requests".into()));
            }
            pending.insert(request_id.clone(), sender);
        }
        let _cleanup = PendingRequest {
            broker: self,
            request_id: request_id.clone(),
        };
        emit(CoachDictationRequested {
            request_id,
            recording_id,
            action,
        })?;
        let result = tokio::time::timeout(timeout, receiver)
            .await
            .map_err(|_| {
                Error::Other("the desktop did not finish the dictation request in time".into())
            })?
            .map_err(|_| Error::Other("the dictation request was cancelled".into()))?;
        match result {
            DictationResult::Ok { text } => Ok(text),
            DictationResult::Error { error } => Err(Error::Other(error)),
        }
    }

    pub fn complete(&self, request_id: &str, result: DictationResult) -> Result<()> {
        self.pending
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .remove(request_id)
            .ok_or_else(|| Error::Other("the dictation request is no longer pending".into()))?
            .send(result)
            .map_err(|_| Error::Other("the dictation request was cancelled".into()))
    }
}

struct PendingRequest<'a> {
    broker: &'a Broker,
    request_id: String,
}

impl Drop for PendingRequest<'_> {
    fn drop(&mut self) {
        self.broker
            .pending
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .remove(&self.request_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn timed_out_requests_release_capacity_and_cannot_complete_later() {
        let broker = Broker::default();
        for _ in 0..=MAX_PENDING {
            let mut request_id = String::new();
            let result = broker
                .request_with_timeout(
                    "recording".into(),
                    DictationAction::Stop,
                    Duration::ZERO,
                    |event| {
                        request_id = event.request_id;
                        Ok(())
                    },
                )
                .await;
            assert_eq!(
                result.unwrap_err().to_string(),
                "the desktop did not finish the dictation request in time"
            );
            assert_eq!(
                broker
                    .complete(
                        &request_id,
                        DictationResult::Ok {
                            text: Some("late".into())
                        }
                    )
                    .unwrap_err()
                    .to_string(),
                "the dictation request is no longer pending"
            );
        }
        let text = broker
            .request("recording".into(), DictationAction::Stop, |event| {
                broker.complete(
                    &event.request_id,
                    DictationResult::Ok {
                        text: Some("spoken words".into()),
                    },
                )
            })
            .await
            .unwrap();
        assert_eq!(text.as_deref(), Some("spoken words"));
        let error = broker
            .request("recording".into(), DictationAction::Start, |event| {
                broker.complete(
                    &event.request_id,
                    DictationResult::Error {
                        error: "microphone unavailable".into(),
                    },
                )
            })
            .await
            .unwrap_err();
        assert_eq!(error.to_string(), "microphone unavailable");
    }

    #[tokio::test]
    async fn dropping_a_request_releases_its_pending_reply() {
        let broker = std::sync::Arc::new(Broker::default());
        let (sent, received) = oneshot::channel();
        let source = broker.clone();
        let task = tokio::spawn(async move {
            source
                .request("recording".into(), DictationAction::Stop, |event| {
                    sent.send(event.request_id).unwrap();
                    Ok(())
                })
                .await
        });
        let request_id = received.await.unwrap();
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert_eq!(
            broker
                .complete(
                    &request_id,
                    DictationResult::Ok {
                        text: Some("late".into())
                    }
                )
                .unwrap_err()
                .to_string(),
            "the dictation request is no longer pending"
        );
        let text = broker
            .request("recording".into(), DictationAction::Stop, |event| {
                broker.complete(
                    &event.request_id,
                    DictationResult::Ok {
                        text: Some("next recording".into()),
                    },
                )
            })
            .await
            .unwrap();
        assert_eq!(text.as_deref(), Some("next recording"));
    }
}
