use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MigrationState {
    Normal { host_id: String },
    MigrationInitiated { from_host: String, to_host: String, started_at: Instant },
    BroadcastNewHost { to_host: String, endpoint: String },
    Reconnecting { to_host: String, endpoint: String },
    Failed { from_host: String, to_host: String, reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MigrationError {
    InvalidTransition,
    Timeout,
}

pub struct HostMigrationMachine {
    state: MigrationState,
    timeout: Duration,
}

impl HostMigrationMachine {
    pub fn new(current_host: &str, timeout: Duration) -> Self {
        Self {
            state: MigrationState::Normal {
                host_id: current_host.to_string(),
            },
            timeout,
        }
    }

    pub fn state(&self) -> &MigrationState {
        &self.state
    }

    pub fn initiate_migration(&mut self, to_host: &str) -> Result<(), MigrationError> {
        match &self.state {
            MigrationState::Normal { host_id } => {
                self.state = MigrationState::MigrationInitiated {
                    from_host: host_id.clone(),
                    to_host: to_host.to_string(),
                    started_at: Instant::now(),
                };
                Ok(())
            }
            _ => Err(MigrationError::InvalidTransition),
        }
    }

    pub fn runtime_ready(&mut self, endpoint: &str) -> Result<(), MigrationError> {
        match &self.state {
            MigrationState::MigrationInitiated {
                from_host,
                to_host,
                started_at,
            } => {
                if started_at.elapsed() > self.timeout {
                    self.state = MigrationState::Failed {
                        from_host: from_host.clone(),
                        to_host: to_host.clone(),
                        reason: "TARGET_RUNTIME_TIMEOUT".to_string(),
                    };
                    return Err(MigrationError::Timeout);
                }
                self.state = MigrationState::BroadcastNewHost {
                    to_host: to_host.clone(),
                    endpoint: endpoint.to_string(),
                };
                Ok(())
            }
            _ => Err(MigrationError::InvalidTransition),
        }
    }

    pub fn broadcast_migrate(&mut self) -> Result<(), MigrationError> {
        match &self.state {
            MigrationState::BroadcastNewHost { to_host, endpoint } => {
                self.state = MigrationState::Reconnecting {
                    to_host: to_host.clone(),
                    endpoint: endpoint.clone(),
                };
                Ok(())
            }
            _ => Err(MigrationError::InvalidTransition),
        }
    }

    pub fn reconnect_completed(&mut self) -> Result<(), MigrationError> {
        match &self.state {
            MigrationState::Reconnecting { to_host, .. } => {
                self.state = MigrationState::Normal {
                    host_id: to_host.clone(),
                };
                Ok(())
            }
            _ => Err(MigrationError::InvalidTransition),
        }
    }

    pub fn fail_migration(&mut self, reason: &str) -> Result<(), MigrationError> {
        match &self.state {
            MigrationState::MigrationInitiated {
                from_host,
                to_host,
                ..
            } => {
                self.state = MigrationState::Failed {
                    from_host: from_host.clone(),
                    to_host: to_host.clone(),
                    reason: reason.to_string(),
                };
                Ok(())
            }
            _ => Err(MigrationError::InvalidTransition),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_happy_path_should_switch_host() {
        let mut machine = HostMigrationMachine::new("host-a", Duration::from_secs(5));
        machine.initiate_migration("host-b").unwrap();
        machine.runtime_ready("ws://192.168.1.10:8080").unwrap();
        machine.broadcast_migrate().unwrap();
        machine.reconnect_completed().unwrap();
        assert_eq!(
            machine.state(),
            &MigrationState::Normal {
                host_id: "host-b".to_string()
            }
        );
    }

    #[test]
    fn migration_timeout_should_enter_failed() {
        let mut machine = HostMigrationMachine::new("host-a", Duration::from_millis(0));
        machine.initiate_migration("host-b").unwrap();
        let result = machine.runtime_ready("ws://192.168.1.10:8080");
        assert_eq!(result, Err(MigrationError::Timeout));
        assert!(matches!(
            machine.state(),
            MigrationState::Failed {
                reason,
                ..
            } if reason == "TARGET_RUNTIME_TIMEOUT"
        ));
    }

    #[test]
    fn invalid_transition_should_fail() {
        let mut machine = HostMigrationMachine::new("host-a", Duration::from_secs(5));
        let result = machine.broadcast_migrate();
        assert_eq!(result, Err(MigrationError::InvalidTransition));
    }
}
