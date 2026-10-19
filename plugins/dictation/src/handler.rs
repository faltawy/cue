use crate::{error::Error, events::Phase};

#[cfg(target_os = "macos")]
pub use self::macos::Handler;

#[cfg(target_os = "macos")]
mod macos {
    use std::sync::Mutex;

    use anlg_dictation_ui_macos as ui;

    use super::{Error, Phase};

    pub struct Handler {
        state: Mutex<State>,
    }

    struct State {
        phase: Phase,
        amplitude: f32,
        preview: String,
        visible: bool,
    }

    impl State {
        fn ui_state(&self) -> ui::DictationState {
            ui::DictationState {
                phase: to_ui_phase(self.phase),
                amplitude: self.amplitude,
                preview: self.preview.clone(),
            }
        }
    }

    impl Handler {
        pub fn new(_app: tauri::AppHandle) -> Self {
            Self {
                state: Mutex::new(State {
                    phase: Phase::Recording,
                    amplitude: 0.0,
                    preview: String::new(),
                    visible: false,
                }),
            }
        }

        pub fn show(&self) -> Result<(), Error> {
            let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
            ui::show();
            ui::update_state(&s.ui_state());
            s.visible = true;
            Ok(())
        }

        pub fn hide(&self) -> Result<(), Error> {
            let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
            ui::hide();
            s.visible = false;
            Ok(())
        }

        pub fn set_phase(&self, phase: Phase) -> Result<(), Error> {
            let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
            s.phase = phase;
            if s.visible {
                ui::update_state(&s.ui_state());
            }
            Ok(())
        }

        pub fn update_amplitude(&self, amplitude: f32) -> Result<(), Error> {
            let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
            s.amplitude = amplitude;
            if s.visible {
                ui::update_state(&s.ui_state());
            }
            Ok(())
        }

        pub fn set_preview(&self, preview: String) -> Result<(), Error> {
            let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
            s.preview = preview;
            if s.visible {
                ui::update_state(&s.ui_state());
            }
            Ok(())
        }
    }

    fn to_ui_phase(phase: Phase) -> ui::Phase {
        match phase {
            Phase::Recording => ui::Phase::Recording,
            Phase::Processing => ui::Phase::Processing,
        }
    }
}
