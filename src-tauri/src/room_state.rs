use std::collections::HashMap;
use std::time::SystemTime;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemberRole {
    Host,
    Member,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConnectionState {
    Connected,
    Disconnected,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemberState {
    pub member_id: String,
    pub display_name: String,
    pub role: MemberRole,
    pub join_at: SystemTime,
    pub conn_state: ConnectionState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoomState {
    pub room_id: String,
    pub host_id: String,
    pub created_at: SystemTime,
    members: HashMap<String, MemberState>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RoomStateError {
    DuplicateMember,
    HostCannotLeave,
}

impl RoomState {
    pub fn new(room_id: &str, host_id: &str, host_display_name: &str) -> Self {
        let created_at = SystemTime::now();
        let mut members = HashMap::new();
        let host = MemberState {
            member_id: host_id.to_string(),
            display_name: host_display_name.to_string(),
            role: MemberRole::Host,
            join_at: created_at,
            conn_state: ConnectionState::Connected,
        };
        members.insert(host_id.to_string(), host);
        Self {
            room_id: room_id.to_string(),
            host_id: host_id.to_string(),
            created_at,
            members,
        }
    }

    pub fn add_member(&mut self, member_id: &str, display_name: &str) -> Result<(), RoomStateError> {
        if self.members.contains_key(member_id) {
            return Err(RoomStateError::DuplicateMember);
        }
        let member = MemberState {
            member_id: member_id.to_string(),
            display_name: display_name.to_string(),
            role: MemberRole::Member,
            join_at: SystemTime::now(),
            conn_state: ConnectionState::Connected,
        };
        self.members.insert(member_id.to_string(), member);
        Ok(())
    }

    pub fn remove_member(&mut self, member_id: &str) -> Result<bool, RoomStateError> {
        if member_id == self.host_id {
            return Err(RoomStateError::HostCannotLeave);
        }
        Ok(self.members.remove(member_id).is_some())
    }

    pub fn has_member(&self, member_id: &str) -> bool {
        self.members.contains_key(member_id)
    }

    pub fn member_count(&self) -> usize {
        self.members.len()
    }

    pub fn members_snapshot(&self) -> Vec<MemberState> {
        self.members.values().cloned().collect()
    }

    pub fn set_connection_state(&mut self, member_id: &str, conn_state: ConnectionState) -> bool {
        if let Some(member) = self.members.get_mut(member_id) {
            member.conn_state = conn_state;
            return true;
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_room_should_include_host_member() {
        let room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        assert_eq!(room.member_count(), 1);
        assert!(room.has_member("host-1"));
    }

    #[test]
    fn add_member_should_increase_member_count() {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        room.add_member("user-a", "Player A").unwrap();
        assert_eq!(room.member_count(), 2);
        assert!(room.has_member("user-a"));
    }

    #[test]
    fn add_duplicate_member_should_fail() {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        room.add_member("user-a", "Player A").unwrap();
        let res = room.add_member("user-a", "Player A 2");
        assert_eq!(res, Err(RoomStateError::DuplicateMember));
    }

    #[test]
    fn remove_member_should_cleanup_state() {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        room.add_member("user-a", "Player A").unwrap();
        let removed = room.remove_member("user-a").unwrap();
        assert!(removed);
        assert!(!room.has_member("user-a"));
        assert_eq!(room.member_count(), 1);
    }

    #[test]
    fn remove_host_should_fail() {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        let res = room.remove_member("host-1");
        assert_eq!(res, Err(RoomStateError::HostCannotLeave));
    }

    #[test]
    fn set_connection_state_should_update_member() {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        room.add_member("user-a", "Player A").unwrap();
        let updated = room.set_connection_state("user-a", ConnectionState::Disconnected);
        assert!(updated);
        let snapshot = room.members_snapshot();
        let member = snapshot
            .iter()
            .find(|m| m.member_id == "user-a")
            .unwrap();
        assert_eq!(member.conn_state, ConnectionState::Disconnected);
    }
}
