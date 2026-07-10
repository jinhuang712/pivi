use std::io;
use std::net::{SocketAddr, TcpListener, TcpStream};

use tungstenite::{accept, WebSocket};

/// Owns the TCP listener the host's control plane binds. The same listener
/// serves both line-delimited JSON requests (signalling/join/host-management)
/// and WebSocket upgrades (the persistent event-push channel introduced by C1),
/// distinguished per-connection via [`is_websocket_upgrade`].
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

    pub fn try_clone_listener(&self) -> io::Result<TcpListener> {
        self.listener.try_clone()
    }
}

/// Peek the connection's first bytes to tell a WebSocket upgrade (an HTTP
/// request line starting with "GET ") apart from a line-delimited JSON control
/// request (which starts with "{"). This is what lets both protocols share the
/// single NAT-mapped port. Blocks until the first bytes arrive.
pub fn is_websocket_upgrade(stream: &TcpStream) -> bool {
    let mut buf = [0u8; 4];
    match stream.peek(&mut buf) {
        Ok(n) if n >= 3 => &buf[..3] == b"GET",
        _ => false,
    }
}

/// Complete the WebSocket handshake on a connection already identified as an
/// upgrade via [`is_websocket_upgrade`].
pub fn accept_websocket(stream: TcpStream) -> io::Result<WebSocket<TcpStream>> {
    accept(stream).map_err(|err| io::Error::new(io::ErrorKind::Other, format!("{err}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::thread;
    use tungstenite::{connect, protocol::Message};

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

    #[test]
    fn websocket_handshake_roundtrips_and_echoes_text() {
        let server = WebSocketServer::bind("127.0.0.1", 0).unwrap();
        let addr = server.local_addr();

        let join = thread::spawn(move || {
            let (stream, _) = server.listener.accept().unwrap();
            assert!(
                is_websocket_upgrade(&stream),
                "should detect the WS upgrade from the GET request line"
            );
            let mut ws = accept_websocket(stream).unwrap();
            let incoming = ws.read().unwrap().into_text().unwrap();
            assert_eq!(incoming, "hello");
            ws.send(Message::Text("hello-back".into())).unwrap();
        });

        let (mut client, _response) =
            connect(format!("ws://127.0.0.1:{}/", addr.port())).unwrap();
        client.send(Message::Text("hello".into())).unwrap();
        let reply = client.read().unwrap().into_text().unwrap();
        assert_eq!(reply, "hello-back");

        join.join().unwrap();
    }

    #[test]
    fn is_websocket_upgrade_should_be_false_for_json_line_request() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let addr = listener.local_addr().unwrap();

        let client = thread::spawn(move || {
            let mut stream = TcpStream::connect(addr).unwrap();
            stream.write_all(b"{\"type\":\"GetEvents\"}\n").unwrap();
        });

        let (stream, _) = listener.accept().unwrap();
        // peek blocks until the JSON line arrives, so no race.
        assert!(
            !is_websocket_upgrade(&stream),
            "a JSON-line request must not look like a WS upgrade"
        );
        client.join().unwrap();
    }
}
