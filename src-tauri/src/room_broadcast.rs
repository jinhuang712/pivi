use serde::{Deserialize, Serialize};

use crate::room_state::{ConnectionState, MemberRole, MemberState, RoomState};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemberSnapshot {
    pub member_id: String,
    pub display_name: String,
    pub role: String,
    pub conn_state: String,
    pub server_muted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", content = "payload", rename_all_fields = "camelCase")]
pub enum RoomBroadcastMessage {
    RoomState { room_id: String, members: Vec<MemberSnapshot> },
    MemberJoined { member: MemberSnapshot },
    MemberLeft { member_id: String },
    /// Broadcast when the host toggles a member's server-mute. Clients reflect
    /// `serverMuted` on the member; the muted member also forces their mic off.
    MemberServerMuted { member_id: String, server_muted: bool },
    /// Targeted at the member who was removed, so their client can tell a kick
    /// or ban apart from a voluntary leave. Other members learn about the
    /// departure through the usual `MemberLeft` broadcast.
    MemberRemoved { member_id: String, reason: String },
    /// Broadcast when the host role is transferred. Everyone updates member
    /// roles from the fresh room state.
    HostChanged { previous_host_id: String, new_host_id: String },
}

pub struct RoomBroadcastBuilder;

impl RoomBroadcastBuilder {
    pub fn build_room_state(room: &RoomState) -> RoomBroadcastMessage {
        RoomBroadcastMessage::RoomState {
            room_id: room.room_id.clone(),
            members: room
                .members_snapshot()
                .into_iter()
                .map(Self::to_member_snapshot)
                .collect(),
        }
    }

    pub fn build_member_joined(member: &MemberState) -> RoomBroadcastMessage {
        RoomBroadcastMessage::MemberJoined {
            member: Self::to_member_snapshot(member.clone()),
        }
    }

    pub fn build_member_left(member_id: &str) -> RoomBroadcastMessage {
        RoomBroadcastMessage::MemberLeft {
            member_id: member_id.to_string(),
        }
    }

    pub fn build_member_server_muted(member_id: &str, server_muted: bool) -> RoomBroadcastMessage {
        RoomBroadcastMessage::MemberServerMuted {
            member_id: member_id.to_string(),
            server_muted,
        }
    }

    pub fn build_member_removed(member_id: &str, reason: &str) -> RoomBroadcastMessage {
        RoomBroadcastMessage::MemberRemoved {
            member_id: member_id.to_string(),
            reason: reason.to_string(),
        }
    }

    pub fn build_host_changed(previous_host_id: &str, new_host_id: &str) -> RoomBroadcastMessage {
        RoomBroadcastMessage::HostChanged {
            previous_host_id: previous_host_id.to_string(),
            new_host_id: new_host_id.to_string(),
        }
    }

    fn to_member_snapshot(member: MemberState) -> MemberSnapshot {
        MemberSnapshot {
            member_id: member.member_id,
            display_name: member.display_name,
            role: Self::role_to_string(&member.role),
            conn_state: Self::conn_state_to_string(&member.conn_state),
            server_muted: member.server_muted,
        }
    }

    fn role_to_string(role: &MemberRole) -> String {
        match role {
            MemberRole::Host => "Host".to_string(),
            MemberRole::Member => "Member".to_string(),
        }
    }

    fn conn_state_to_string(state: &ConnectionState) -> String {
        match state {
            ConnectionState::Connected => "Connected".to_string(),
            ConnectionState::Disconnected => "Disconnected".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_room_state_should_include_all_members() {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        room.add_member("user-a", "Player A").unwrap();

        let message = RoomBroadcastBuilder::build_room_state(&room);
        if let RoomBroadcastMessage::RoomState { room_id, members } = message {
            assert_eq!(room_id, "A9B2K8");
            assert_eq!(members.len(), 2);
        } else {
            panic!("expected RoomState message");
        }
    }

    #[test]
    fn build_member_joined_should_serialize_member_snapshot() {
        let member = MemberState {
            member_id: "user-a".to_string(),
            display_name: "Player A".to_string(),
            role: MemberRole::Member,
            join_at: std::time::SystemTime::now(),
            conn_state: ConnectionState::Connected,
            server_muted: false,
        };

        let message = RoomBroadcastBuilder::build_member_joined(&member);
        if let RoomBroadcastMessage::MemberJoined { member } = message {
            assert_eq!(member.member_id, "user-a");
            assert_eq!(member.role, "Member");
            assert_eq!(member.conn_state, "Connected");
            assert!(!member.server_muted);
        } else {
            panic!("expected MemberJoined message");
        }
    }

    #[test]
    fn build_member_left_should_contain_target_member_id() {
        let message = RoomBroadcastBuilder::build_member_left("user-a");
        assert_eq!(
            message,
            RoomBroadcastMessage::MemberLeft {
                member_id: "user-a".to_string()
            }
        );
    }

    #[test]
    fn build_member_server_muted_should_carry_flag() {
        assert_eq!(
            RoomBroadcastBuilder::build_member_server_muted("user-a", true),
            RoomBroadcastMessage::MemberServerMuted {
                member_id: "user-a".to_string(),
                server_muted: true,
            }
        );
    }

    #[test]
    fn build_member_removed_should_carry_reason() {
        assert_eq!(
            RoomBroadcastBuilder::build_member_removed("user-a", "kicked"),
            RoomBroadcastMessage::MemberRemoved {
                member_id: "user-a".to_string(),
                reason: "kicked".to_string(),
            }
        );
    }

    #[test]
    fn build_host_changed_should_carry_both_host_ids() {
        assert_eq!(
            RoomBroadcastBuilder::build_host_changed("host-1", "user-a"),
            RoomBroadcastMessage::HostChanged {
                previous_host_id: "host-1".to_string(),
                new_host_id: "user-a".to_string(),
            }
        );
        let v = serde_json::to_value(RoomBroadcastBuilder::build_host_changed("host-1", "user-a")).unwrap();
        assert_eq!(v["type"], "HostChanged");
        assert!(v["payload"].get("previousHostId").is_some(), "previousHostId: {v}");
        assert!(v["payload"].get("newHostId").is_some(), "newHostId: {v}");
    }

    #[test]
    fn server_muted_and_reason_should_serialize_as_camel_case() {
        let muted = serde_json::to_value(RoomBroadcastBuilder::build_member_server_muted("u", true)).unwrap();
        assert_eq!(muted["type"], "MemberServerMuted");
        assert!(muted["payload"].get("memberId").is_some(), "memberId: {muted}");
        assert!(muted["payload"].get("serverMuted").is_some(), "serverMuted: {muted}");

        let removed = serde_json::to_value(RoomBroadcastBuilder::build_member_removed("u", "banned")).unwrap();
        assert_eq!(removed["type"], "MemberRemoved");
        assert!(removed["payload"].get("memberId").is_some(), "memberId: {removed}");
        assert_eq!(removed["payload"]["reason"], "banned");
    }
}
