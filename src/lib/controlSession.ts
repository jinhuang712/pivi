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

export interface CreateWebSocketControlSessionOptions {
  url: string;
  roomId: string;
  memberId: string;
  initialSequence: number;
  onMessage: (message: ControlRuntimeMessage) => void;
  onError?: (error: string) => void;
  /** Reconnect backoff when the socket closes unexpectedly. */
  reconnectMs?: number;
}

/**
 * Persistent WebSocket event channel (C1) for the joiner path. Opens one socket
 * to the host's control plane, sends a Subscribe, and dispatches every pushed
 * RoomRuntimeEvent — replacing the 1s TCP polling. Reconnects automatically on
 * unexpected close; `stop()` tears it down without reconnecting.
 */
export const createWebSocketControlSession = ({
  url,
  roomId,
  memberId,
  initialSequence,
  onMessage,
  onError,
  reconnectMs = 1_000,
}: CreateWebSocketControlSessionOptions) => {
  let lastSequence = initialSequence;
  let socket: WebSocket | null = null;
  let active = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'Subscribe', roomId, memberId, lastSequence }));
    };
    ws.onmessage = (event: MessageEvent) => {
      try {
        const runtimeEvent = JSON.parse(event.data as string) as RoomRuntimeEvent;
        if (runtimeEvent.sequence > lastSequence) {
          lastSequence = runtimeEvent.sequence;
        }
        onMessage(runtimeEvent.message);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onerror = () => {
      onError?.('控制面 WebSocket 连接出错');
    };
    ws.onclose = () => {
      if (socket === ws) {
        socket = null;
      }
      if (active) {
        reconnectTimer = setTimeout(open, reconnectMs);
      }
    };
  };

  const start = () => {
    if (active) {
      return;
    }
    active = true;
    open();
  };

  const stop = () => {
    active = false;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    socket?.close();
    socket = null;
  };

  return {
    start,
    stop,
    getLastSequence: () => lastSequence,
  };
};;
