use anyhow::Result;

pub(super) const CHUNK_SIZE: usize = 256;
pub(super) const BUFFER_SIZE: usize = CHUNK_SIZE * 256;

mod macos;

pub use macos::SpeakerStream;

// https://github.com/floneum/floneum/blob/50afe10/interfaces/kalosm-sound/src/source/mic.rs#L41
pub struct SpeakerInput {
    inner: macos::SpeakerInput,
}

impl SpeakerInput {
    pub fn new() -> Result<Self> {
        let inner = macos::SpeakerInput::new()?;
        Ok(Self { inner })
    }

    pub fn sample_rate(&self) -> u32 {
        self.inner.sample_rate()
    }

    pub fn stream(self) -> Result<SpeakerStream> {
        self.inner.stream()
    }
}
