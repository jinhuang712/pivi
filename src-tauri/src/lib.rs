pub mod signaling;
pub mod discovery;
pub mod ws_server;
pub mod room_state;
pub mod auth;
pub mod room_broadcast;
pub mod webrtc_router;
pub mod host_migration;
pub mod hotkeys;

use hotkeys::{register_global_hotkeys, unregister_global_hotkeys, HotkeyState};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn bind_global_hotkeys(
    app: tauri::AppHandle,
    state: tauri::State<HotkeyState>,
    ptt: String,
    mute: String,
) -> Result<(), String> {
    register_global_hotkeys(&app, &state, &ptt, &mute)
}

#[tauri::command]
fn unbind_global_hotkeys(app: tauri::AppHandle, state: tauri::State<HotkeyState>) -> Result<(), String> {
    unregister_global_hotkeys(&app, &state)
}

#[tauri::command]
fn get_global_hotkeys(state: tauri::State<HotkeyState>) -> Option<hotkeys::HotkeyConfig> {
    state.get()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(HotkeyState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            bind_global_hotkeys,
            unbind_global_hotkeys,
            get_global_hotkeys
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
