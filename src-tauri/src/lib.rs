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
pub mod control_runtime;
pub mod webrtc_router;
pub mod host_migration;
pub mod host_runtime_session;
pub mod hotkeys;

use std::net::{Ipv4Addr, UdpSocket};

use tauri::{Emitter, Manager};

use control_runtime::{
    request_remote_join_room, request_remote_relay_signal, request_remote_room_events,
    request_remote_room_state,
    spawn_control_runtime_listener,
};
use host_runtime_session::HostRuntimeSessionManager;
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

#[tauri::command]
fn get_preferred_local_ipv4() -> Result<String, String> {
    detect_preferred_local_ipv4()
        .map(|ipv4| ipv4.to_string())
        .ok_or_else(|| "preferred local ipv4 not found".to_string())
}

#[tauri::command]
fn start_host_runtime_session(
    state: tauri::State<'_, HostRuntimeSessionManager>,
    room_preparation: tauri::State<'_, RoomPreparationState>,
    room_id: String,
    host_id: String,
    host_name: String,
    invite_code: String,
    current_slot: u16,
    listen_host: String,
    listen_port: u16,
) -> Result<host_runtime_session::HostRuntimeReady, String> {
    let lan_ipv4: Ipv4Addr = listen_host
        .parse()
        .map_err(|_| format!("invalid listen host: {listen_host}"))?;
    let runtime = state
        .start_host_session(
            &room_id,
            &host_id,
            &host_name,
            &invite_code,
            current_slot,
            &listen_host,
            listen_port,
            lan_ipv4,
        )
        .map_err(|err| format!("{err:?}"))?;

    let listener = room_preparation
        .active_listener_clone()
        .ok_or_else(|| "active control listener not found".to_string())?;
    spawn_control_runtime_listener(listener, state.inner().clone())
        .map_err(|err| format!("failed to spawn control listener: {err}"))?;

    Ok(runtime)
}

#[tauri::command]
fn join_host_runtime_session(
    state: tauri::State<'_, HostRuntimeSessionManager>,
    room_id: String,
    invite_code: String,
    current_slot: u16,
    user_id: String,
    display_name: String,
) -> Result<host_runtime_session::JoinRuntimeAccepted, String> {
    state
        .join_host_session(&room_id, &invite_code, current_slot, &user_id, &display_name)
        .map_err(|err| format!("{err:?}"))
}

#[tauri::command]
fn join_remote_host_runtime_session(
    ipv4: String,
    port: u16,
    room_id: String,
    invite_code: String,
    current_slot: u16,
    user_id: String,
    display_name: String,
) -> Result<host_runtime_session::JoinRuntimeAccepted, String> {
    let ipv4 = ipv4
        .parse()
        .map_err(|_| format!("invalid ipv4 address: {ipv4}"))?;
    request_remote_join_room(
        ipv4,
        port,
        &room_id,
        &invite_code,
        current_slot,
        &user_id,
        &display_name,
    )
}

#[tauri::command]
fn get_host_runtime_room_state(
    state: tauri::State<'_, HostRuntimeSessionManager>,
    room_id: String,
) -> Option<room_broadcast::RoomBroadcastMessage> {
    state.get_room_state(&room_id)
}

#[tauri::command]
fn get_remote_host_runtime_room_state(
    ipv4: String,
    port: u16,
    room_id: String,
) -> Result<room_broadcast::RoomBroadcastMessage, String> {
    let ipv4 = ipv4
        .parse()
        .map_err(|_| format!("invalid ipv4 address: {ipv4}"))?;
    request_remote_room_state(ipv4, port, &room_id)
}

#[tauri::command]
fn get_host_runtime_room_events(
    state: tauri::State<'_, HostRuntimeSessionManager>,
    room_id: String,
    subscriber_member_id: String,
    last_sequence: u64,
) -> Option<Vec<host_runtime_session::RoomRuntimeEvent>> {
    state.get_events_since_for_member(&room_id, Some(&subscriber_member_id), last_sequence)
}

#[tauri::command]
fn get_remote_host_runtime_room_events(
    ipv4: String,
    port: u16,
    room_id: String,
    subscriber_member_id: String,
    last_sequence: u64,
) -> Result<Vec<host_runtime_session::RoomRuntimeEvent>, String> {
    let ipv4 = ipv4
        .parse()
        .map_err(|_| format!("invalid ipv4 address: {ipv4}"))?;
    request_remote_room_events(ipv4, port, &room_id, &subscriber_member_id, last_sequence)
}

