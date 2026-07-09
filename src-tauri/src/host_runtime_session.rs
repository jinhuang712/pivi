use std::collections::{HashMap, HashSet};
use std::net::Ipv4Addr;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::auth::HostAuthGate;
use crate::room_broadcast::{MemberSnapshot, RoomBroadcastBuilder, RoomBroadcastMessage};
use crate::room_state::RoomState;
use crate::webrtc_router::{WebRtcRelayRouter, WebRtcSignal, WebRtcSignalType};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HostRuntimeReady {
    pub room_id: String,
    pub invite_code: String,
    pub listen_host: String,
    pub listen_port: u16,
    pub members: Vec<MemberSnapshot>,
    pub latest_sequence: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JoinRuntimeAccepted {
    pub room_id: String,
    pub joined_member: MemberSnapshot,
    pub room_state: RoomBroadcastMessage,
    pub latest_sequence: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RoomRuntimeEvent {
    pub sequence: u64,
    pub target_member_id: Option<String>,
    pub message: ControlRuntimeMessage,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", content = "payload")]
pub enum ControlRuntimeMessage {
    RoomBroadcast(RoomBroadcastMessage),
    WebRtcSignal(WebRtcSignal),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostRuntimeSessionError {
    DuplicateRoom,
    RoomNotFound,
    JoinRejected,
    InvalidListenHost,
    SignalRejected,
    Banned,
    MemberNotFound,
}

struct ActiveHostRuntimeSession {
    room: RoomState,
    auth_gate: HostAuthGate,
    invite_code: String,
    listen_host: String,
    listen_port: u16,
    lan_ipv4: Ipv4Addr,
    next_sequence: u64,
    events: Vec<RoomRuntimeEvent>,
    /// Member IDs the host has banned. Any future join with one of these IDs is
    /// rejected before the room state is touched.
    banned_members: HashSet<String>,
}

#[derive(Clone, Default)]
pub struct HostRuntimeSessionManager {
    sessions: Arc<Mutex<HashMap<String, ActiveHostRuntimeSession>>>,
}

impl HostRuntimeSessionManager {
    pub fn start_host_session(
        &self,
        room_id: &str,
        host_id: &str,
        host_name: &str,
        invite_code: &str,
        current_slot: u16,
        listen_host: &str,
        listen_port: u16,
        lan_ipv4: Ipv4Addr,
    ) -> Result<HostRuntimeReady, HostRuntimeSessionError> {
        let mut sessions = self.sessions.lock().unwrap();
        if sessions.contains_key(room_id) {
            return Err(HostRuntimeSessionError::DuplicateRoom);
        }
        if listen_host == "0.0.0.0" {
            return Err(HostRuntimeSessionError::InvalidListenHost);
        }

        let room = RoomState::new(room_id, host_id, host_name);
        let auth_gate = HostAuthGate::new(invite_code, current_slot)
            .map_err(|_| HostRuntimeSessionError::JoinRejected)?;
        let initial_room_state = RoomBroadcastBuilder::build_room_state(&room);
        let members = extract_members_from_room_state(initial_room_state.clone());
        let events = vec![RoomRuntimeEvent {
            sequence: 1,
            target_member_id: None,
            message: ControlRuntimeMessage::RoomBroadcast(initial_room_state),
        }];

        sessions.insert(
            room_id.to_string(),
            ActiveHostRuntimeSession {
                room,
                auth_gate,
                invite_code: invite_code.to_string(),
                listen_host: listen_host.to_string(),
                listen_port,
                lan_ipv4,
                next_sequence: 2,
                events,
                banned_members: HashSet::new(),
            },
        );

        Ok(HostRuntimeReady {
            room_id: room_id.to_string(),
            invite_code: invite_code.to_string(),
            listen_host: listen_host.to_string(),
            listen_port,
            members,
            latest_sequence: 1,
        })
    }

    pub fn join_host_session(
        &self,
        room_id: &str,
        invite_code: &str,
        current_slot: u16,
        user_id: &str,
        display_name: &str,
    ) -> Result<JoinRuntimeAccepted, HostRuntimeSessionError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(room_id)
            .ok_or(HostRuntimeSessionError::RoomNotFound)?;

        if session.banned_members.contains(user_id) {
            return Err(HostRuntimeSessionError::Banned);
        }

        session
            .auth_gate
            .authorize_join(invite_code, user_id, current_slot)
            .map_err(|_| HostRuntimeSessionError::JoinRejected)?;
        session
            .room
            .add_member(user_id, display_name)
            .map_err(|_| HostRuntimeSessionError::JoinRejected)?;

        let joined_member = match RoomBroadcastBuilder::build_room_state(&session.room) {
            RoomBroadcastMessage::RoomState { members, .. } => members
                .into_iter()
                .find(|member| member.member_id == user_id)
                .ok_or(HostRuntimeSessionError::JoinRejected)?,
            _ => return Err(HostRuntimeSessionError::JoinRejected),
        };
        session.events.push(RoomRuntimeEvent {
            sequence: session.next_sequence,
            target_member_id: None,
            message: ControlRuntimeMessage::RoomBroadcast(RoomBroadcastBuilder::build_member_joined(
                &session
                    .room
                    .members_snapshot()
                    .into_iter()
                    .find(|member| member.member_id == user_id)
                    .ok_or(HostRuntimeSessionError::JoinRejected)?,
            )),
        });
        session.next_sequence += 1;
        let room_state = RoomBroadcastBuilder::build_room_state(&session.room);
        session.events.push(RoomRuntimeEvent {
            sequence: session.next_sequence,
            target_member_id: None,
            message: ControlRuntimeMessage::RoomBroadcast(room_state.clone()),
        });
        session.next_sequence += 1;

        Ok(JoinRuntimeAccepted {
            room_id: room_id.to_string(),
            joined_member,
            room_state,
            latest_sequence: session.next_sequence - 1,
        })
    }

    pub fn get_room_state(&self, room_id: &str) -> Option<RoomBroadcastMessage> {
        let sessions = self.sessions.lock().unwrap();
        sessions
            .get(room_id)
            .map(|session| RoomBroadcastBuilder::build_room_state(&session.room))
    }

    pub fn get_runtime_ready(&self, room_id: &str) -> Option<HostRuntimeReady> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions.get(room_id)?;

        Some(HostRuntimeReady {
            room_id: session.room.room_id.clone(),
            invite_code: session.invite_code.clone(),
            listen_host: session.listen_host.clone(),
            listen_port: session.listen_port,
            members: extract_members_from_room_state(RoomBroadcastBuilder::build_room_state(&session.room)),
            latest_sequence: session.next_sequence - 1,
        })
    }

    pub fn get_lan_endpoint(&self, room_id: &str) -> Option<(Ipv4Addr, u16)> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions.get(room_id)?;
        Some((session.lan_ipv4, session.listen_port))
    }

    pub fn get_events_since(&self, room_id: &str, last_sequence: u64) -> Option<Vec<RoomRuntimeEvent>> {
        self.get_events_since_for_member(room_id, None, last_sequence)
    }

    pub fn get_events_since_for_member(
        &self,
        room_id: &str,
        member_id: Option<&str>,
        last_sequence: u64,
    ) -> Option<Vec<RoomRuntimeEvent>> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions.get(room_id)?;
        Some(
            session
                .events
                .iter()
                .filter(|event| event.sequence > last_sequence)
                .filter(|event| {
                    event.target_member_id.is_none()
                        || member_id
                            .map(|candidate| event.target_member_id.as_deref() == Some(candidate))
                            .unwrap_or(false)
                })
                .cloned()
                .collect(),
        )
    }

    pub fn relay_webrtc_signal(
        &self,
        room_id: &str,
        from: &str,
        target: &str,
        signal_type: WebRtcSignalType,
        payload: &str,
    ) -> Result<RoomRuntimeEvent, HostRuntimeSessionError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(room_id)
            .ok_or(HostRuntimeSessionError::RoomNotFound)?;
        let signal = WebRtcRelayRouter::relay(
            &session.room,
            WebRtcSignal {
                from: from.to_string(),
                target: target.to_string(),
                signal_type,
                payload: payload.to_string(),
            },
        )
        .map_err(|_| HostRuntimeSessionError::SignalRejected)?;

        let event = RoomRuntimeEvent {
            sequence: session.next_sequence,
            target_member_id: Some(signal.target.clone()),
            message: ControlRuntimeMessage::WebRtcSignal(signal),
        };
        session.next_sequence += 1;
        session.events.push(event.clone());
        Ok(event)
    }

    /// Host toggles a member's server-mute. Emits a broadcast `MemberServerMuted`
    /// event so every client reflects the flag; the muted member also mutes
    /// their own mic locally.
    pub fn server_mute_member(
        &self,
        room_id: &str,
        member_id: &str,
        server_muted: bool,
    ) -> Result<RoomRuntimeEvent, HostRuntimeSessionError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(room_id)
            .ok_or(HostRuntimeSessionError::RoomNotFound)?;
        if session
            .room
            .set_server_muted(member_id, server_muted)
            .is_none()
        {
            return Err(HostRuntimeSessionError::MemberNotFound);
        }
        let event = RoomRuntimeEvent {
            sequence: session.next_sequence,
            target_member_id: None,
            message: ControlRuntimeMessage::RoomBroadcast(
                RoomBroadcastBuilder::build_member_server_muted(member_id, server_muted),
            ),
        };
        session.next_sequence += 1;
        session.events.push(event.clone());
        Ok(event)
    }

    /// Removes a member from the room and notifies them (reason "kicked").
    /// Everyone else learns about the departure via the `MemberLeft` broadcast.
    pub fn kick_member(
        &self,
        room_id: &str,
        member_id: &str,
    ) -> Result<RoomRuntimeEvent, HostRuntimeSessionError> {
        self.remove_member(room_id, member_id, "kicked", false)
    }

    /// Same as `kick_member`, but also records the member ID so any future join
    /// is rejected (`HostRuntimeSessionError::Banned`).
    pub fn ban_member(
        &self,
        room_id: &str,
        member_id: &str,
    ) -> Result<RoomRuntimeEvent, HostRuntimeSessionError> {
        self.remove_member(room_id, member_id, "banned", true)
    }

    fn remove_member(
        &self,
        room_id: &str,
        member_id: &str,
        reason: &str,
        ban: bool,
    ) -> Result<RoomRuntimeEvent, HostRuntimeSessionError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(room_id)
            .ok_or(HostRuntimeSessionError::RoomNotFound)?;
        if !session.room.has_member(member_id) {
            return Err(HostRuntimeSessionError::MemberNotFound);
        }
        let removed = session
            .room
            .remove_member(member_id)
            .map_err(|_| HostRuntimeSessionError::MemberNotFound)?;
        if !removed {
            return Err(HostRuntimeSessionError::MemberNotFound);
        }
        if ban {
            session.banned_members.insert(member_id.to_string());
        }

        // Targeted notice so the removed member's client can show why.
        session.events.push(RoomRuntimeEvent {
            sequence: session.next_sequence,
            target_member_id: Some(member_id.to_string()),
            message: ControlRuntimeMessage::RoomBroadcast(RoomBroadcastBuilder::build_member_removed(
                member_id,
                reason,
            )),
        });
        session.next_sequence += 1;

        // Broadcast the departure to everyone still in the room.
        let event = RoomRuntimeEvent {
            sequence: session.next_sequence,
            target_member_id: None,
            message: ControlRuntimeMessage::RoomBroadcast(RoomBroadcastBuilder::build_member_left(
                member_id,
            )),
        };
        session.next_sequence += 1;
        session.events.push(event.clone());
        Ok(event)
    }
}

