#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
    #[error("the coach could not find {0}; set {1} to its path")]
    NotFound(&'static str, &'static str),
    #[error("the coach stopped while starting ({0})")]
    Exited(std::process::ExitStatus),
    #[error("the coach did not start within {0} seconds")]
    StartTimeout(u64),
    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, Error>;
