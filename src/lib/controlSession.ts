import type { ControlRuntimeMessage, RoomRuntimeEvent } from '../types/runtimeSession';

interface CreateControlSessionOptions {
  initialSequence: number;
  intervalMs?: number;
  getEvents: (payload: { lastSequence: number }) => Promise<RoomRuntimeEvent[] | null>;
  onMessage: (message: ControlRuntimeMessage) => void;
  onError?: (error: unknown) => void;
}

export const createControlSession = ({
  initialSequence,
  intervalMs = 1000,
  getEvents,
  onMessage,
  onError,
}: CreateControlSessionOptions) => {
  let lastSequence = initialSequence;
  let intervalId: number | null = null;
  let active = false;

  const syncNow = async () => {
    try {
      const events = (await getEvents({ lastSequence })) ?? [];
      if (events.length === 0) {
        return;
      }

      for (const event of events) {
        onMessage(event.message);
        lastSequence = event.sequence;
      }
    } catch (error) {
      onError?.(error);
    }
  };

  const start = () => {
    if (active) {
      return;
    }

    active = true;
    void syncNow();
    intervalId = window.setInterval(() => {
      void syncNow();
    }, intervalMs);
  };

  const stop = () => {
    active = false;
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };

  return {
    start,
    stop,
    syncNow,
    getLastSequence: () => lastSequence,
  };
};