fn extract_members_from_room_state(message: RoomBroadcastMessage) -> Vec<MemberSnapshot> {
    match message {
        RoomBroadcastMessage::RoomState { members, .. } => members,
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    use crate::invite_code::{encode_invite_code, InviteCodePayload, InviteEndpointScope, InviteJoinMode};
    use crate::room_broadcast::RoomBroadcastMessage;

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
    fn start_host_session_should_return_runtime_ready_snapshot() {
        let manager = HostRuntimeSessionManager::default();
        let invite_code = build_invite_code(7788);

        let runtime = manager
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

        assert_eq!(runtime.room_id, "room-a");
        assert_eq!(runtime.listen_port, 7788);
        assert_eq!(runtime.members.len(), 1);
        assert_eq!(runtime.members[0].member_id, "host-1");
    }

    #[test]
    fn join_host_session_should_return_joined_member_and_room_state() {
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

        let joined = manager
            .join_host_session("room-a", &invite_code, 0, "user-2", "Player B")
            .unwrap();

        assert_eq!(joined.joined_member.member_id, "user-2");
        if let RoomBroadcastMessage::RoomState { room_id, members } = joined.room_state {
            assert_eq!(room_id, "room-a");
            assert_eq!(members.len(), 2);
        } else {
            panic!("expected room state");
        }
    }

    #[test]
    fn join_host_session_should_reject_wrong_invite_code() {
        let manager = HostRuntimeSessionManager::default();
        let invite_code = build_invite_code(7788);
        let wrong_invite_code = build_invite_code(7789);
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

        let result = manager.join_host_session("room-a", &wrong_invite_code, 0, "user-2", "Player B");

        assert_eq!(result, Err(HostRuntimeSessionError::JoinRejected));
    }

    #[test]
    fn get_room_state_should_return_runtime_generated_room_state() {
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

        let room_state = manager.get_room_state("room-a").unwrap();

        if let RoomBroadcastMessage::RoomState { members, .. } = room_state {
            assert_eq!(members.len(), 2);
        } else {
            panic!("expected room state");
        }
    }

    #[test]
    fn get_events_since_should_return_incremental_runtime_events() {
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

        let events = manager.get_events_since("room-a", 1).unwrap();

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].sequence, 2);
        assert_eq!(events[1].sequence, 3);
    }

    #[test]
    fn relay_webrtc_signal_should_create_targeted_event() {
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

        let event = manager
            .relay_webrtc_signal("room-a", "host-1", "user-2", WebRtcSignalType::Offer, "offer-sdp")
            .unwrap();

        assert_eq!(event.target_member_id.as_deref(), Some("user-2"));
        let user_events = manager
            .get_events_since_for_member("room-a", Some("user-2"), 3)
            .unwrap();
        let host_events = manager
            .get_events_since_for_member("room-a", Some("host-1"), 3)
            .unwrap();
        assert_eq!(user_events.len(), 1);
        assert_eq!(host_events.len(), 0);
    }

    fn two_member_session() -> HostRuntimeSessionManager {
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
    fn server_mute_member_should_broadcast_and_reflect_in_state() {
        let manager = two_member_session();

        let event = manager.server_mute_member("room-a", "user-2", true).unwrap();
        assert!(event.target_member_id.is_none(), "server-mute is a broadcast");

        let state = manager.get_room_state("room-a").unwrap();
        if let RoomBroadcastMessage::RoomState { members, .. } = state {
            let member = members.iter().find(|m| m.member_id == "user-2").unwrap();
            assert!(member.server_muted, "member should be server-muted");
        } else {
            panic!("expected room state");
        }
    }

    #[test]
    fn kick_member_should_notify_target_and_broadcast_left() {
        let manager = two_member_session();

        manager.kick_member("room-a", "user-2").unwrap();

        // The kicked member receives a targeted MemberRemoved notice.
        let user_events = manager
            .get_events_since_for_member("room-a", Some("user-2"), 0)
            .unwrap();
        assert!(
            user_events.iter().any(|event| matches!(
                &event.message,
                ControlRuntimeMessage::RoomBroadcast(RoomBroadcastMessage::MemberRemoved {
                    member_id,
                    reason
                }) if member_id == "user-2" && reason == "kicked"
            )),
            "kicked member should see a MemberRemoved notice"
        );

        // Everyone else sees the departure via the broadcast MemberLeft.
        let host_events = manager
            .get_events_since_for_member("room-a", Some("host-1"), 0)
            .unwrap();
        assert!(
            host_events.iter().any(|event| matches!(
                &event.message,
                ControlRuntimeMessage::RoomBroadcast(RoomBroadcastMessage::MemberLeft {
                    member_id
                }) if member_id == "user-2"
            )),
            "host should see a MemberLeft broadcast"
        );
        assert!(
            !host_events.iter().any(|event| matches!(
                &event.message,
                ControlRuntimeMessage::RoomBroadcast(RoomBroadcastMessage::MemberRemoved { .. })
            )),
            "host should NOT see the targeted MemberRemoved notice"
        );

        let state = manager.get_room_state("room-a").unwrap();
        if let RoomBroadcastMessage::RoomState { members, .. } = state {
            assert!(members.iter().all(|m| m.member_id != "user-2"));
        } else {
            panic!("expected room state");
        }
    }

    #[test]
    fn ban_member_should_prevent_rejoin() {
        let manager = two_member_session();

        manager.ban_member("room-a", "user-2").unwrap();

        let result = manager.join_host_session(
            "room-a",
            &build_invite_code(7788),
            0,
            "user-2",
            "Player B",
        );
        assert_eq!(result, Err(HostRuntimeSessionError::Banned));
    }

    #[test]
    fn remove_unknown_member_should_error() {
        let manager = two_member_session();

        assert_eq!(
            manager.kick_member("room-a", "nobody"),
            Err(HostRuntimeSessionError::MemberNotFound)
        );
        assert_eq!(
            manager.server_mute_member("room-a", "nobody", true),
            Err(HostRuntimeSessionError::MemberNotFound)
        );
    }
}

