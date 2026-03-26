use crate::room_state::RoomState;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WebRtcSignalType {
    Offer,
    Answer,
    IceCandidate,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebRtcSignal {
    pub from: String,
    pub target: String,
    pub signal_type: WebRtcSignalType,
    pub payload: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WebRtcRelayError {
    SourceNotInRoom,
    TargetNotInRoom,
    TargetIsSelf,
}

pub struct WebRtcRelayRouter;

impl WebRtcRelayRouter {
    pub fn relay(room: &RoomState, signal: WebRtcSignal) -> Result<WebRtcSignal, WebRtcRelayError> {
        if !room.has_member(&signal.from) {
            return Err(WebRtcRelayError::SourceNotInRoom);
        }
        if !room.has_member(&signal.target) {
            return Err(WebRtcRelayError::TargetNotInRoom);
        }
        if signal.from == signal.target {
            return Err(WebRtcRelayError::TargetIsSelf);
        }
        Ok(signal)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_room() -> RoomState {
        let mut room = RoomState::new("A9B2K8", "host-1", "HuangJin");
        room.add_member("user-a", "Player A").unwrap();
        room.add_member("user-b", "Player B").unwrap();
        room
    }

    #[test]
    fn relay_offer_should_pass_when_from_and_target_exist() {
        let room = make_room();
        let signal = WebRtcSignal {
            from: "user-a".to_string(),
            target: "user-b".to_string(),
            signal_type: WebRtcSignalType::Offer,
            payload: "offer-sdp".to_string(),
        };
        let relayed = WebRtcRelayRouter::relay(&room, signal.clone()).unwrap();
        assert_eq!(relayed, signal);
    }

    #[test]
    fn relay_should_fail_when_source_not_in_room() {
        let room = make_room();
        let signal = WebRtcSignal {
            from: "user-x".to_string(),
            target: "user-b".to_string(),
            signal_type: WebRtcSignalType::Offer,
            payload: "offer-sdp".to_string(),
        };
        let res = WebRtcRelayRouter::relay(&room, signal);
        assert_eq!(res, Err(WebRtcRelayError::SourceNotInRoom));
    }

    #[test]
    fn relay_should_fail_when_target_not_in_room() {
        let room = make_room();
        let signal = WebRtcSignal {
            from: "user-a".to_string(),
            target: "user-x".to_string(),
            signal_type: WebRtcSignalType::Answer,
            payload: "answer-sdp".to_string(),
        };
        let res = WebRtcRelayRouter::relay(&room, signal);
        assert_eq!(res, Err(WebRtcRelayError::TargetNotInRoom));
    }

    #[test]
    fn relay_should_fail_when_target_is_self() {
        let room = make_room();
        let signal = WebRtcSignal {
            from: "user-a".to_string(),
            target: "user-a".to_string(),
            signal_type: WebRtcSignalType::IceCandidate,
            payload: "candidate".to_string(),
        };
        let res = WebRtcRelayRouter::relay(&room, signal);
        assert_eq!(res, Err(WebRtcRelayError::TargetIsSelf));
    }
}
