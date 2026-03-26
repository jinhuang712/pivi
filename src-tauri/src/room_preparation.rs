use std::net::Ipv4Addr;
use std::sync::Mutex;

use crate::invite_code::{encode_invite_code, format_invite_code, InviteCodePayload, InviteEndpointScope, InviteJoinMode};
use crate::ws_server::WebSocketServer;

const DEFAULT_PORT_POOL: [u16; 4] = [7788, 7789, 7790, 7791];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedRoomInvite {
    pub invite_code: String,
    pub port: u16,
    pub reused_last_successful_port: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum RoomPreparationError {
    InviteEncodingFailed,
}

pub struct RoomPreparationState {
    port_pool: Vec<u16>,
    last_successful_port: Mutex<Option<u16>>,
}

impl RoomPreparationState {
    pub fn new(port_pool: Vec<u16>) -> Self {
        Self {
            port_pool,
            last_successful_port: Mutex::new(None),
        }
    }

    pub fn prepare_room_invite(&self, ipv4: Ipv4Addr, expiry_slot: u16) -> Result<PreparedRoomInvite, RoomPreparationError> {
        let last_successful_port = *self.last_successful_port.lock().unwrap();
        let mut reused_last_successful_port = false;

        let port = if let Some(port) = last_successful_port {
            if is_port_available(port) {
                reused_last_successful_port = true;
                port
            } else {
                self.port_pool
                    .iter()
                    .copied()
                    .find(|candidate| is_port_available(*candidate))
                    .unwrap_or_else(choose_ephemeral_port)
            }
        } else {
            self.port_pool
                .iter()
                .copied()
                .find(|candidate| is_port_available(*candidate))
                .unwrap_or_else(choose_ephemeral_port)
        };

        {
            let mut last = self.last_successful_port.lock().unwrap();
            *last = Some(port);
        }

        let invite_code = format_invite_code(
            &encode_invite_code(&InviteCodePayload {
                endpoint_scope: InviteEndpointScope::PrivateLanIpv4,
                join_mode: InviteJoinMode::DirectHost,
                ipv4,
                port,
                expiry_slot,
            })
            .map_err(|_| RoomPreparationError::InviteEncodingFailed)?,
        )
        .map_err(|_| RoomPreparationError::InviteEncodingFailed)?;

        Ok(PreparedRoomInvite {
            invite_code,
            port,
            reused_last_successful_port,
        })
    }
}

impl Default for RoomPreparationState {
    fn default() -> Self {
        Self::new(DEFAULT_PORT_POOL.to_vec())
    }
}

fn is_port_available(port: u16) -> bool {
    WebSocketServer::bind("127.0.0.1", port).is_ok()
}

fn choose_ephemeral_port() -> u16 {
    WebSocketServer::bind("127.0.0.1", 0)
        .map(|server| server.local_addr().port())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_available_pool() -> Vec<u16> {
        (0..4)
            .map(|_| WebSocketServer::bind("127.0.0.1", 0).unwrap().local_addr().port())
            .collect()
    }

    #[test]
    fn should_prefer_last_successful_port_when_available() {
        let pool = build_available_pool();
        let state = RoomPreparationState::new(pool.clone());
        {
            let mut last = state.last_successful_port.lock().unwrap();
            *last = Some(pool[1]);
        }

        let prepared = state
            .prepare_room_invite(Ipv4Addr::new(192, 168, 31, 10), 500)
            .unwrap();

        assert_eq!(prepared.port, pool[1]);
        assert!(prepared.reused_last_successful_port);
    }

    #[test]
    fn should_fallback_to_port_pool_when_last_successful_port_is_busy() {
        let pool = build_available_pool();
        let _occupied = WebSocketServer::bind("127.0.0.1", pool[1]).unwrap();
        let state = RoomPreparationState::new(pool.clone());
        {
            let mut last = state.last_successful_port.lock().unwrap();
            *last = Some(pool[1]);
        }

        let prepared = state
            .prepare_room_invite(Ipv4Addr::new(192, 168, 31, 10), 500)
            .unwrap();

        assert_eq!(prepared.port, pool[0]);
        assert!(!prepared.reused_last_successful_port);
    }

    #[test]
    fn should_fallback_to_ephemeral_port_when_pool_is_unavailable() {
        let pool = build_available_pool();
        let _occupied = pool
            .iter()
            .map(|port| WebSocketServer::bind("127.0.0.1", *port).unwrap())
            .collect::<Vec<_>>();
        let state = RoomPreparationState::new(pool.clone());

        let prepared = state
            .prepare_room_invite(Ipv4Addr::new(192, 168, 31, 10), 500)
            .unwrap();

        assert!(!pool.contains(&prepared.port));
        assert!(prepared.port > 0);
    }

    #[test]
    fn should_return_formatted_invite_code() {
        let state = RoomPreparationState::new(build_available_pool());

        let prepared = state
            .prepare_room_invite(Ipv4Addr::new(192, 168, 31, 10), 500)
            .unwrap();

        assert_eq!(prepared.invite_code.len(), 19);
        assert_eq!(prepared.invite_code.matches('-').count(), 3);
    }
}
