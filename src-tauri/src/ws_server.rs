use std::io;
use std::net::{SocketAddr, TcpListener};

pub struct WebSocketServer {
    listener: TcpListener,
    local_addr: SocketAddr,
}

impl WebSocketServer {
    pub fn bind(host: &str, port: u16) -> io::Result<Self> {
        let listener = TcpListener::bind((host, port))?;
        let local_addr = listener.local_addr()?;
        Ok(Self {
            listener,
            local_addr,
        })
    }

    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    pub fn is_listening(&self) -> bool {
        self.listener.local_addr().is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bind_ephemeral_port_should_listen() {
        let server = WebSocketServer::bind("127.0.0.1", 0).unwrap();
        assert!(server.is_listening());
        assert!(server.local_addr().port() > 0);
    }

    #[test]
    fn bind_same_port_twice_should_fail() {
        let first = WebSocketServer::bind("127.0.0.1", 0).unwrap();
        let used_port = first.local_addr().port();
        let second = WebSocketServer::bind("127.0.0.1", used_port);
        assert!(second.is_err());
    }
}
