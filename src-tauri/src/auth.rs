use std::collections::HashSet;

use crate::invite_code::{decode_invite_code, InviteCodeError, InviteCodePayload};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthError {
    InvalidInviteCode,
    InvalidChecksum,
    ExpiredInviteCode,
    WrongInviteCode,
    BlacklistedUser,
}

pub struct HostAuthGate {
    invite_payload: InviteCodePayload,
    blacklist: HashSet<String>,
}

impl HostAuthGate {
    pub fn new(invite_code: &str, current_slot: u16) -> Result<Self, AuthError> {
        let invite_payload = decode_invite_code(invite_code, current_slot).map_err(map_invite_code_error)?;
        Ok(Self {
            invite_payload,
            blacklist: HashSet::new(),
        })
    }

    pub fn authorize_join(&self, invite_code: &str, user_id: &str, current_slot: u16) -> Result<(), AuthError> {
        let invite_payload = decode_invite_code(invite_code, current_slot).map_err(map_invite_code_error)?;
        if self.invite_payload != invite_payload {
            return Err(AuthError::WrongInviteCode);
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
}

fn map_invite_code_error(error: InviteCodeError) -> AuthError {
    match error {
        InviteCodeError::InvalidLength
        | InviteCodeError::InvalidCharacter(_)
        | InviteCodeError::InvalidFieldValue
        | InviteCodeError::UnsupportedVersion(_) => AuthError::InvalidInviteCode,
        InviteCodeError::InvalidChecksum => AuthError::InvalidChecksum,
        InviteCodeError::ExpiredInviteCode => AuthError::ExpiredInviteCode,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    use crate::invite_code::{encode_invite_code, InviteEndpointScope, InviteJoinMode};

    fn build_invite_code(expiry_slot: u16) -> String {
        encode_invite_code(&InviteCodePayload {
            endpoint_scope: InviteEndpointScope::PublicMappedIpv4,
            join_mode: InviteJoinMode::DirectHost,
            ipv4: Ipv4Addr::new(203, 0, 113, 12),
            port: 7788,
            expiry_slot,
        })
        .unwrap()
    }

    #[test]
    fn authorize_with_correct_invite_code_should_pass() {
        let invite_code = build_invite_code(512);
        let gate = HostAuthGate::new(&invite_code, 0).unwrap();
        assert_eq!(gate.authorize_join(&invite_code, "uuid-a", 0), Ok(()));
    }

    #[test]
    fn authorize_with_wrong_invite_code_should_fail() {
        let invite_code = build_invite_code(512);
        let wrong_invite_code = encode_invite_code(&InviteCodePayload {
            endpoint_scope: InviteEndpointScope::PublicMappedIpv4,
            join_mode: InviteJoinMode::DirectHost,
            ipv4: Ipv4Addr::new(203, 0, 113, 12),
            port: 7789,
            expiry_slot: 512,
        })
        .unwrap();
        let gate = HostAuthGate::new(&invite_code, 0).unwrap();
        let res = gate.authorize_join(&wrong_invite_code, "uuid-a", 0);
        assert_eq!(res, Err(AuthError::WrongInviteCode));
    }

    #[test]
    fn authorize_blacklisted_user_should_fail() {
        let invite_code = build_invite_code(512);
        let mut gate = HostAuthGate::new(&invite_code, 0).unwrap();
        gate.block_user("uuid-evil");
        let res = gate.authorize_join(&invite_code, "uuid-evil", 0);
        assert_eq!(res, Err(AuthError::BlacklistedUser));
    }

    #[test]
    fn authorize_with_lowercase_grouped_invite_code_should_pass() {
        let invite_code = build_invite_code(512);
        let grouped = crate::invite_code::format_invite_code(&invite_code)
            .unwrap()
            .to_ascii_lowercase();
        let gate = HostAuthGate::new(&invite_code, 0).unwrap();
        let res = gate.authorize_join(&grouped, "uuid-a", 0);
        assert_eq!(res, Ok(()));
    }

    #[test]
    fn create_gate_with_invalid_invite_code_should_fail() {
        let gate = HostAuthGate::new("A9B2", 0);
        assert!(matches!(gate, Err(AuthError::InvalidInviteCode)));
    }

    #[test]
    fn authorize_with_invalid_checksum_should_fail() {
        let invite_code = build_invite_code(512);
        let mut tampered = invite_code.chars().collect::<Vec<_>>();
        tampered[15] = if tampered[15] == '0' { '1' } else { '0' };
        let gate = HostAuthGate::new(&invite_code, 0).unwrap();
        let res = gate.authorize_join(&tampered.into_iter().collect::<String>(), "uuid-a", 0);

        assert_eq!(res, Err(AuthError::InvalidChecksum));
    }

    #[test]
    fn authorize_with_expired_invite_code_should_fail() {
        let invite_code = build_invite_code(1);
        let gate = HostAuthGate::new(&invite_code, 0).unwrap();
        let res = gate.authorize_join(&invite_code, "uuid-a", 2);

        assert_eq!(res, Err(AuthError::ExpiredInviteCode));
    }
}
