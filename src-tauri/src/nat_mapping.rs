use std::future::Future;
use std::net::SocketAddrV4;
use std::num::NonZeroU16;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

#[cfg(not(target_os = "windows"))]
use portmapper::{Client, Config, ProbeOutput, Protocol};
#[cfg(not(target_os = "windows"))]
use tokio::time::timeout;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NatMappingProtocol {
    Upnp,
    Pcp,
    NatPmp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NatMappingProbe {
    pub upnp: bool,
    pub pcp: bool,
    pub nat_pmp: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NatMappingLease {
    pub protocol: NatMappingProtocol,
    pub external_address: SocketAddrV4,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NatMappingPreparation {
    pub probe: NatMappingProbe,
    pub lease: Option<NatMappingLease>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NatMappingError {
    ProbeFailed,
}

pub struct NatMappingManager<B = PortmapperBackend> {
    backend: Arc<B>,
}

impl NatMappingManager<PortmapperBackend> {
    pub fn new() -> Self {
        Self {
            backend: Arc::new(PortmapperBackend),
        }
    }
}

impl Default for NatMappingManager<PortmapperBackend> {
    fn default() -> Self {
        Self::new()
    }
}

impl<B> NatMappingManager<B>
where
    B: NatMappingBackend + 'static,
{
    pub fn with_backend(backend: B) -> Self {
        Self {
            backend: Arc::new(backend),
        }
    }

    pub async fn prepare_tcp_mapping(&self, local_port: u16) -> Result<NatMappingPreparation, NatMappingError> {
        let probe = self.backend.probe().await?;
        let preferred_protocol = select_protocol(&probe);
        let lease = if let Some(protocol) = preferred_protocol {
            self.backend.map_tcp_port(local_port, protocol).await
        } else {
            None
        };

        Ok(NatMappingPreparation { probe, lease })
    }
}

pub trait NatMappingBackend: Send + Sync {
    fn probe(&self) -> Pin<Box<dyn Future<Output = Result<NatMappingProbe, NatMappingError>> + Send + '_>>;

    fn map_tcp_port(
        &self,
        local_port: u16,
        protocol: NatMappingProtocol,
    ) -> Pin<Box<dyn Future<Output = Option<NatMappingLease>> + Send + '_>>;
}

pub struct PortmapperBackend;

#[cfg(not(target_os = "windows"))]
impl NatMappingBackend for PortmapperBackend {
    fn probe(&self) -> Pin<Box<dyn Future<Output = Result<NatMappingProbe, NatMappingError>> + Send + '_>> {
        Box::pin(async move {
            let client = Client::new(Config {
                enable_upnp: true,
                enable_pcp: true,
                enable_nat_pmp: true,
                protocol: Protocol::Tcp,
            });
            let result = client.probe().await.map_err(|_| NatMappingError::ProbeFailed)?;
            let probe = result.map_err(|_| NatMappingError::ProbeFailed)?;
            Ok(NatMappingProbe::from(probe))
        })
    }

    fn map_tcp_port(
        &self,
        local_port: u16,
        protocol: NatMappingProtocol,
    ) -> Pin<Box<dyn Future<Output = Option<NatMappingLease>> + Send + '_>> {
        Box::pin(async move {
            let client = Client::new(config_for(protocol));
            let mut watcher = client.watch_external_address();
            client.update_local_port(NonZeroU16::new(local_port)?);
            client.procure_mapping();

            let mapping_change = timeout(Duration::from_millis(800), watcher.changed()).await.ok()?;
            if mapping_change.is_err() {
                return None;
            }

            let external_address = *watcher.borrow();
            external_address.map(|address| NatMappingLease { protocol, external_address: address })
        })
    }
}

#[cfg(target_os = "windows")]
impl NatMappingBackend for PortmapperBackend {
    fn probe(&self) -> Pin<Box<dyn Future<Output = Result<NatMappingProbe, NatMappingError>> + Send + '_>> {
        Box::pin(async move {
            Ok(NatMappingProbe {
                upnp: false,
                pcp: false,
                nat_pmp: false,
            })
        })
    }

    fn map_tcp_port(
        &self,
        _local_port: u16,
        _protocol: NatMappingProtocol,
    ) -> Pin<Box<dyn Future<Output = Option<NatMappingLease>> + Send + '_>> {
        Box::pin(async move { None })
    }
}

