import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebSocketControlSession } from '../lib/controlSession';
import type { ControlRuntimeMessage } from '../types/runtimeSession';

interface FakeWebSocket {
  url: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  sent: string[];
  close: () => void;
}

describe('createWebSocketControlSession', () => {
  let instance: FakeWebSocket | null = null;
  let constructed = 0;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    vi.useFakeTimers();
    instance = null;
    constructed = 0;
    vi.stubGlobal(
      'WebSocket',
      class FakeWS {
        url: string;
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onclose: (() => void) | null = null;
        onerror: (() => void) | null = null;
        sent: string[] = [];
        constructor(url: string) {
          this.url = url;
          constructed += 1;
          instance = this as unknown as FakeWebSocket;
          // fire onopen on the next tick, like a real socket
          setTimeout(() => this.onopen?.(), 0);
        }
        send(data: string) {
          this.sent.push(data);
        }
        close() {
          this.onclose?.();
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  const waitForOpen = async () => {
    await vi.advanceTimersByTimeAsync(0);
  };

  it('subscribes on open with the initial sequence', async () => {
    const session = createWebSocketControlSession({
      url: 'ws://127.0.0.1:7788/',
      roomId: 'room-a',
      memberId: 'user-2',
      initialSequence: 3,
      onMessage: vi.fn(),
    });
    session.start();
    await waitForOpen();

    expect(instance).not.toBeNull();
    const subscribe = JSON.parse(instance!.sent[0]);
    expect(subscribe).toEqual({ type: 'Subscribe', roomId: 'room-a', memberId: 'user-2', lastSequence: 3 });

    session.stop();
  });

  it('dispatches pushed events and tracks the sequence', async () => {
    const applied: ControlRuntimeMessage[] = [];
    const session = createWebSocketControlSession({
      url: 'ws://x/',
      roomId: 'r',
      memberId: 'u',
      initialSequence: 5,
      onMessage: (message) => applied.push(message),
    });
    session.start();
    await waitForOpen();

    const event = {
      sequence: 7,
      message: { type: 'RoomBroadcast', payload: { type: 'MemberLeft', payload: { memberId: 'x' } } },
    };
    instance!.onmessage!({ data: JSON.stringify(event) });

    expect(applied).toHaveLength(1);
    expect(applied[0]).toEqual(event.message);
    expect(session.getLastSequence()).toBe(7);

    session.stop();
  });

  it('reconnects after an unexpected close', async () => {
    const session = createWebSocketControlSession({
      url: 'ws://x/',
      roomId: 'r',
      memberId: 'u',
      initialSequence: 1,
      reconnectMs: 1000,
      onMessage: vi.fn(),
    });
    session.start();
    await waitForOpen();
    expect(constructed).toBe(1);

    const first = instance!;
    first.onclose?.();

    await vi.advanceTimersByTimeAsync(1000);
    expect(constructed).toBe(2);
    expect(instance).not.toBe(first);

    session.stop();
  });

  it('stop prevents reconnection', async () => {
    const session = createWebSocketControlSession({
      url: 'ws://x/',
      roomId: 'r',
      memberId: 'u',
      initialSequence: 1,
      reconnectMs: 1000,
      onMessage: vi.fn(),
    });
    session.start();
    await waitForOpen();
    expect(constructed).toBe(1);

    session.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(constructed).toBe(1);
  });
});
