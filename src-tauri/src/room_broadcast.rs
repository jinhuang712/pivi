use serde::{Deserialize, Serialize};

use crate::room_state::{ConnectionState, MemberRole, MemberState, RoomState};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MemberSnapshot {
    pub member_id: String,
    pub display_name: String,
    pub role: String,
    pub conn_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", content = "payload")]
pub enum RoomBroadcastMessage {
    RoomState { room_id: String, members: Vec<MemberSnapshot> },
    MemberJoined { member: MemberSnapshot },
    MemberLeft { member_id: String },
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

    fn to_member_snapshot(member: MemberState) -> MemberSnapshot {
        MemberSnapshot {
            member_id: member.member_id,
            display_name: member.display_name,
            role: Self::role_to_string(&member.role),
            conn_state: Self::conn_state_to_string(&member.conn_state),
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
        };

        let message = RoomBroadcastBuilder::build_member_joined(&member);
        if let RoomBroadcastMessage::MemberJoined { member } = message {
            assert_eq!(member.member_id, "user-a");
            assert_eq!(member.role, "Member");
            assert_eq!(member.conn_state, "Connected");
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
}
