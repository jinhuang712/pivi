use std::io::{BufRead, BufReader, Write};
use std::net::{IpAddr, Ipv4Addr, TcpListener, TcpStream};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::host_runtime_session::{
    HostRuntimeSessionManager, JoinRuntimeAccepted, RoomRuntimeEvent,
};
use crate::room_broadcast::RoomBroadcastMessage;
use crate::webrtc_router::WebRtcSignalType;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", content = "payload")]
pub enum ControlRuntimeRequest {
    GetRoomState {
        room_id: String,
    },
    GetEvents {
        room_id: String,
        subscriber_member_id: String,
        last_sequence: u64,
    },
    RelaySignal {
        room_id: String,
        from: String,
        target: String,
        signal_type: WebRtcSignalType,
        payload: String,
    },
    JoinRoom {
        room_id: String,
        invite_code: String,
        current_slot: u16,
        user_id: String,
        display_name: String,
    },
    /// Host-authority requests. `host_member_id` is the member claiming to be
    /// host; the runtime rejects the request unless they actually hold the
    /// Host role, so a non-host joiner cannot kick/mute/ban/transfer.
    ServerMute {
        room_id: String,
        host_member_id: String,
        member_id: String,
        server_muted: bool,
    },
    Kick {
        room_id: String,
        host_member_id: String,
        member_id: String,
    },
    Ban {
        room_id: String,
        host_member_id: String,
        member_id: String,
    },
    TransferHost {
        room_id: String,
        host_member_id: String,
        new_host_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", content = "payload")]
pub enum ControlRuntimeResponse {
    RoomState {
        room_state: RoomBroadcastMessage,
    },
    Events {
        events: Vec<RoomRuntimeEvent>,
    },
    SignalAccepted {
        event: RoomRuntimeEvent,
    },
    JoinAccepted {
        accepted: JoinRuntimeAccepted,
    },
    Error {
        code: String,
        message: String,
    },
}

pub fn handle_control_runtime_request(
    manager: &HostRuntimeSessionManager,
    request: ControlRuntimeRequest,
) -> ControlRuntimeResponse {
    match request {
        ControlRuntimeRequest::GetRoomState { room_id } => manager
            .get_room_state(&room_id)
            .map(|room_state| ControlRuntimeResponse::RoomState { room_state })
            .unwrap_or_else(|| ControlRuntimeResponse::Error {
                code: "room-not-found".to_string(),
                message: "room runtime not found".to_string(),
            }),
        ControlRuntimeRequest::GetEvents {
            room_id,
            subscriber_member_id,
            last_sequence,
        } => manager
            .get_events_since_for_member(&room_id, Some(&subscriber_member_id), last_sequence)
            .map(|events| ControlRuntimeResponse::Events { events })
            .unwrap_or_else(|| ControlRuntimeResponse::Error {
                code: "room-not-found".to_string(),
                message: "room runtime not found".to_string(),
            }),
        ControlRuntimeRequest::RelaySignal {
            room_id,
            from,
            target,
            signal_type,
            payload,
        } => manager
            .relay_webrtc_signal(&room_id, &from, &target, signal_type, &payload)
            .map(|event| ControlRuntimeResponse::SignalAccepted { event })
            .unwrap_or_else(|_| ControlRuntimeResponse::Error {
                code: "signal-rejected".to_string(),
                message: "signal rejected by runtime".to_string(),
            }),
        ControlRuntimeRequest::JoinRoom {
            room_id,
            invite_code,
            current_slot,
            user_id,
            display_name,
        } => manager
            .join_host_session(&room_id, &invite_code, current_slot, &user_id, &display_name)
            .map(|accepted| ControlRuntimeResponse::JoinAccepted { accepted })
            .unwrap_or_else(|_| ControlRuntimeResponse::Error {
                code: "join-rejected".to_string(),
                message: "join rejected by runtime".to_string(),
            }),
        ControlRuntimeRequest::ServerMute {
            room_id,
            host_member_id,
            member_id,
            server_muted,
        } => {
            if !manager.is_host(&room_id, &host_member_id) {
                return ControlRuntimeResponse::Error {
                    code: "not-host".to_string(),
                    message: "only the host may manage members".to_string(),
                };
            }
            manager
                .server_mute_member(&room_id, &member_id, server_muted)
                .map(|event| ControlRuntimeResponse::SignalAccepted { event })
                .unwrap_or_else(|_| ControlRuntimeResponse::Error {
                    code: "member-not-found".to_string(),
                    message: "member not found".to_string(),
                })
        }
        ControlRuntimeRequest::Kick {
            room_id,
            host_member_id,
            member_id,
        } => {
            if !manager.is_host(&room_id, &host_member_id) {
                return ControlRuntimeResponse::Error {
                    code: "not-host".to_string(),
                    message: "only the host may manage members".to_string(),
                };
            }
            manager
                .kick_member(&room_id, &member_id)
                .map(|event| ControlRuntimeResponse::SignalAccepted { event })
                .unwrap_or_else(|_| ControlRuntimeResponse::Error {
                    code: "member-not-found".to_string(),
                    message: "member not found".to_string(),
                })
        }
        ControlRuntimeRequest::Ban {
            room_id,
            host_member_id,
            member_id,
        } => {
            if !manager.is_host(&room_id, &host_member_id) {
                return ControlRuntimeResponse::Error {
                    code: "not-host".to_string(),
                    message: "only the host may manage members".to_string(),
                };
            }
            manager
                .ban_member(&room_id, &member_id)
                .map(|event| ControlRuntimeResponse::SignalAccepted { event })
                .unwrap_or_else(|_| ControlRuntimeResponse::Error {
                    code: "member-not-found".to_string(),
                    message: "member not found".to_string(),
                })
        }
        ControlRuntimeRequest::TransferHost {
            room_id,
            host_member_id,
            new_host_id,
        } => {
            if !manager.is_host(&room_id, &host_member_id) {
                return ControlRuntimeResponse::Error {
                    code: "not-host".to_string(),
                    message: "only the host may transfer host".to_string(),
                };
            }
            manager
                .transfer_host(&room_id, &new_host_id)
                .map(|event| ControlRuntimeResponse::SignalAccepted { event })
                .unwrap_or_else(|_| ControlRuntimeResponse::Error {
                    code: "member-not-found".to_string(),
                    message: "target member not found".to_string(),
                })
        }
    }
}

pub fn spawn_control_runtime_listener(
    listener: TcpListener,
    manager: HostRuntimeSessionManager,
) -> std::io::Result<()> {
    thread::Builder::new()
        .name("pivi-control-runtime".to_string())
        .spawn(move || {
            while let Ok((stream, _addr)) = listener.accept() {
                let manager = manager.clone();
                let _ = thread::Builder::new()
                    .name("pivi-control-runtime-client".to_string())
                    .spawn(move || {
                        if crate::ws_server::is_websocket_upgrade(&stream) {
                            let _ = handle_websocket_event_stream(stream, &manager);
                        } else {
                            let _ = handle_runtime_stream(stream, &manager);
                        }
                    });
            }
        })
        .map(|_| ())
}

pub fn request_remote_room_state(
    host: Ipv4Addr,
    port: u16,
    room_id: &str,
) -> Result<RoomBroadcastMessage, String> {
    match send_control_runtime_request(
        host,
        port,
        ControlRuntimeRequest::GetRoomState {
            room_id: room_id.to_string(),
        },
    )? {
        ControlRuntimeResponse::RoomState { room_state } => Ok(room_state),
        ControlRuntimeResponse::Error { message, .. } => Err(message),
        _ => Err("unexpected control runtime response".to_string()),
    }
}

pub fn request_remote_room_events(
    host: Ipv4Addr,
    port: u16,
    room_id: &str,
    subscriber_member_id: &str,
    last_sequence: u64,
) -> Result<Vec<RoomRuntimeEvent>, String> {
    match send_control_runtime_request(
        host,
        port,
        ControlRuntimeRequest::GetEvents {
            room_id: room_id.to_string(),
            subscriber_member_id: subscriber_member_id.to_string(),
            last_sequence,
        },
    )? {
        ControlRuntimeResponse::Events { events } => Ok(events),
        ControlRuntimeResponse::Error { message, .. } => Err(message),
        _ => Err("unexpected control runtime response".to_string()),
    }
}

pub fn request_remote_relay_signal(
    host: Ipv4Addr,
    port: u16,
    room_id: &str,
    from: &str,
    target: &str,
    signal_type: WebRtcSignalType,
    payload: &str,
) -> Result<RoomRuntimeEvent, String> {
    match send_control_runtime_request(
        host,
        port,
        ControlRuntimeRequest::RelaySignal {
            room_id: room_id.to_string(),
            from: from.to_string(),
            target: target.to_string(),
            signal_type,
            payload: payload.to_string(),
        },
    )? {
        ControlRuntimeResponse::SignalAccepted { event } => Ok(event),
        ControlRuntimeResponse::Error { message, .. } => Err(message),
        _ => Err("unexpected control runtime response".to_string()),
    }
}

pub fn request_remote_join_room(
    host: Ipv4Addr,
    port: u16,
    room_id: &str,
    invite_code: &str,
    current_slot: u16,
    user_id: &str,
    display_name: &str,
) -> Result<JoinRuntimeAccepted, String> {
    match send_control_runtime_request(
        host,
        port,
        ControlRuntimeRequest::JoinRoom {
            room_id: room_id.to_string(),
            invite_code: invite_code.to_string(),
            current_slot,
            user_id: user_id.to_string(),
            display_name: display_name.to_string(),
        },
    )? {
        ControlRuntimeResponse::JoinAccepted { accepted } => Ok(accepted),
        ControlRuntimeResponse::Error { message, .. } => Err(message),
        _ => Err("unexpected control runtime response".to_string()),
    }
}

/// Remote host-management. The host (by role) may be a joiner connected to the
/// runtime-owning host, so these go over the control plane with an authority
/// check (`host_member_id` must be the current host).
pub fn request_remote_server_mute(
    host: Ipv4Addr,
    port: u16,
    room_id: &str,
    host_member_id: &str,
    member_id: &str,
    server_muted: bool,
) -> Result<RoomRuntimeEvent, String> {
    match send_control_runtime_request(
        host,
        port,
        ControlRuntimeRequest::ServerMute {
            room_id: room_id.to_string(),
            host_member_id: host_member_id.to_string(),
            member_id: member_id.to_string(),
            server_muted,
        },
    )? {
        ControlRuntimeResponse::SignalAccepted { event } => Ok(event),
        ControlRuntimeResponse::Error { message, .. } => Err(message),
        _ => Err("unexpected control runtime response".to_string()),
    }
}

pub fn request_remote_kick(
    host: Ipv4Addr,
    port: u16,
    room_id: &str,
    host_member_id: &str,
    member_id: &str,
) -> Result<RoomRuntimeEvent, String> {
    match send_control_runtime_request(
        host,
        port,
        ControlRuntimeRequest::Kick {
            room_id: room_id.to_string(),
            host_member_id: host_member_id.to_string(),
            member_id: member_id.to_string(),
        },
    )? {
        ControlRuntimeResponse::SignalAccepted { event } => Ok(event),
        ControlRuntimeResponse::Error { message, .. } => Err(message),
        _ => Err("unexpected control runtime response".to_string()),
    }
}

pub fn request_remote_ban(
    host: Ipv4Addr,
    port: u16,
    room_id: &str,
    host_member_id: &str,
    member_id: &str,
) -> Result<RoomRuntimeEvent, String> {
    match send_control_runtime_request(
        host,
        port,
        ControlRuntimeRequest::Ban {
            room_id: room_id.to_string(),
            host_member_id: host_member_id.to_string(),
            member_id: member_id.to_string(),
        },
    )? {
        ControlRuntimeResponse::SignalAccepted { event } => Ok(event),
        ControlRuntimeResponse::Error { message, .. } => Err(message),
        _ => Err("unexpected control runtime response".to_string()),
    }
}

pub fn request_remote_transfer_host(
    host: Ipv4Addr,
    port: u16,
    room_id: &str,
    host_member_id: &str,
    new_host_id: &str,
) -> Result<RoomRuntimeEvent, String> {
    match send_control_runtime_request(
        host,
        port,
        ControlRuntimeRequest::TransferHost {
            room_id: room_id.to_string(),
            host_member_id: host_member_id.to_string(),
            new_host_id: new_host_id.to_string(),
        },
    )? {
        ControlRuntimeResponse::SignalAccepted { event } => Ok(event),
        ControlRuntimeResponse::Error { message, .. } => Err(message),
        _ => Err("unexpected control runtime response".to_string()),
    }
}

fn send_control_runtime_request(
    host: Ipv4Addr,
    port: u16,
    request: ControlRuntimeRequest,
) -> Result<ControlRuntimeResponse, String> {
    let mut stream = TcpStream::connect_timeout(
        &(IpAddr::V4(host), port).into(),
        Duration::from_millis(600),
    )
    .map_err(|err| format!("connect failed: {err}"))?;
    stream
        .set_read_timeout(Some(Duration::from_millis(600)))
        .map_err(|err| format!("set read timeout failed: {err}"))?;
    stream
        .set_write_timeout(Some(Duration::from_millis(600)))
        .map_err(|err| format!("set write timeout failed: {err}"))?;

    let serialized = serde_json::to_string(&request).map_err(|err| format!("serialize failed: {err}"))?;
    stream
        .write_all(format!("{serialized}\n").as_bytes())
        .map_err(|err| format!("write failed: {err}"))?;
    stream.flush().map_err(|err| format!("flush failed: {err}"))?;

    let mut response_line = String::new();
    let mut reader = BufReader::new(stream);
    reader
        .read_line(&mut response_line)
        .map_err(|err| format!("read failed: {err}"))?;

    serde_json::from_str(response_line.trim())
        .map_err(|err| format!("invalid runtime response: {err}"))
}

fn handle_runtime_stream(mut stream: TcpStream, manager: &HostRuntimeSessionManager) -> std::io::Result<()> {
    let mut request_line = String::new();
    {
        let mut reader = BufReader::new(&stream);
        reader.read_line(&mut request_line)?;
    }

    let response = match serde_json::from_str::<ControlRuntimeRequest>(request_line.trim()) {
        Ok(request) => handle_control_runtime_request(manager, request),
        Err(error) => ControlRuntimeResponse::Error {
            code: "invalid-request".to_string(),
            message: error.to_string(),
        },
    };
    let serialized = serde_json::to_string(&response)?;
    stream.write_all(format!("{serialized}\n").as_bytes())?;
    stream.flush()?;
    Ok(())
}

/// Persistent WebSocket event channel (C1). After the handshake the client
/// sends one `Subscribe` message; the server then long-polls the in-process
/// manager and pushes every new `RoomRuntimeEvent` for that member as a WS text
/// frame. This replaces the 1s client polling for events; signalling/join/host
/// management still use the line-delimited JSON path.
fn handle_websocket_event_stream(
    stream: TcpStream,
    manager: &HostRuntimeSessionManager,
) -> std::io::Result<()> {
    use serde::Deserialize;
    #[derive(Deserialize)]
    struct SubscribeRequest {
        #[serde(rename = "type")]
        #[allow(dead_code)]
        kind: String,
        #[serde(rename = "roomId")]
        room_id: String,
        #[serde(rename = "memberId")]
        member_id: String,
        #[serde(rename = "lastSequence")]
        last_sequence: u64,
    }

    let map_err = |err: String| std::io::Error::new(std::io::ErrorKind::Other, err);
    let mut ws = crate::ws_server::accept_websocket(stream)?;

    let subscribe_text = ws
        .read()
        .map_err(|err| map_err(format!("{err}")))?
        .into_text()
        .map_err(|err| map_err(format!("{err}")))?;
    let subscribe: SubscribeRequest =
        serde_json::from_str(&subscribe_text).map_err(|err| map_err(format!("{err}")))?;

    let mut last_sequence = subscribe.last_sequence;
    let mut ticks = 0u32;
    loop {
        if let Some(events) =
            manager.get_events_since_for_member(&subscribe.room_id, Some(&subscribe.member_id), last_sequence)
        {
            for event in events {
                if event.sequence > last_sequence {
                    last_sequence = event.sequence;
                }
                let serialized = serde_json::to_string(&event).map_err(|err| map_err(format!("{err}")))?;
                if ws.send(tungstenite::Message::Text(serialized)).is_err() {
                    return Ok(()); // client went away
                }
            }
        }
        ticks = ticks.wrapping_add(1);
        if ticks % 50 == 0 {
            // heartbeat ping reaps dead clients even when no events are flowing
            if ws.send(tungstenite::Message::Ping(vec![])).is_err() {
                return Ok(());
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    use crate::host_runtime_session::{ControlRuntimeMessage, HostRuntimeSessionManager, RoomRuntimeEvent};
    use crate::invite_code::{encode_invite_code, InviteCodePayload, InviteEndpointScope, InviteJoinMode};

    fn build_invite_code(port: u16) -> String {
        encode_invite_code(&InviteCodePayload {
            endpoint_scope: InviteEndpointScope::PrivateLanIpv4,
            join_mode: InviteJoinMode::DirectHost,
            ipv4: Ipv4Addr::new(192, 168, 31, 10),
            port,
            expiry_slot: 500,
        })
        .unwrap()
    }

    #[test]
    fn get_room_state_request_should_return_runtime_room_state() {
        let manager = HostRuntimeSessionManager::default();
        let invite_code = build_invite_code(7788);
        manager
            .start_host_session(
                "room-a",
                "host-1",
                "HuangJin",
                &invite_code,
                0,
                "192.168.31.10",
                7788,
                Ipv4Addr::new(192, 168, 31, 10),
            )
            .unwrap();

        let response = handle_control_runtime_request(
            &manager,
            ControlRuntimeRequest::GetRoomState {
                room_id: "room-a".to_string(),
            },
        );

        match response {
            ControlRuntimeResponse::RoomState { room_state } => match room_state {
                RoomBroadcastMessage::RoomState { room_id, members } => {
                    assert_eq!(room_id, "room-a");
                    assert_eq!(members.len(), 1);
                }
                _ => panic!("expected room state"),
            },
            _ => panic!("expected room state response"),
        }
    }

    #[test]
    fn join_room_request_should_return_join_accepted() {
        let manager = HostRuntimeSessionManager::default();
        let invite_code = build_invite_code(7788);
        manager
            .start_host_session(
                "room-a",
                "host-1",
                "HuangJin",
                &invite_code,
                0,
                "192.168.31.10",
                7788,
                Ipv4Addr::new(192, 168, 31, 10),
            )
            .unwrap();

        let response = handle_control_runtime_request(
            &manager,
            ControlRuntimeRequest::JoinRoom {
                room_id: "room-a".to_string(),
                invite_code,
                current_slot: 0,
                user_id: "user-2".to_string(),
                display_name: "Player B".to_string(),
            },
        );

        match response {
            ControlRuntimeResponse::JoinAccepted { accepted } => {
                assert_eq!(accepted.joined_member.member_id, "user-2");
            }
            _ => panic!("expected join accepted response"),
        }
    }

    #[test]
    fn get_events_request_should_return_incremental_events() {
        let manager = HostRuntimeSessionManager::default();
        let invite_code = build_invite_code(7788);
        manager
            .start_host_session(
                "room-a",
                "host-1",
                "HuangJin",
                &invite_code,
                0,
                "192.168.31.10",
                7788,
                Ipv4Addr::new(192, 168, 31, 10),
            )
            .unwrap();
        manager
            .join_host_session("room-a", &invite_code, 0, "user-2", "Player B")
            .unwrap();

        let response = handle_control_runtime_request(
            &manager,
            ControlRuntimeRequest::GetEvents {
                room_id: "room-a".to_string(),
                subscriber_member_id: "user-2".to_string(),
                last_sequence: 1,
            },
        );

        match response {
            ControlRuntimeResponse::Events { events } => {
                assert_eq!(events.len(), 2);
            }
            _ => panic!("expected events response"),
        }
    }

    #[test]
    fn remote_request_should_roundtrip_over_tcp_listener() {
        let manager = HostRuntimeSessionManager::default();
        let invite_code = build_invite_code(7788);
        let host_ip = Ipv4Addr::new(127, 0, 0, 1);
        let listener = TcpListener::bind((host_ip, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        manager
            .start_host_session("room-a", "host-1", "HuangJin", &invite_code, 0, "127.0.0.1", port, host_ip)
            .unwrap();
        spawn_control_runtime_listener(listener, manager.clone()).unwrap();

        let room_state = request_remote_room_state(host_ip, port, "room-a").unwrap();
        match room_state {
            RoomBroadcastMessage::RoomState { room_id, members } => {
                assert_eq!(room_id, "room-a");
                assert_eq!(members.len(), 1);
            }
            _ => panic!("expected room state"),
        }

        let accepted = request_remote_join_room(host_ip, port, "room-a", &invite_code, 0, "user-2", "Player B")
            .unwrap();
        assert_eq!(accepted.joined_member.member_id, "user-2");
        let events = request_remote_room_events(host_ip, port, "room-a", "user-2", 1).unwrap();
        assert_eq!(events.len(), 2);
    }

    #[test]
    fn relay_signal_request_should_only_reach_target_subscriber() {
        let manager = HostRuntimeSessionManager::default();
        let invite_code = build_invite_code(7788);
        manager
            .start_host_session(
                "room-a",
                "host-1",
                "HuangJin",
                &invite_code,
                0,
                "192.168.31.10",
                7788,
                Ipv4Addr::new(192, 168, 31, 10),
            )
            .unwrap();
        manager
            .join_host_session("room-a", &invite_code, 0, "user-2", "Player B")
            .unwrap();

        let response = handle_control_runtime_request(
            &manager,
            ControlRuntimeRequest::RelaySignal {
                room_id: "room-a".to_string(),
                from: "host-1".to_string(),
                target: "user-2".to_string(),
                signal_type: WebRtcSignalType::Offer,
                payload: "offer-sdp".to_string(),
            },
        );

        match response {
            ControlRuntimeResponse::SignalAccepted { event } => {
                assert_eq!(event.target_member_id.as_deref(), Some("user-2"));
                assert!(matches!(event.message, ControlRuntimeMessage::WebRtcSignal(_)));
            }
            _ => panic!("expected signal accepted response"),
        }
    }

    fn runtime_with_two_members() -> HostRuntimeSessionManager {
        let manager = HostRuntimeSessionManager::default();
        let invite_code = build_invite_code(7788);
        manager
            .start_host_session(
                "room-a",
                "host-1",
                "HuangJin",
                &invite_code,
                0,
                "192.168.31.10",
                7788,
                Ipv4Addr::new(192, 168, 31, 10),
            )
            .unwrap();
        manager
            .join_host_session("room-a", &invite_code, 0, "user-2", "Player B")
            .unwrap();
        manager
    }

    #[test]
    fn kick_request_should_be_rejected_for_non_host() {
        let manager = runtime_with_two_members();

        let response = handle_control_runtime_request(
            &manager,
            ControlRuntimeRequest::Kick {
                room_id: "room-a".to_string(),
                host_member_id: "user-2".to_string(),
                member_id: "host-1".to_string(),
            },
        );

        match response {
            ControlRuntimeResponse::Error { code, .. } => assert_eq!(code, "not-host"),
            _ => panic!("a non-host must not be able to kick"),
        }
        // the room is unchanged
        assert!(manager.is_host("room-a", "host-1"));
    }

    #[test]
    fn transfer_host_request_should_authorize_for_current_host() {
        let manager = runtime_with_two_members();

        let response = handle_control_runtime_request(
            &manager,
            ControlRuntimeRequest::TransferHost {
                room_id: "room-a".to_string(),
                host_member_id: "host-1".to_string(),
                new_host_id: "user-2".to_string(),
            },
        );

        match response {
            ControlRuntimeResponse::SignalAccepted { event } => {
                assert!(event.target_member_id.is_none(), "HostChanged is broadcast");
            }
            _ => panic!("expected signal accepted response"),
        }
        assert!(manager.is_host("room-a", "user-2"));
        assert!(!manager.is_host("room-a", "host-1"));
    }

    #[test]
    fn websocket_event_channel_should_push_new_events_to_subscriber() {
        use tungstenite::{connect, protocol::Message};
        let manager = HostRuntimeSessionManager::default();
        let invite_code = build_invite_code(7788);
        let host_ip = Ipv4Addr::new(127, 0, 0, 1);
        let listener = TcpListener::bind((host_ip, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        manager
            .start_host_session("room-a", "host-1", "HuangJin", &invite_code, 0, "127.0.0.1", port, host_ip)
            .unwrap();
        manager
            .join_host_session("room-a", &invite_code, 0, "user-2", "Player B")
            .unwrap();
        spawn_control_runtime_listener(listener, manager.clone()).unwrap();

        // Subscribe from the latest sequence (3 = after the join broadcasts).
        let (mut client, _response) = connect(format!("ws://127.0.0.1:{}/", port)).unwrap();
        client
            .send(Message::Text(
                r#"{"type":"Subscribe","roomId":"room-a","memberId":"user-2","lastSequence":3}"#.to_string(),
            ))
            .unwrap();

        // Emit a targeted event for user-2 shortly after subscribing.
        let manager_clone = manager.clone();
        let emitter = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            manager_clone
                .relay_webrtc_signal("room-a", "host-1", "user-2", WebRtcSignalType::Offer, "offer-sdp")
                .unwrap();
        });

        let pushed = client.read().unwrap().into_text().unwrap();
        let event: RoomRuntimeEvent = serde_json::from_str(&pushed).unwrap();
        assert_eq!(event.sequence, 4);
        assert!(matches!(event.message, ControlRuntimeMessage::WebRtcSignal(_)));

        emitter.join().unwrap();
    }
}
