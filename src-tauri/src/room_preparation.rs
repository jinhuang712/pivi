use std::net::Ipv4Addr;
use std::sync::Mutex;

use crate::invite_code::{encode_invite_code, format_invite_code, InviteCodePayload, InviteEndpointScope, InviteJoinMode};
use crate::nat_mapping::{NatMappingLease, NatMappingManager, NatMappingProtocol, PortmapperBackend};
use crate::ws_server::WebSocketServer;

const DEFAULT_PORT_POOL: [u16; 4] = [7788, 7789, 7790, 7791];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedRoomInvite {
    pub invite_code: String,
    pub port: u16,
    pub reused_last_successful_port: bool,
    pub used_external_mapping: bool,
    pub nat_mapping_protocol: Option<NatMappingProtocol>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum RoomPreparationError {
    InviteEncodingFailed,
}

pub struct RoomPreparationState {
    port_pool: Vec<u16>,
    active_server: Mutex<Option<WebSocketServer>>,
    last_successful_port: Mutex<Option<u16>>,
    nat_mapping_manager: NatMappingManager<PortmapperBackend>,
}

impl RoomPreparationState {
    pub fn new(port_pool: Vec<u16>) -> Self {
        Self {
            port_pool,
            active_server: Mutex::new(None),
            last_successful_port: Mutex::new(None),
            nat_mapping_manager: NatMappingManager::new(),
        }
    }

    pub async fn prepare_room_invite(&self, ipv4: Ipv4Addr, expiry_slot: u16) -> Result<PreparedRoomInvite, RoomPreparationError> {
        let last_successful_port = *self.last_successful_port.lock().unwrap();
        let (server, reused_last_successful_port) = self.bind_server(last_successful_port);
        let port = server.local_addr().port();

        {
            let mut last = self.last_successful_port.lock().unwrap();
            *last = Some(port);
        }
        {
            let mut active_server = self.active_server.lock().unwrap();
            *active_server = Some(server);
        }

        let nat_mapping = self.nat_mapping_manager.prepare_tcp_mapping(port).await.ok();
        let invite_payload = build_invite_payload(ipv4, port, expiry_slot, nat_mapping.as_ref().and_then(|mapping| mapping.lease.as_ref()));

        let invite_code = format_invite_code(
            &encode_invite_code(&invite_payload).map_err(|_| RoomPreparationError::InviteEncodingFailed)?,
        )
        .map_err(|_| RoomPreparationError::InviteEncodingFailed)?;

        Ok(PreparedRoomInvite {
            invite_code,
            port,
            reused_last_successful_port,
            used_external_mapping: nat_mapping.as_ref().and_then(|mapping| mapping.lease.as_ref()).is_some(),
            nat_mapping_protocol: nat_mapping.and_then(|mapping| mapping.lease.map(|lease| lease.protocol)),
        })
    }

    fn bind_server(&self, last_successful_port: Option<u16>) -> (WebSocketServer, bool) {
        if let Some(port) = last_successful_port {
            if let Ok(server) = WebSocketServer::bind("127.0.0.1", port) {
                return (server, true);
            }
        }

        for candidate in self.port_pool.iter().copied() {
            if Some(candidate) == last_successful_port {
                continue;
            }

            if let Ok(server) = WebSocketServer::bind("127.0.0.1", candidate) {
                return (server, false);
            }
        }

        (
            WebSocketServer::bind("127.0.0.1", 0).expect("failed to bind fallback ephemeral port"),
            false,
        )
    }
}

fn build_invite_payload(
    ipv4: Ipv4Addr,
    port: u16,
    expiry_slot: u16,
    nat_mapping_lease: Option<&NatMappingLease>,
) -> InviteCodePayload {
    if let Some(lease) = nat_mapping_lease {
        InviteCodePayload {
            endpoint_scope: InviteEndpointScope::PublicMappedIpv4,
            join_mode: InviteJoinMode::DirectHost,
            ipv4: *lease.external_address.ip(),
            port: lease.external_address.port(),
            expiry_slot,
        }
    } else {
        InviteCodePayload {
            endpoint_scope: InviteEndpointScope::PrivateLanIpv4,
            join_mode: InviteJoinMode::DirectHost,
            ipv4,
            port,
            expiry_slot,
        }
    }
}

impl Default for RoomPreparationState {
    fn default() -> Self {
        Self::new(DEFAULT_PORT_POOL.to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_available_pool() -> Vec<u16> {
        (0..4)
            .map(|_| WebSocketServer::bind("127.0.0.1", 0).unwrap().local_addr().port())
            .collect()
    }

    #[tokio::test]
    async fn should_prefer_last_successful_port_when_available() {
        let pool = build_available_pool();
        let state = RoomPreparationState::new(pool.clone());
        {
            let mut last = state.last_successful_port.lock().unwrap();
            *last = Some(pool[1]);
        }

        let prepared = state
            .prepare_room_invite(Ipv4Addr::new(192, 168, 31, 10), 500)
            .await
            .unwrap();

        assert_eq!(prepared.port, pool[1]);
        assert!(prepared.reused_last_successful_port);
    }

    #[tokio::test]
    async fn should_fallback_to_port_pool_when_last_successful_port_is_busy() {
        let pool = build_available_pool();
        let _occupied = WebSocketServer::bind("127.0.0.1", pool[1]).unwrap();
        let state = RoomPreparationState::new(pool.clone());
        {
            let mut last = state.last_successful_port.lock().unwrap();
            *last = Some(pool[1]);
        }

        let prepared = state
            .prepare_room_invite(Ipv4Addr::new(192, 168, 31, 10), 500)
            .await
            .unwrap();

        assert_eq!(prepared.port, pool[0]);
        assert!(!prepared.reused_last_successful_port);
    }

    #[tokio::test]
    async fn should_fallback_to_ephemeral_port_when_pool_is_unavailable() {
        let pool = build_available_pool();
        let _occupied = pool
            .iter()
            .map(|port| WebSocketServer::bind("127.0.0.1", *port).unwrap())
            .collect::<Vec<_>>();
        let state = RoomPreparationState::new(pool.clone());

        let prepared = state
            .prepare_room_invite(Ipv4Addr::new(192, 168, 31, 10), 500)
            .await
            .unwrap();

        assert!(!pool.contains(&prepared.port));
        assert!(prepared.port > 0);
    }

    #[tokio::test]
    async fn should_return_formatted_invite_code() {
        let state = RoomPreparationState::new(build_available_pool());

        let prepared = state
            .prepare_room_invite(Ipv4Addr::new(192, 168, 31, 10), 500)
            .await
            .unwrap();

        assert_eq!(prepared.invite_code.len(), 19);
        assert_eq!(prepared.invite_code.matches('-').count(), 3);
    }

    #[test]
    fn should_use_public_mapped_payload_when_nat_mapping_is_present() {
        let payload = build_invite_payload(
            Ipv4Addr::new(192, 168, 31, 10),
            7788,
            500,
            Some(&NatMappingLease {
                protocol: NatMappingProtocol::Pcp,
                external_address: std::net::SocketAddrV4::new(Ipv4Addr::new(198, 51, 100, 20), 9000),
            }),
        );

        assert_eq!(payload.endpoint_scope, InviteEndpointScope::PublicMappedIpv4);
        assert_eq!(payload.ipv4, Ipv4Addr::new(198, 51, 100, 20));
        assert_eq!(payload.port, 9000);
    }
}
