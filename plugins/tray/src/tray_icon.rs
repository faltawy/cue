use tauri::{Result, image::Image};

#[derive(Debug, PartialEq)]
pub enum TrayIconState {
    Default,
    Nudged,
    Degraded,
    Recording,
    CoachListening,
    CoachListeningNudged,
}

pub const RECORDING_FRAMES: &[&[u8]] = &[
    include_bytes!("../icons/tray_recording_0.png"),
    include_bytes!("../icons/tray_recording_1.png"),
    include_bytes!("../icons/tray_recording_2.png"),
];

impl TrayIconState {
    pub fn of(recording: bool, degraded: bool, coach_running: bool, nudged: bool) -> Self {
        match (recording, degraded, coach_running, nudged) {
            (_, true, _, _) => Self::Degraded,
            (true, _, true, false) => Self::CoachListening,
            (true, _, true, true) => Self::CoachListeningNudged,
            (true, _, false, _) => Self::Recording,
            (false, _, _, true) => Self::Nudged,
            (false, _, _, false) => Self::Default,
        }
    }

    /// The recording icon is animated through [`RECORDING_FRAMES`]; this is its first frame.
    pub fn to_image(&self) -> Result<Image<'static>> {
        Image::from_bytes(match self {
            Self::Default => include_bytes!("../icons/tray_default.png"),
            Self::Nudged => include_bytes!("../icons/tray_nudged.png"),
            Self::Degraded => include_bytes!("../icons/tray_degraded.png"),
            Self::Recording => RECORDING_FRAMES[0],
            Self::CoachListening => include_bytes!("../icons/tray_coach.png"),
            Self::CoachListeningNudged => include_bytes!("../icons/tray_coach_nudged.png"),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::TrayIconState;

    #[test]
    fn recording_with_the_coach_running_is_a_still_listening_icon_not_the_animation() {
        assert_eq!(
            TrayIconState::of(true, false, false, false),
            TrayIconState::Recording
        );
        assert_eq!(
            TrayIconState::of(true, false, true, false),
            TrayIconState::CoachListening
        );
    }

    #[test]
    fn an_unseen_nudge_badges_the_icon_while_idle_or_listening() {
        assert_eq!(
            TrayIconState::of(false, false, true, false),
            TrayIconState::Default
        );
        assert_eq!(
            TrayIconState::of(false, false, true, true),
            TrayIconState::Nudged
        );
        assert_eq!(
            TrayIconState::of(true, false, true, true),
            TrayIconState::CoachListeningNudged
        );
        assert_eq!(
            TrayIconState::of(true, true, true, true),
            TrayIconState::Degraded
        );
    }
}
