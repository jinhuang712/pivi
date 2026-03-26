pub mod signaling;
pub mod discovery;
pub mod ws_server;
pub mod room_state;
pub mod auth;
pub mod invite_code;
pub mod room_broadcast;
pub mod webrtc_router;
pub mod host_migration;
pub mod hotkeys;

use hotkeys::{register_global_hotkeys, unregister_global_hotkeys, HotkeyState};
use invite_code::{
    decode_invite_code, encode_invite_code, format_invite_code, InviteCodePayload, InviteEndpointScope,
    InviteJoinMode,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InviteCodePayloadDto {
    endpoint_scope: String,
    join_mode: String,
    ipv4: String,
    port: u16,
    expiry_slot: u16,
}

impl TryFrom<InviteCodePayloadDto> for InviteCodePayload {
    type Error = String;

    fn try_from(value: InviteCodePayloadDto) -> Result<Self, Self::Error> {
        Ok(Self {
            endpoint_scope: parse_endpoint_scope(&value.endpoint_scope)?,
            join_mode: parse_join_mode(&value.join_mode)?,
            ipv4: value
                .ipv4
                .parse()
                .map_err(|_| format!("invalid ipv4 address: {}", value.ipv4))?,
            port: value.port,
            expiry_slot: value.expiry_slot,
        })
    }
}

impl From<InviteCodePayload> for InviteCodePayloadDto {
    fn from(value: InviteCodePayload) -> Self {
        Self {
            endpoint_scope: format_endpoint_scope(value.endpoint_scope).to_string(),
            join_mode: format_join_mode(value.join_mode).to_string(),
            ipv4: value.ipv4.to_string(),
            port: value.port,
            expiry_slot: value.expiry_slot,
        }
    }
}

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

#[tauri::command]
fn generate_invite_code(payload: InviteCodePayloadDto) -> Result<String, String> {
    encode_invite_code(&InviteCodePayload::try_from(payload)?).map_err(|err| format!("{err:?}"))
}

#[tauri::command]
fn prettify_invite_code(code: String) -> Result<String, String> {
    format_invite_code(&code).map_err(|err| format!("{err:?}"))
}

#[tauri::command]
fn parse_invite_code(code: String, current_slot: u16) -> Result<InviteCodePayloadDto, String> {
    decode_invite_code(&code, current_slot)
        .map(InviteCodePayloadDto::from)
        .map_err(|err| format!("{err:?}"))
}

fn parse_endpoint_scope(value: &str) -> Result<InviteEndpointScope, String> {
    match value {
        "private-lan-ipv4" => Ok(InviteEndpointScope::PrivateLanIpv4),
        "public-mapped-ipv4" => Ok(InviteEndpointScope::PublicMappedIpv4),
        "public-direct-ipv4" => Ok(InviteEndpointScope::PublicDirectIpv4),
        _ => Err(format!("unsupported endpoint scope: {value}")),
    }
}

fn format_endpoint_scope(value: InviteEndpointScope) -> &'static str {
    match value {
        InviteEndpointScope::PrivateLanIpv4 => "private-lan-ipv4",
        InviteEndpointScope::PublicMappedIpv4 => "public-mapped-ipv4",
        InviteEndpointScope::PublicDirectIpv4 => "public-direct-ipv4",
    }
}

fn parse_join_mode(value: &str) -> Result<InviteJoinMode, String> {
    match value {
        "direct-host" => Ok(InviteJoinMode::DirectHost),
        "host-relay-preferred" => Ok(InviteJoinMode::HostRelayPreferred),
        _ => Err(format!("unsupported join mode: {value}")),
    }
}

fn format_join_mode(value: InviteJoinMode) -> &'static str {
    match value {
        InviteJoinMode::DirectHost => "direct-host",
        InviteJoinMode::HostRelayPreferred => "host-relay-preferred",
    }
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
            get_global_hotkeys,
            generate_invite_code,
            prettify_invite_code,
            parse_invite_code
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
