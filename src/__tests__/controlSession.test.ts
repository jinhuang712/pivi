import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createControlSession } from '../lib/controlSession';
import type { ControlRuntimeMessage, RoomRuntimeEvent } from '../types/runtimeSession';

describe('createControlSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('applies incremental events and tracks last sequence', async () => {
    const appliedMessages: ControlRuntimeMessage[] = [];
    const getEvents = vi
      .fn<({ lastSequence }: { lastSequence: number }) => Promise<RoomRuntimeEvent[]>>()
      .mockResolvedValueOnce([
        {
          sequence: 2,
          message: {
            type: 'RoomBroadcast',
            payload: {
              type: 'MemberJoined',
              payload: {
                member: {
                  memberId: 'user-2',
                  displayName: 'Player B',
                  role: 'Member',
                  connState: 'Connected',
                  serverMuted: false,
                },
              },
            },
          },
        },
      ])
      .mockResolvedValue([]);

    const session = createControlSession({
      initialSequence: 1,
      getEvents,
      onMessage: (message) => {
        appliedMessages.push(message);
      },
    });

    await session.syncNow();

    expect(appliedMessages).toHaveLength(1);
    expect(session.getLastSequence()).toBe(2);
  });

  it('starts interval sync and stops cleanly', async () => {
    const getEvents = vi
      .fn<({ lastSequence }: { lastSequence: number }) => Promise<RoomRuntimeEvent[]>>()
      .mockResolvedValue([]);
    const session = createControlSession({
      initialSequence: 0,
      getEvents,
      onMessage: vi.fn(),
    });

    session.start();
    await vi.advanceTimersByTimeAsync(2200);
    session.stop();
    const callsBeforeStop = getEvents.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2200);

    expect(callsBeforeStop).toBeGreaterThan(0);
    expect(getEvents.mock.calls.length).toBe(callsBeforeStop);
  });
});
