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
    /// True when the host has server-muted this member (forces their mic off
    /// for everyone). Survives snapshots so late joiners see the right state.
    pub server_muted: bool,
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
    MemberNotFound,
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
            server_muted: false,
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
            server_muted: false,
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

    /// Toggles a member's server-muted flag. Returns the previous value, or
    /// `None` if the member does not exist. The host cannot be server-muted.
    pub fn set_server_muted(&mut self, member_id: &str, server_muted: bool) -> Option<bool> {
        let member = self.members.get_mut(member_id)?;
        if member.role == MemberRole::Host {
            return Some(false);
        }
        let previous = member.server_muted;
        member.server_muted = server_muted;
        Some(previous)
    }

    /// Promotes `new_host_id` to Host and demotes the current host to Member.
    /// Returns the previous host id. Transferring to the current host (or to a
    /// non-existent member) is handled gracefully.
    pub fn transfer_host(&mut self, new_host_id: &str) -> Result<String, RoomStateError> {
        let previous_host = self.host_id.clone();
        if new_host_id == previous_host {
            return Ok(previous_host);
        }
        if !self.members.contains_key(new_host_id) {
            return Err(RoomStateError::MemberNotFound);
        }
        if let Some(previous) = self.members.get_mut(&previous_host) {
            previous.role = MemberRole::Member;
        }
        if let Some(new_host) = self.members.get_mut(new_host_id) {
            new_host.role = MemberRole::Host;
        }
        self.host_id = new_host_id.to_string();
        Ok(previous_host)
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

    #[test]
    fn set_server_muted_should_toggle_member_flag_and_return_previous() {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        room.add_member("user-a", "Player A").unwrap();

        let previous = room.set_server_muted("user-a", true).unwrap();
        assert!(!previous, "previous should be false on first mute");

        let member = room.members_snapshot().into_iter().find(|m| m.member_id == "user-a").unwrap();
        assert!(member.server_muted);

        let previous = room.set_server_muted("user-a", false).unwrap();
        assert!(previous, "previous should reflect the muted state");
    }

    #[test]
    fn set_server_muted_should_refuse_to_mute_the_host() {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        let previous = room.set_server_muted("host-1", true);
        assert_eq!(previous, Some(false));
        let host = room.members_snapshot().into_iter().find(|m| m.member_id == "host-1").unwrap();
        assert!(!host.server_muted);
    }

    #[test]
    fn set_server_muted_should_return_none_for_unknown_member() {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        assert!(room.set_server_muted("nobody", true).is_none());
    }

    #[test]
    fn transfer_host_should_promote_member_and_demote_old_host() {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        room.add_member("user-a", "Player A").unwrap();

        let previous = room.transfer_host("user-a").unwrap();
        assert_eq!(previous, "host-1");
        assert_eq!(room.host_id, "user-a");

        let members = room.members_snapshot();
        let new_host = members.iter().find(|m| m.member_id == "user-a").unwrap();
        let old_host = members.iter().find(|m| m.member_id == "host-1").unwrap();
        assert_eq!(new_host.role, MemberRole::Host);
        assert_eq!(old_host.role, MemberRole::Member);
    }

    #[test]
    fn transfer_host_to_unknown_member_should_fail() {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        assert_eq!(
            room.transfer_host("nobody"),
            Err(RoomStateError::MemberNotFound)
        );
    }

    #[test]
    fn transfer_host_to_self_should_be_a_noop() {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        room.add_member("user-a", "Player A").unwrap();
        let previous = room.transfer_host("host-1").unwrap();
        assert_eq!(previous, "host-1");
        assert_eq!(room.host_id, "host-1");
    }
}