#[cfg(test)]
mod contract_tests {
    use super::*;
    use crate::room_broadcast::RoomBroadcastBuilder;
    use crate::room_state::RoomState;
    use serde_json::Value;

    #[test]
    fn host_runtime_ready_uses_camel_case() {
        let ready = HostRuntimeReady {
            room_id: "r".into(),
            invite_code: "IC".into(),
            listen_host: "1.2.3.4".into(),
            listen_port: 7788,
            members: vec![],
            latest_sequence: 7,
        };
        let v: Value = serde_json::to_value(&ready).unwrap();
        assert!(v.get("roomId").is_some(), "roomId should be camelCase: {v}");
        assert!(v.get("inviteCode").is_some(), "inviteCode should be camelCase: {v}");
        assert!(v.get("listenHost").is_some(), "listenHost should be camelCase: {v}");
        assert!(v.get("listenPort").is_some(), "listenPort should be camelCase: {v}");
        assert!(v.get("latestSequence").is_some(), "latestSequence should be camelCase: {v}");
    }

    #[test]
    fn join_runtime_accepted_uses_camel_case() {
        let room = RoomState::new("r", "h", "H");
        let accepted = JoinRuntimeAccepted {
            room_id: "r".into(),
            joined_member: crate::room_broadcast::MemberSnapshot {
                member_id: "u".into(),
                display_name: "U".into(),
                role: "Member".into(),
                conn_state: "Connected".into(),
                server_muted: false,
            },
            room_state: RoomBroadcastBuilder::build_room_state(&room),
            latest_sequence: 9,
        };
        let v: Value = serde_json::to_value(&accepted).unwrap();
        assert!(v.get("roomId").is_some(), "roomId: {v}");
        assert!(v.get("joinedMember").is_some(), "joinedMember: {v}");
        assert!(v.get("roomState").is_some(), "roomState: {v}");
        assert!(v.get("latestSequence").is_some(), "latestSequence: {v}");
    }

