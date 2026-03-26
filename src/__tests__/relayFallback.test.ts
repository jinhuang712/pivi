import { describe, expect, it } from 'vitest';
import { RelayFallbackEngine, RelayFallbackPolicy } from '../media/relayFallback';

describe('RelayFallbackPolicy', () => {
  it('should switch to relay when ICE state is failed', () => {
    const policy = new RelayFallbackPolicy();
    const decision = policy.decide({
      peerId: 'peer-a',
      iceState: 'failed',
      checkingElapsedMs: 2000,
    });
    expect(decision).toBe('switch_to_relay');
  });

  it('should switch to relay when checking timeout is exceeded', () => {
    const policy = new RelayFallbackPolicy(3000);
    const decision = policy.decide({
      peerId: 'peer-a',
      iceState: 'checking',
      checkingElapsedMs: 3500,
    });
    expect(decision).toBe('switch_to_relay');
  });
});

describe('RelayFallbackEngine', () => {
  it('should mark peer as relay when fallback is triggered', () => {
    const engine = new RelayFallbackEngine(new RelayFallbackPolicy(3000));
    const decision = engine.processIceState({
      peerId: 'peer-a',
      iceState: 'checking',
      checkingElapsedMs: 3500,
    });
    expect(decision).toBe('switch_to_relay');
    expect(engine.isRelayPeer('peer-a')).toBe(true);
  });

  it('should clear relay peer when session is closed', () => {
    const engine = new RelayFallbackEngine();
    engine.processIceState({
      peerId: 'peer-a',
      iceState: 'failed',
      checkingElapsedMs: 1000,
    });
    const decision = engine.processIceState({
      peerId: 'peer-a',
      iceState: 'closed',
      checkingElapsedMs: 1000,
    });
    expect(decision).toBe('close_session');
    expect(engine.isRelayPeer('peer-a')).toBe(false);
  });
});
