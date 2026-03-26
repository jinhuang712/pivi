export type IceConnectionStateLike =
  | 'new'
  | 'checking'
  | 'connected'
  | 'completed'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface RelayFallbackInput {
  peerId: string;
  iceState: IceConnectionStateLike;
  checkingElapsedMs: number;
}

export type RelayDecision = 'stay_p2p' | 'switch_to_relay' | 'close_session';

export class RelayFallbackPolicy {
  private readonly checkingTimeoutMs: number;

  constructor(checkingTimeoutMs: number = 8_000) {
    this.checkingTimeoutMs = checkingTimeoutMs;
  }

  decide(input: RelayFallbackInput): RelayDecision {
    if (input.iceState === 'failed') {
      return 'switch_to_relay';
    }

    if (input.iceState === 'closed') {
      return 'close_session';
    }

    if (input.iceState === 'checking' && input.checkingElapsedMs >= this.checkingTimeoutMs) {
      return 'switch_to_relay';
    }

    return 'stay_p2p';
  }
}

export class RelayFallbackEngine {
  private policy: RelayFallbackPolicy;
  private relayPeers = new Set<string>();

  constructor(policy?: RelayFallbackPolicy) {
    this.policy = policy ?? new RelayFallbackPolicy();
  }

  processIceState(input: RelayFallbackInput): RelayDecision {
    const decision = this.policy.decide(input);
    if (decision === 'switch_to_relay') {
      this.relayPeers.add(input.peerId);
    }
    if (decision === 'close_session') {
      this.relayPeers.delete(input.peerId);
    }
    return decision;
  }

  isRelayPeer(peerId: string): boolean {
    return this.relayPeers.has(peerId);
  }

  clearPeer(peerId: string): void {
    this.relayPeers.delete(peerId);
  }
}
