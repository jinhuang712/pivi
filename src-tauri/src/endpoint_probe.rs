use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EndpointProbeResult {
    pub reachable: bool,
    pub failure_kind: Option<&'static str>,
    pub elapsed_ms: u64,
}

pub fn probe_endpoint(ipv4: Ipv4Addr, port: u16, timeout_ms: u64) -> EndpointProbeResult {
    let started_at = Instant::now();
    let timeout = Duration::from_millis(timeout_ms.max(1));
    let address = SocketAddrV4::new(ipv4, port);

    match TcpStream::connect_timeout(&address.into(), timeout) {
        Ok(stream) => {
            let _ = stream.shutdown(std::net::Shutdown::Both);
            EndpointProbeResult {
                reachable: true,
                failure_kind: None,
                elapsed_ms: started_at.elapsed().as_millis() as u64,
            }
        }
        Err(error) => EndpointProbeResult {
            reachable: false,
            failure_kind: Some(match error.kind() {
                std::io::ErrorKind::ConnectionRefused => "connection-refused",
                std::io::ErrorKind::TimedOut => "timeout",
                std::io::ErrorKind::AddrNotAvailable
                | std::io::ErrorKind::HostUnreachable
                | std::io::ErrorKind::NetworkUnreachable => "unreachable",
                _ => "unknown",
            }),
            elapsed_ms: started_at.elapsed().as_millis() as u64,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn probe_should_report_reachable_for_listening_endpoint() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();

        let result = probe_endpoint(Ipv4Addr::LOCALHOST, port, 100);

        assert!(result.reachable);
        assert_eq!(result.failure_kind, None);
    }

    #[test]
    fn probe_should_report_connection_refused_for_closed_endpoint() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let result = probe_endpoint(Ipv4Addr::LOCALHOST, port, 100);

        assert!(!result.reachable);
        assert_eq!(result.failure_kind, Some("connection-refused"));
    }
}
