use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HotkeyConfig {
    pub ptt: String,
    pub mute: String,
}

#[derive(Default)]
pub struct HotkeyState {
    inner: Mutex<Option<HotkeyConfig>>,
}

impl HotkeyState {
    pub fn set(&self, config: HotkeyConfig) {
        if let Ok(mut guard) = self.inner.lock() {
            *guard = Some(config);
        }
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.inner.lock() {
            *guard = None;
        }
    }

    pub fn get(&self) -> Option<HotkeyConfig> {
        self.inner.lock().ok().and_then(|guard| guard.clone())
    }
}

pub fn validate_shortcut(input: &str) -> Result<Shortcut, String> {
    input
        .parse::<Shortcut>()
        .map_err(|_| format!("invalid shortcut: {input}"))
}

pub fn register_global_hotkeys(
    app: &tauri::AppHandle,
    state: &HotkeyState,
    ptt: &str,
    mute: &str,
) -> Result<(), String> {
    let ptt_shortcut = validate_shortcut(ptt)?;
    let mute_shortcut = validate_shortcut(mute)?;

    let manager = app.global_shortcut();
    manager.unregister_all().map_err(|e| e.to_string())?;
    manager.register(ptt_shortcut).map_err(|e| e.to_string())?;
    if ptt != mute {
        manager.register(mute_shortcut).map_err(|e| e.to_string())?;
    }

    state.set(HotkeyConfig {
        ptt: ptt.to_string(),
        mute: mute.to_string(),
    });
    Ok(())
}

pub fn unregister_global_hotkeys(app: &tauri::AppHandle, state: &HotkeyState) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;
    state.clear();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_valid_shortcut_should_pass() {
        let res = validate_shortcut("CTRL+SHIFT+M");
        assert!(res.is_ok());
    }

    #[test]
    fn validate_invalid_shortcut_should_fail() {
        let res = validate_shortcut("NOT_A_SHORTCUT");
        assert!(res.is_err());
    }

    #[test]
    fn state_set_get_clear_should_work() {
        let state = HotkeyState::default();
        state.set(HotkeyConfig {
            ptt: "CTRL+SHIFT+V".to_string(),
            mute: "CTRL+SHIFT+M".to_string(),
        });
        let current = state.get();
        assert_eq!(
            current,
            Some(HotkeyConfig {
                ptt: "CTRL+SHIFT+V".to_string(),
                mute: "CTRL+SHIFT+M".to_string(),
            })
        );
        state.clear();
        assert_eq!(state.get(), None);
    }
}