    #[test]
    fn room_runtime_event_uses_camel_case_target_member_id() {
        let evt = RoomRuntimeEvent {
            sequence: 5,
            target_member_id: Some("u".into()),
            message: ControlRuntimeMessage::RoomBroadcast(
                crate::room_broadcast::RoomBroadcastMessage::MemberLeft { member_id: "u".into() },
            ),
        };
        let v: Value = serde_json::to_value(&evt).unwrap();
        assert!(v.get("targetMemberId").is_some(), "targetMemberId should be camelCase: {v}");
        assert_eq!(v["sequence"], 5);
    }

    #[test]
    fn control_message_room_broadcast_is_envelope_around_broadcast() {
        let room = RoomState::new("r", "h", "H");
        let msg = ControlRuntimeMessage::RoomBroadcast(RoomBroadcastBuilder::build_room_state(&room));
        let v: Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(v["type"], "RoomBroadcast", "envelope type: {v}");
        assert_eq!(v["payload"]["type"], "RoomState", "inner type: {v}");
        assert!(v["payload"]["payload"]["roomId"].is_string(), "inner roomId camelCase: {v}");
    }

    #[test]
    fn control_message_webrtc_signal_uses_camel_case_signal_type() {
        let msg = ControlRuntimeMessage::WebRtcSignal(WebRtcSignal {
            from: "a".into(),
            target: "b".into(),
            signal_type: WebRtcSignalType::Offer,
            payload: "sdp".into(),
        });
        let v: Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(v["type"], "WebRtcSignal", "envelope type: {v}");
        assert!(v["payload"].get("signalType").is_some(), "signalType should be camelCase: {v}");
        assert_eq!(v["payload"]["signalType"], "Offer");
        assert!(v["payload"].get("from").is_some(), "from: {v}");
        assert!(v["payload"].get("target").is_some(), "target: {v}");
        assert!(v["payload"].get("payload").is_some(), "payload: {v}");
    }
}
