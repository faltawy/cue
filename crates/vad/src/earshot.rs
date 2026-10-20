pub use ::earshot;
use ::earshot::VoiceActivityProfile;

pub const FRAME_10MS: usize = 160;
pub const FRAME_20MS: usize = 320;
pub const FRAME_30MS: usize = 480;

#[derive(Debug, thiserror::Error)]
#[error("voice activity detection failed")]
pub struct VadError;

pub struct VoiceActivityDetector {
    inner: ::earshot::VoiceActivityDetector,
}

impl VoiceActivityDetector {
    pub fn new() -> Self {
        Self {
            inner: ::earshot::VoiceActivityDetector::new(VoiceActivityProfile::QUALITY),
        }
    }

    pub fn predict_16khz(&mut self, samples: &[i16]) -> Result<bool, VadError> {
        self.inner.predict_16khz(samples).map_err(|_| VadError)
    }
}

impl Default for VoiceActivityDetector {
    fn default() -> Self {
        Self::new()
    }
}

pub fn choose_optimal_frame_size(len: usize) -> usize {
    if len >= FRAME_30MS && len.is_multiple_of(FRAME_30MS) {
        FRAME_30MS
    } else if len >= FRAME_20MS && len.is_multiple_of(FRAME_20MS) {
        FRAME_20MS
    } else if len >= FRAME_10MS && len.is_multiple_of(FRAME_10MS) {
        FRAME_10MS
    } else {
        let padding_30 = (FRAME_30MS - (len % FRAME_30MS)) % FRAME_30MS;
        let padding_20 = (FRAME_20MS - (len % FRAME_20MS)) % FRAME_20MS;
        let padding_10 = (FRAME_10MS - (len % FRAME_10MS)) % FRAME_10MS;

        if padding_30 <= padding_20 && padding_30 <= padding_10 {
            FRAME_30MS
        } else if padding_20 <= padding_10 {
            FRAME_20MS
        } else {
            FRAME_10MS
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_size_selection() {
        assert_eq!(choose_optimal_frame_size(160), 160);
        assert_eq!(choose_optimal_frame_size(320), 320);
        assert_eq!(choose_optimal_frame_size(480), 480);
        assert_eq!(choose_optimal_frame_size(960), 480);
        assert_eq!(choose_optimal_frame_size(640), 320);
        assert_eq!(choose_optimal_frame_size(512), 320);
    }

    fn speech_with_room_noise(gain: f32, noise_peak: f32, secs: usize) -> Vec<i16> {
        let mut seed = 7_u64;
        anlg_data::english_1::AUDIO
            .chunks_exact(2)
            .take(secs * 16_000)
            .map(|bytes| {
                seed = seed
                    .wrapping_mul(6_364_136_223_846_793_005)
                    .wrapping_add(1_442_695_040_888_963_407);
                let noise = ((seed >> 33) as f32 / (1_u64 << 31) as f32 - 0.5) * 2.0 * noise_peak;
                let speech = i16::from_le_bytes([bytes[0], bytes[1]]) as f32;
                (speech * gain + noise).clamp(i16::MIN as f32, i16::MAX as f32) as i16
            })
            .collect()
    }

    fn decisions(vad: &mut VoiceActivityDetector, audio: &[i16]) -> Vec<bool> {
        audio
            .chunks_exact(FRAME_30MS)
            .map(|frame| vad.predict_16khz(frame).unwrap())
            .collect()
    }

    // The stock crate capped the GMM deviations at MIN_STD instead of flooring them, so in a noisy
    // room they shrank until the speech probability overflowed i16 ("attempt to subtract with
    // overflow"), killing the audio source mid-meeting.
    #[test]
    fn speech_in_a_noisy_room_keeps_the_model_in_range() {
        let mut vad = VoiceActivityDetector::new();

        let speech = decisions(&mut vad, &speech_with_room_noise(1.0, 1_500.0, 20));
        let silence = decisions(&mut vad, &[0; FRAME_30MS * 20]);

        assert!(speech.contains(&true));
        assert_eq!(silence.last(), Some(&false));
    }

    #[test]
    fn clipped_speech_reaching_i16_min_is_still_speech() {
        let mut vad = VoiceActivityDetector::new();
        let clipped = speech_with_room_noise(16.0, 0.0, 10);
        assert!(clipped.contains(&i16::MIN));

        assert!(decisions(&mut vad, &clipped).contains(&true));
    }
}