#[tauri::command]
fn relay_host_runtime_signal(
    state: tauri::State<'_, HostRuntimeSessionManager>,
    room_id: String,
    from: String,
    target: String,
    signal_type: String,
    payload: String,
) -> Result<host_runtime_session::RoomRuntimeEvent, String> {
    let signal_type = match signal_type.as_str() {
        "Offer" => webrtc_router::WebRtcSignalType::Offer,
        "Answer" => webrtc_router::WebRtcSignalType::Answer,
        "IceCandidate" => webrtc_router::WebRtcSignalType::IceCandidate,
        _ => return Err(format!("unsupported signal type: {signal_type}")),
    };
    state
        .relay_webrtc_signal(&room_id, &from, &target, signal_type, &payload)
        .map_err(|err| format!("{err:?}"))
}

#[tauri::command]
fn relay_remote_runtime_signal(
    ipv4: String,
    port: u16,
    room_id: String,
    from: String,
    target: String,
    signal_type: String,
    payload: String,
) -> Result<host_runtime_session::RoomRuntimeEvent, String> {
    let ipv4 = ipv4
        .parse()
        .map_err(|_| format!("invalid ipv4 address: {ipv4}"))?;
    let signal_type = match signal_type.as_str() {
        "Offer" => webrtc_router::WebRtcSignalType::Offer,
        "Answer" => webrtc_router::WebRtcSignalType::Answer,
        "IceCandidate" => webrtc_router::WebRtcSignalType::IceCandidate,
        _ => return Err(format!("unsupported signal type: {signal_type}")),
    };
    request_remote_relay_signal(ipv4, port, &room_id, &from, &target, signal_type, &payload)
}

#[tauri::command]
fn get_host_runtime_ready(
    state: tauri::State<'_, HostRuntimeSessionManager>,
    room_id: String,
) -> Option<host_runtime_session::HostRuntimeReady> {
    state.get_runtime_ready(&room_id)
}

#[tauri::command]
fn server_mute_host_runtime_member(
    state: tauri::State<'_, HostRuntimeSessionManager>,
    room_id: String,
    member_id: String,
    server_muted: bool,
) -> Result<host_runtime_session::RoomRuntimeEvent, String> {
    state
        .server_mute_member(&room_id, &member_id, server_muted)
        .map_err(|err| format!("{err:?}"))
}

#[tauri::command]
fn kick_host_runtime_member(
    state: tauri::State<'_, HostRuntimeSessionManager>,
    room_id: String,
    member_id: String,
) -> Result<host_runtime_session::RoomRuntimeEvent, String> {
    state
        .kick_member(&room_id, &member_id)
        .map_err(|err| format!("{err:?}"))
}

#[tauri::command]
fn ban_host_runtime_member(
    state: tauri::State<'_, HostRuntimeSessionManager>,
    room_id: String,
    member_id: String,
) -> Result<host_runtime_session::RoomRuntimeEvent, String> {
    state
        .ban_member(&room_id, &member_id)
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

fn format_nat_mapping_protocol(value: nat_mapping::NatMappingProtocol) -> String {
    match value {
        nat_mapping::NatMappingProtocol::Upnp => "upnp".to_string(),
        nat_mapping::NatMappingProtocol::Pcp => "pcp".to_string(),
        nat_mapping::NatMappingProtocol::NatPmp => "nat-pmp".to_string(),
    }
}

fn detect_preferred_local_ipv4() -> Option<Ipv4Addr> {
    let socket = UdpSocket::bind(("0.0.0.0", 0)).ok()?;
    socket.connect(("8.8.8.8", 80)).ok()?;

    match socket.local_addr().ok()?.ip() {
        std::net::IpAddr::V4(ipv4) if !ipv4.is_loopback() && !ipv4.is_unspecified() => Some(ipv4),
        _ => None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(HotkeyState::default())
        .manage(HostRuntimeSessionManager::default())
        .manage(RoomPreparationState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let state = app.state::<HotkeyState>();
                    if let Some(config) = state.get() {
                        if let Some(hotkey_event) =
                            hotkeys::build_hotkey_event(&config, shortcut, event.state)
                        {
                            let _ = app.emit("pivi-hotkey", hotkey_event);
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            bind_global_hotkeys,
            unbind_global_hotkeys,
            get_global_hotkeys,
            generate_invite_code,
            prettify_invite_code,
            parse_invite_code,
            prepare_room_invite,
            probe_room_endpoint,
            get_preferred_local_ipv4,
            start_host_runtime_session,
            join_host_runtime_session,
            join_remote_host_runtime_session,
            get_host_runtime_room_state,
            get_remote_host_runtime_room_state,
            get_host_runtime_room_events,
            get_remote_host_runtime_room_events,
            relay_host_runtime_signal,
            relay_remote_runtime_signal,
            get_host_runtime_ready,
            server_mute_host_runtime_member,
            kick_host_runtime_member,
            ban_host_runtime_member
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
