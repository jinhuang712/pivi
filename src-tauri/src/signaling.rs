use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "payload")]
pub enum SignalingMessage {
    JoinRoom { room_id: String, user_id: String, locale: Option<String> },
    LeaveRoom { room_id: String, user_id: String },
    Mute { user_id: String, is_muted: bool },
}

impl SignalingMessage {
    pub fn parse(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_join_room() {
        // Mocking a signaling message, keeping in mind cross-border/globalization scalability 
        // with properties like 'locale' or future 'timezone' properties.
        let json = r#"{"type":"JoinRoom","payload":{"room_id":"room_123","user_id":"user_456","locale":"en-US"}}"#;
        let msg = SignalingMessage::parse(json).unwrap();
        assert_eq!(
            msg,
            SignalingMessage::JoinRoom {
                room_id: "room_123".to_string(),
                user_id: "user_456".to_string(),
                locale: Some("en-US".to_string())
            }
        );
    }

    #[test]
    fn test_serialize_mute() {
        let msg = SignalingMessage::Mute {
            user_id: "user_789".to_string(),
            is_muted: true,
        };
        let json = msg.to_json().unwrap();
        assert_eq!(
            json,
            r#"{"type":"Mute","payload":{"user_id":"user_789","is_muted":true}}"#
        );
    }

    #[test]
    fn test_parse_invalid_json() {
        let json = r#"{"type":"Unknown"}"#;
        let res = SignalingMessage::parse(json);
        assert!(res.is_err());
    }
}
