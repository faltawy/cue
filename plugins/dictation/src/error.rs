use serde::{Serialize, ser::Serializer};

#[derive(Debug, Clone, Copy, Serialize, serde::Deserialize, specta::Type, thiserror::Error)]
#[serde(rename_all = "snake_case")]
pub enum CaptureFailure {
    #[error(
        "No audio arrived from the microphone. Check your microphone connection or choose another microphone."
    )]
    NoAudio,
    #[error(
        "The microphone stopped delivering audio. Reconnect it or choose another microphone, then try again."
    )]
    Stalled,
    #[error("The microphone disconnected during dictation. Reconnect it and try again.")]
    Disconnected,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("not supported on this platform")]
    Unsupported,
    #[error("voice recording is already active")]
    AlreadyRecording,
    #[error("voice recording is not active")]
    NotRecording,
    #[error(transparent)]
    CaptureFailed(#[from] CaptureFailure),
    #[error("microphone capture failed: {0}")]
    Capture(String),
    #[error("voice recording failed: {0}")]
    Recording(String),
    #[error("voice recording task failed: {0}")]
    Task(String),
    #[error("unknown voice recording")]
    UnknownRecording,
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
