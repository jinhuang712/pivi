use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthError {
    InvalidRoomCode,
    WrongRoomCode,
    BlacklistedUser,
}

pub struct HostAuthGate {
    room_code: String,
    blacklist: HashSet<String>,
}

impl HostAuthGate {
    pub fn new(room_code: &str) -> Result<Self, AuthError> {
        if !Self::is_valid_code(room_code) {
            return Err(AuthError::InvalidRoomCode);
        }
        Ok(Self {
            room_code: Self::normalize_code(room_code),
            blacklist: HashSet::new(),
        })
    }

    pub fn authorize_join(&self, room_code: &str, user_id: &str) -> Result<(), AuthError> {
        if !Self::is_valid_code(room_code) {
            return Err(AuthError::InvalidRoomCode);
        }
        if self.room_code != Self::normalize_code(room_code) {
            return Err(AuthError::WrongRoomCode);
        }
        if self.blacklist.contains(user_id) {
            return Err(AuthError::BlacklistedUser);
        }
        Ok(())
    }

    pub fn block_user(&mut self, user_id: &str) {
        self.blacklist.insert(user_id.to_string());
    }

    pub fn unblock_user(&mut self, user_id: &str) -> bool {
        self.blacklist.remove(user_id)
    }

    pub fn is_blacklisted(&self, user_id: &str) -> bool {
        self.blacklist.contains(user_id)
    }

    fn is_valid_code(code: &str) -> bool {
        code.len() == 6 && code.chars().all(|c| c.is_ascii_alphanumeric())
    }

    fn normalize_code(code: &str) -> String {
        code.to_ascii_uppercase()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorize_with_correct_code_should_pass() {
        let gate = HostAuthGate::new("A9B2K8").unwrap();
        assert_eq!(gate.authorize_join("A9B2K8", "uuid-a"), Ok(()));
    }

    #[test]
    fn authorize_with_wrong_code_should_fail() {
        let gate = HostAuthGate::new("A9B2K8").unwrap();
        let res = gate.authorize_join("B1C2D3", "uuid-a");
        assert_eq!(res, Err(AuthError::WrongRoomCode));
    }

    #[test]
    fn authorize_blacklisted_user_should_fail() {
        let mut gate = HostAuthGate::new("A9B2K8").unwrap();
        gate.block_user("uuid-evil");
        let res = gate.authorize_join("A9B2K8", "uuid-evil");
        assert_eq!(res, Err(AuthError::BlacklistedUser));
    }

    #[test]
    fn authorize_with_lowercase_code_should_pass() {
        let gate = HostAuthGate::new("A9B2K8").unwrap();
        let res = gate.authorize_join("a9b2k8", "uuid-a");
        assert_eq!(res, Ok(()));
    }

    #[test]
    fn create_gate_with_invalid_code_should_fail() {
        let gate = HostAuthGate::new("A9B2");
        assert!(matches!(gate, Err(AuthError::InvalidRoomCode)));
    }
}
