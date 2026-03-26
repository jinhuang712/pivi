use std::net::Ipv4Addr;

const INVITE_CODE_VERSION: u8 = 1;
const RAW_INVITE_CODE_LENGTH: usize = 16;
const GROUP_SIZE: usize = 4;
const CROCKFORD_BASE32: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InviteEndpointScope {
    PrivateLanIpv4,
    PublicMappedIpv4,
    PublicDirectIpv4,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InviteJoinMode {
    DirectHost,
    HostRelayPreferred,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InviteCodePayload {
    pub endpoint_scope: InviteEndpointScope,
    pub join_mode: InviteJoinMode,
    pub ipv4: Ipv4Addr,
    pub port: u16,
    pub expiry_slot: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InviteCodeError {
    InvalidLength,
    InvalidCharacter(char),
    InvalidFieldValue,
    InvalidChecksum,
    ExpiredInviteCode,
    UnsupportedVersion(u8),
}

impl InviteEndpointScope {
    fn to_bits(self) -> u8 {
        match self {
            Self::PrivateLanIpv4 => 0,
            Self::PublicMappedIpv4 => 1,
            Self::PublicDirectIpv4 => 2,
        }
    }

    fn from_bits(bits: u8) -> Result<Self, InviteCodeError> {
        match bits {
            0 => Ok(Self::PrivateLanIpv4),
            1 => Ok(Self::PublicMappedIpv4),
            2 => Ok(Self::PublicDirectIpv4),
            _ => Err(InviteCodeError::InvalidChecksum),
        }
    }
}

impl InviteJoinMode {
    fn to_bits(self) -> u8 {
        match self {
            Self::DirectHost => 0,
            Self::HostRelayPreferred => 1,
        }
    }

    fn from_bits(bits: u8) -> Result<Self, InviteCodeError> {
        match bits {
            0 => Ok(Self::DirectHost),
            1 => Ok(Self::HostRelayPreferred),
            _ => Err(InviteCodeError::InvalidChecksum),
        }
    }
}

pub fn encode_invite_code(payload: &InviteCodePayload) -> Result<String, InviteCodeError> {
    if payload.expiry_slot > 0x03ff {
        return Err(InviteCodeError::InvalidFieldValue);
    }

    let header = ((INVITE_CODE_VERSION as u128) << 62)
        | ((payload.endpoint_scope.to_bits() as u128) << 60)
        | ((payload.join_mode.to_bits() as u128) << 58)
        | ((u32::from(payload.ipv4) as u128) << 26)
        | ((payload.port as u128) << 10)
        | (payload.expiry_slot as u128);

    let checksum = compute_checksum(header);
    encode_bits((header << 14) | checksum as u128)
}

pub fn format_invite_code(code: &str) -> Result<String, InviteCodeError> {
    let normalized = normalize_code(code)?;
    let grouped = normalized
        .as_bytes()
        .chunks(GROUP_SIZE)
        .map(|chunk| std::str::from_utf8(chunk).unwrap_or_default())
        .collect::<Vec<_>>()
        .join("-");

    Ok(grouped)
}

pub fn decode_invite_code(code: &str, current_slot: u16) -> Result<InviteCodePayload, InviteCodeError> {
    let normalized = normalize_code(code)?;
    let value = decode_bits(&normalized)?;
    let version = ((value >> 76) & 0x0f) as u8;
    if version != INVITE_CODE_VERSION {
        return Err(InviteCodeError::UnsupportedVersion(version));
    }

    let header = value >> 14;
    let actual_checksum = (value & 0x3fff) as u16;
    let expected_checksum = compute_checksum(header);
    if actual_checksum != expected_checksum {
        return Err(InviteCodeError::InvalidChecksum);
    }

    let expiry_slot = (header & 0x03ff) as u16;
    if is_expired(expiry_slot, current_slot) {
        return Err(InviteCodeError::ExpiredInviteCode);
    }

    let port = ((header >> 10) & 0xffff) as u16;
    let ipv4 = Ipv4Addr::from(((header >> 26) & 0xffff_ffff) as u32);
    let join_mode = InviteJoinMode::from_bits(((header >> 58) & 0x03) as u8)?;
    let endpoint_scope = InviteEndpointScope::from_bits(((header >> 60) & 0x03) as u8)?;

    Ok(InviteCodePayload {
        endpoint_scope,
        join_mode,
        ipv4,
        port,
        expiry_slot,
    })
}

fn normalize_code(code: &str) -> Result<String, InviteCodeError> {
    let normalized = code
        .chars()
        .filter(|ch| !ch.is_ascii_whitespace() && *ch != '-')
        .map(normalize_character)
        .collect::<Result<String, InviteCodeError>>()?;

    if normalized.len() != RAW_INVITE_CODE_LENGTH {
        return Err(InviteCodeError::InvalidLength);
    }

    Ok(normalized)
}

fn normalize_character(ch: char) -> Result<char, InviteCodeError> {
    let upper = ch.to_ascii_uppercase();
    let mapped = match upper {
        'O' => '0',
        'I' | 'L' => '1',
        value => value,
    };

    if decode_character(mapped).is_some() {
        Ok(mapped)
    } else {
        Err(InviteCodeError::InvalidCharacter(ch))
    }
}

fn encode_bits(value: u128) -> Result<String, InviteCodeError> {
    let mut encoded = String::with_capacity(RAW_INVITE_CODE_LENGTH);

    for index in 0..RAW_INVITE_CODE_LENGTH {
        let shift = 75usize.saturating_sub(index * 5);
        let alphabet_index = ((value >> shift) & 0x1f) as usize;
        let ch = CROCKFORD_BASE32
            .get(alphabet_index)
            .ok_or(InviteCodeError::InvalidFieldValue)?;
        encoded.push(*ch as char);
    }

    Ok(encoded)
}

fn decode_bits(code: &str) -> Result<u128, InviteCodeError> {
    let mut value = 0u128;

    for ch in code.chars() {
        let digit = decode_character(ch).ok_or(InviteCodeError::InvalidCharacter(ch))?;
        value = (value << 5) | digit as u128;
    }

    Ok(value)
}

fn decode_character(ch: char) -> Option<u8> {
    match ch {
        '0' => Some(0),
        '1' => Some(1),
        '2' => Some(2),
        '3' => Some(3),
        '4' => Some(4),
        '5' => Some(5),
        '6' => Some(6),
        '7' => Some(7),
        '8' => Some(8),
        '9' => Some(9),
        'A' => Some(10),
        'B' => Some(11),
        'C' => Some(12),
        'D' => Some(13),
        'E' => Some(14),
        'F' => Some(15),
        'G' => Some(16),
        'H' => Some(17),
        'J' => Some(18),
        'K' => Some(19),
        'M' => Some(20),
        'N' => Some(21),
        'P' => Some(22),
        'Q' => Some(23),
        'R' => Some(24),
        'S' => Some(25),
        'T' => Some(26),
        'V' => Some(27),
        'W' => Some(28),
        'X' => Some(29),
        'Y' => Some(30),
        'Z' => Some(31),
        _ => None,
    }
}

fn compute_checksum(header: u128) -> u16 {
    let mut hash = 0x811c9dc5u32;
    for byte in header.to_be_bytes() {
        hash ^= byte as u32;
        hash = hash.wrapping_mul(0x0100_0193);
    }

    (hash & 0x3fff) as u16
}

fn is_expired(expiry_slot: u16, current_slot: u16) -> bool {
    let current = current_slot & 0x03ff;
    let delta = current.wrapping_sub(expiry_slot) & 0x03ff;
    delta != 0 && delta < 512
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_payload() -> InviteCodePayload {
        InviteCodePayload {
            endpoint_scope: InviteEndpointScope::PublicMappedIpv4,
            join_mode: InviteJoinMode::DirectHost,
            ipv4: Ipv4Addr::new(203, 0, 113, 12),
            port: 7788,
            expiry_slot: 512,
        }
    }

    #[test]
    fn encode_then_decode_should_roundtrip_payload() {
        let payload = sample_payload();
        let encoded = encode_invite_code(&payload).unwrap();

        assert_eq!(encoded.len(), 16);
        assert_eq!(decode_invite_code(&encoded, 511).unwrap(), payload);
    }

    #[test]
    fn format_code_should_group_into_four_character_chunks() {
        let payload = sample_payload();
        let encoded = encode_invite_code(&payload).unwrap();

        let formatted = format_invite_code(&encoded).unwrap();
        let groups: Vec<_> = formatted.split('-').collect();

        assert_eq!(groups.len(), 4);
        assert!(groups.iter().all(|group| group.len() == 4));
        assert_eq!(formatted.replace('-', ""), encoded);
    }

    #[test]
    fn decode_should_accept_lowercase_grouped_input() {
        let payload = sample_payload();
        let encoded = encode_invite_code(&payload).unwrap();
        let formatted = format_invite_code(&encoded).unwrap().to_ascii_lowercase();

        assert_eq!(
            decode_invite_code(&formatted, 511).unwrap(),
            payload
        );
    }

    #[test]
    fn decode_should_reject_code_with_invalid_checksum() {
        let payload = sample_payload();
        let mut tampered = encode_invite_code(&payload).unwrap().chars().collect::<Vec<_>>();
        tampered[15] = if tampered[15] == '0' { '1' } else { '0' };
        let err = decode_invite_code(&tampered.into_iter().collect::<String>(), 511).unwrap_err();

        assert_eq!(err, InviteCodeError::InvalidChecksum);
    }

    #[test]
    fn decode_should_reject_expired_code() {
        let payload = sample_payload();
        let encoded = encode_invite_code(&payload).unwrap();
        let err = decode_invite_code(&encoded, payload.expiry_slot + 1).unwrap_err();

        assert_eq!(err, InviteCodeError::ExpiredInviteCode);
    }
}