#[cfg(not(target_os = "windows"))]
fn config_for(protocol: NatMappingProtocol) -> Config {
    Config {
        enable_upnp: matches!(protocol, NatMappingProtocol::Upnp),
        enable_pcp: matches!(protocol, NatMappingProtocol::Pcp),
        enable_nat_pmp: matches!(protocol, NatMappingProtocol::NatPmp),
        protocol: Protocol::Tcp,
    }
}

fn select_protocol(probe: &NatMappingProbe) -> Option<NatMappingProtocol> {
    if probe.pcp {
        Some(NatMappingProtocol::Pcp)
    } else if probe.nat_pmp {
        Some(NatMappingProtocol::NatPmp)
    } else if probe.upnp {
        Some(NatMappingProtocol::Upnp)
    } else {
        None
    }
}

#[cfg(not(target_os = "windows"))]
impl From<ProbeOutput> for NatMappingProbe {
    fn from(value: ProbeOutput) -> Self {
        Self {
            upnp: value.upnp,
            pcp: value.pcp,
            nat_pmp: value.nat_pmp,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    struct FakeNatMappingBackend {
        probe: NatMappingProbe,
        leases: Vec<(NatMappingProtocol, SocketAddrV4)>,
    }

    impl NatMappingBackend for FakeNatMappingBackend {
        fn probe(&self) -> Pin<Box<dyn Future<Output = Result<NatMappingProbe, NatMappingError>> + Send + '_>> {
            Box::pin(async move { Ok(self.probe.clone()) })
        }

        fn map_tcp_port(
            &self,
            _local_port: u16,
            protocol: NatMappingProtocol,
        ) -> Pin<Box<dyn Future<Output = Option<NatMappingLease>> + Send + '_>> {
            Box::pin(async move {
                self.leases
                    .iter()
                    .find(|(candidate, _)| *candidate == protocol)
                    .map(|(_, address)| NatMappingLease {
                        protocol,
                        external_address: *address,
                    })
            })
        }
    }

    #[tokio::test]
    async fn should_prefer_pcp_over_other_protocols() {
        let manager = NatMappingManager::with_backend(FakeNatMappingBackend {
            probe: NatMappingProbe {
                upnp: true,
                pcp: true,
                nat_pmp: true,
            },
            leases: vec![
                (NatMappingProtocol::Upnp, SocketAddrV4::new(Ipv4Addr::new(198, 51, 100, 10), 7788)),
                (NatMappingProtocol::Pcp, SocketAddrV4::new(Ipv4Addr::new(198, 51, 100, 11), 7788)),
            ],
        });

        let prepared = manager.prepare_tcp_mapping(7788).await.unwrap();

        assert_eq!(prepared.lease.unwrap().protocol, NatMappingProtocol::Pcp);
    }

    #[tokio::test]
    async fn should_fallback_to_nat_pmp_when_pcp_is_unavailable() {
        let manager = NatMappingManager::with_backend(FakeNatMappingBackend {
            probe: NatMappingProbe {
                upnp: true,
                pcp: false,
                nat_pmp: true,
            },
            leases: vec![(NatMappingProtocol::NatPmp, SocketAddrV4::new(Ipv4Addr::new(198, 51, 100, 12), 7788))],
        });

        let prepared = manager.prepare_tcp_mapping(7788).await.unwrap();

        assert_eq!(prepared.lease.unwrap().protocol, NatMappingProtocol::NatPmp);
    }

    #[tokio::test]
    async fn should_return_probe_without_lease_when_no_protocol_is_available() {
        let manager = NatMappingManager::with_backend(FakeNatMappingBackend {
            probe: NatMappingProbe {
                upnp: false,
                pcp: false,
                nat_pmp: false,
            },
            leases: vec![],
        });

        let prepared = manager.prepare_tcp_mapping(7788).await.unwrap();

        assert_eq!(prepared.lease, None);
        assert!(!prepared.probe.upnp);
        assert!(!prepared.probe.pcp);
        assert!(!prepared.probe.nat_pmp);
    }
}
