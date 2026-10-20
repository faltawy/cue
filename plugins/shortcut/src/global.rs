use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_specta::Event;

use crate::{CoachShortcutPressed, ShortcutEvent, ShortcutPluginExt};

#[derive(Default)]
pub struct GlobalState {
    registration: tokio::sync::Mutex<Registration>,
    active: Arc<AtomicBool>,
    coach: std::sync::Mutex<Option<Shortcut>>,
}

fn coach_key(app: &tauri::AppHandle) -> Option<Shortcut> {
    *app.state::<GlobalState>()
        .coach
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

#[derive(Default)]
struct Registration {
    shortcut: Option<Shortcut>,
    cancel_keys: Vec<Shortcut>,
}

#[tauri::command]
#[specta::specta]
pub async fn configure(app: tauri::AppHandle, shortcut: Option<String>) -> Result<(), String> {
    if let Some(value) = &shortcut {
        validate(app.clone(), value.clone())?;
        if parse_shortcut(value)
            .ok()
            .is_some_and(|key| Some(key) == coach_key(&app))
        {
            return Err("This shortcut already opens the coach. Choose another.".into());
        }
    }
    let state = app.state::<GlobalState>();
    let mut registration = state.registration.lock().await;
    state.active.store(false, Ordering::SeqCst);
    let native_only = matches!(shortcut.as_deref(), Some("Fn" | "RightCommand"));
    if let Some(global) =
        app.try_state::<tauri_plugin_global_shortcut::GlobalShortcut<tauri::Wry>>()
    {
        while let Some(key) = registration.cancel_keys.last().copied() {
            global.unregister(key).map_err(|e| e.to_string())?;
            registration.cancel_keys.pop();
        }
    } else if (!native_only && shortcut.is_some())
        || registration.shortcut.is_some()
        || !registration.cancel_keys.is_empty()
    {
        return Err("Global shortcuts are unavailable in this desktop session.".into());
    }
    app.shortcut().unregister().map_err(|e| e.to_string())?;
    if let Some(previous) = registration.shortcut {
        app.global_shortcut()
            .unregister(previous)
            .map_err(|e| e.to_string())?;
        registration.shortcut = None;
    }
    let Some(shortcut) = shortcut else {
        return Ok(());
    };

    if shortcut == "Fn" || shortcut == "RightCommand" {
        return app
            .shortcut()
            .register(
                crate::HotKey {
                    key: None,
                    modifiers: vec![if shortcut == "Fn" {
                        crate::Modifier::Fn
                    } else {
                        crate::Modifier::RightCommand
                    }],
                },
                crate::Options {
                    double_tap_lock_enabled: false,
                    ..Default::default()
                },
            )
            .map_err(|e| e.to_string());
    }

    let key = parse_shortcut(&shortcut)?;

    let down = Arc::new(AtomicBool::new(false));
    app.global_shortcut()
        .on_shortcut(key, move |app, _, event| {
            let pressed = event.state == ShortcutState::Pressed;
            if down.swap(pressed, Ordering::SeqCst) == pressed {
                return;
            }
            let event = if pressed {
                ShortcutEvent::Pressed
            } else {
                ShortcutEvent::Released
            };
            let _ = event.emit(app);
        })
        .map_err(|e| {
            format!("Could not register dictation shortcut. It may be used by another app: {e}")
        })?;
    registration.shortcut = Some(key);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn set_active(app: tauri::AppHandle, active: bool) -> Result<(), String> {
    let state = app.state::<GlobalState>();
    let mut registration = state.registration.lock().await;
    state.active.store(active, Ordering::SeqCst);
    if app
        .try_state::<tauri_plugin_global_shortcut::GlobalShortcut<tauri::Wry>>()
        .is_none()
    {
        return Ok(());
    }
    if active {
        let mut keys = vec![Shortcut::new(None, Code::Escape)];
        if let Some(shortcut) = registration.shortcut {
            keys.push(Shortcut::new(Some(shortcut.mods), Code::Escape));
        }
        for key in keys {
            if registration.cancel_keys.contains(&key) {
                continue;
            }
            let enabled = state.active.clone();
            app.global_shortcut()
                .on_shortcut(key, move |app, _, event| {
                    if event.state == ShortcutState::Pressed && enabled.load(Ordering::SeqCst) {
                        let _ = ShortcutEvent::Cancelled.emit(app);
                    }
                })
                .map_err(|e| e.to_string())?;
            registration.cancel_keys.push(key);
        }
    } else {
        while let Some(key) = registration.cancel_keys.last().copied() {
            app.global_shortcut()
                .unregister(key)
                .map_err(|e| e.to_string())?;
            registration.cancel_keys.pop();
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn configure_coach(
    app: tauri::AppHandle,
    shortcut: Option<String>,
) -> Result<(), String> {
    let key = shortcut.as_deref().map(parse_shortcut).transpose()?;
    if key.is_some()
        && key
            == app
                .state::<GlobalState>()
                .registration
                .lock()
                .await
                .shortcut
    {
        return Err("This shortcut already starts dictation. Choose another.".into());
    }
    if app
        .try_state::<tauri_plugin_global_shortcut::GlobalShortcut<tauri::Wry>>()
        .is_none()
    {
        return match key {
            Some(_) => Err("Global shortcuts are unavailable in this desktop session.".into()),
            None => Ok(()),
        };
    }

    let state = app.state::<GlobalState>();
    let mut coach = state.coach.lock().unwrap_or_else(|e| e.into_inner());
    swap_shortcut(
        &mut coach,
        key,
        |key| {
            app.global_shortcut()
                .on_shortcut(key, |app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = CoachShortcutPressed {}.emit(app);
                    }
                })
                .map_err(|e| {
                    format!(
                        "Could not register the coach shortcut. It may be used by another app: {e}"
                    )
                })
        },
        |key| {
            app.global_shortcut()
                .unregister(key)
                .map_err(|e| e.to_string())
        },
    )
}

fn swap_shortcut<K: Copy + PartialEq>(
    current: &mut Option<K>,
    next: Option<K>,
    mut register: impl FnMut(K) -> Result<(), String>,
    mut unregister: impl FnMut(K) -> Result<(), String>,
) -> Result<(), String> {
    if next == *current {
        return Ok(());
    }
    if let Some(key) = next {
        register(key)?;
    }
    if let Some(previous) = *current
        && let Err(error) = unregister(previous)
    {
        if let Some(key) = next {
            unregister(key)?;
        }
        return Err(error);
    }
    *current = next;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn validate(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    validate_shortcut(
        &shortcut,
        app.try_state::<tauri_plugin_global_shortcut::GlobalShortcut<tauri::Wry>>()
            .is_some(),
    )
}

fn validate_shortcut(shortcut: &str, global_available: bool) -> Result<(), String> {
    if matches!(shortcut, "Fn" | "RightCommand") {
        return Ok(());
    }
    parse_shortcut(shortcut)?;
    if !global_available {
        return Err("Global shortcuts are unavailable in this desktop session.".into());
    }
    Ok(())
}

fn parse_shortcut(shortcut: &str) -> Result<Shortcut, String> {
    let key: Shortcut = shortcut
        .parse()
        .map_err(|e| format!("Invalid shortcut: {e}"))?;
    if key.mods.is_empty() {
        return Err("Choose a shortcut with Control, Alt, Shift, or Command.".into());
    }
    if key.key == Code::Escape {
        return Err("Escape is reserved for cancelling dictation. Choose another key.".into());
    }
    Ok(key)
}

#[cfg(test)]
mod validation_tests {
    use super::*;
    #[test]
    fn rejects_invalid_and_reserved_shortcuts_without_registering() {
        for shortcut in ["", "KeyD", "not-a-shortcut", "Control+Escape"] {
            assert!(validate_shortcut(shortcut, true).is_err());
        }
        assert!(validate_shortcut("Control+Alt+KeyD", true).is_ok());
        assert!(validate_shortcut("Control+Alt+KeyD", false).is_err());
        assert!(validate_shortcut("Fn", false).is_ok());
    }

    #[test]
    fn a_coach_shortcut_that_fails_to_register_keeps_the_previous_one_working() {
        let mut registered = vec!["old"];
        let mut current = Some("old");
        let result = swap_shortcut(
            &mut current,
            Some("taken"),
            |_| Err("used by another app".into()),
            |key| {
                registered.retain(|held| *held != key);
                Ok(())
            },
        );
        assert_eq!(result, Err("used by another app".into()));
        assert_eq!(current, Some("old"));
        assert_eq!(registered, vec!["old"]);
    }

    #[test]
    fn a_new_coach_shortcut_replaces_the_previous_one() {
        let mut registered = vec!["old"];
        let mut current = Some("old");
        let mut unregistered = Vec::new();
        swap_shortcut(
            &mut current,
            Some("new"),
            |key| {
                registered.push(key);
                Ok(())
            },
            |key| {
                unregistered.push(key);
                Ok(())
            },
        )
        .unwrap();
        registered.retain(|held| !unregistered.contains(held));
        assert_eq!(current, Some("new"));
        assert_eq!(registered, vec!["new"]);
    }
}
