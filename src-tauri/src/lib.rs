pub mod signaling;
pub mod discovery;
pub mod ws_server;
pub mod room_state;
pub mod auth;
pub mod endpoint_probe;
pub mod invite_code;
pub mod nat_mapping;
pub mod room_preparation;
pub mod room_broadcast;
pub mod webrtc_router;
pub mod host_migration;
pub mod hotkeys;

use hotkeys::{register_global_hotkeys, unregister_global_hotkeys, HotkeyState};
use invite_code::{
    decode_invite_code, encode_invite_code, format_invite_code, InviteCodePayload, InviteEndpointScope,
    InviteJoinMode,
};
use endpoint_probe::probe_endpoint;
use room_preparation::RoomPreparationState;
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreparedRoomInviteDto {
    invite_code: String,
    port: u16,
    reused_last_successful_port: bool,
    used_external_mapping: bool,
    nat_mapping_protocol: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EndpointProbeResultDto {
    reachable: bool,
    failure_kind: Option<String>,
    elapsed_ms: u64,
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

#[tauri::command]
async fn prepare_room_invite(
    state: tauri::State<'_, RoomPreparationState>,
    ipv4: String,
    expiry_slot: u16,
) -> Result<PreparedRoomInviteDto, String> {
    let ipv4 = ipv4
        .parse()
        .map_err(|_| format!("invalid ipv4 address: {ipv4}"))?;
    let prepared = state
        .inner()
        .prepare_room_invite(ipv4, expiry_slot)
        .await
        .map_err(|err| format!("{err:?}"))?;

    Ok(PreparedRoomInviteDto {
            invite_code: prepared.invite_code,
            port: prepared.port,
            reused_last_successful_port: prepared.reused_last_successful_port,
            used_external_mapping: prepared.used_external_mapping,
            nat_mapping_protocol: prepared
                .nat_mapping_protocol
                .map(format_nat_mapping_protocol),
        })
}

#[tauri::command]
fn probe_room_endpoint(ipv4: String, port: u16, timeout_ms: u64) -> Result<EndpointProbeResultDto, String> {
    let ipv4 = ipv4
        .parse()
        .map_err(|_| format!("invalid ipv4 address: {ipv4}"))?;
    let result = probe_endpoint(ipv4, port, timeout_ms);

    Ok(EndpointProbeResultDto {
        reachable: result.reachable,
        failure_kind: result.failure_kind.map(str::to_string),
        elapsed_ms: result.elapsed_ms,
    })
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

fn format_nat_mapping_protocol(value: nat_mapping::NatMappingProtocol) -> String {
    match value {
        nat_mapping::NatMappingProtocol::Upnp => "upnp".to_string(),
        nat_mapping::NatMappingProtocol::Pcp => "pcp".to_string(),
        nat_mapping::NatMappingProtocol::NatPmp => "nat-pmp".to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(HotkeyState::default())
        .manage(RoomPreparationState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            bind_global_hotkeys,
            unbind_global_hotkeys,
            get_global_hotkeys,
            generate_invite_code,
            prettify_invite_code,
            parse_invite_code,
            prepare_room_invite,
            probe_room_endpoint
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
