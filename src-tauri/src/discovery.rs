use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoomEndpoint {
    pub room_name: String,
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiscoveryError {
    InvalidCode,
}

pub struct DiscoveryService {
    rooms: HashMap<String, RoomEndpoint>,
}

impl DiscoveryService {
    pub fn new() -> Self {
        Self {
            rooms: HashMap::new(),
        }
    }

    pub fn register(&mut self, code: &str, endpoint: RoomEndpoint) -> Result<(), DiscoveryError> {
        if !Self::is_valid_code(code) {
            return Err(DiscoveryError::InvalidCode);
        }
        let normalized = Self::normalize_code(code);
        self.rooms.insert(normalized, endpoint);
        Ok(())
    }

    pub fn resolve(&self, code: &str) -> Option<RoomEndpoint> {
        if !Self::is_valid_code(code) {
            return None;
        }
        let normalized = Self::normalize_code(code);
        self.rooms.get(&normalized).cloned()
    }

    pub fn unregister(&mut self, code: &str) -> bool {
        if !Self::is_valid_code(code) {
            return false;
        }
        let normalized = Self::normalize_code(code);
        self.rooms.remove(&normalized).is_some()
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

    fn build_endpoint() -> RoomEndpoint {
        RoomEndpoint {
            room_name: "周末电竞开黑房".to_string(),
            host: "192.168.31.10".to_string(),
            port: 7788,
        }
    }

    #[test]
    fn register_and_resolve_should_return_endpoint() {
        let mut service = DiscoveryService::new();
        service.register("A9B2K8", build_endpoint()).unwrap();
        let resolved = service.resolve("A9B2K8");
        assert!(resolved.is_some());
        assert_eq!(resolved.unwrap().host, "192.168.31.10");
    }

    #[test]
    fn invalid_code_should_be_rejected() {
        let mut service = DiscoveryService::new();
        let res = service.register("A9B2", build_endpoint());
        assert_eq!(res, Err(DiscoveryError::InvalidCode));
    }

    #[test]
    fn unregister_should_remove_mapping() {
        let mut service = DiscoveryService::new();
        service.register("A9B2K8", build_endpoint()).unwrap();
        assert!(service.unregister("A9B2K8"));
        assert!(service.resolve("A9B2K8").is_none());
    }

    #[test]
    fn resolve_should_support_lowercase_input() {
        let mut service = DiscoveryService::new();
        service.register("A9B2K8", build_endpoint()).unwrap();
        let resolved = service.resolve("a9b2k8");
        assert!(resolved.is_some());
    }
}
