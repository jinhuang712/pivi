export interface ReliableChannelConfig {
  label?: string;
  ordered?: boolean;
  protocol?: string;
}

export interface ReliableDataChannel {
  sendText: (payload: string) => boolean;
  sendBinary: (payload: ArrayBuffer) => boolean;
  close: () => void;
  raw: RTCDataChannel;
}

export function createReliableDataChannel(
  peerConnection: RTCPeerConnection,
  config?: ReliableChannelConfig,
): ReliableDataChannel {
  const channel = peerConnection.createDataChannel(config?.label ?? 'chat-reliable', {
    ordered: config?.ordered ?? true,
    protocol: config?.protocol ?? 'json+binary',
  });

  return {
    raw: channel,
    sendText: (payload: string) => {
      if (channel.readyState !== 'open') return false;
      channel.send(payload);
      return true;
    },
    sendBinary: (payload: ArrayBuffer) => {
      if (channel.readyState !== 'open') return false;
      channel.send(payload);
      return true;
    },
    close: () => {
      if (channel.readyState === 'closed') return;
      channel.close();
    },
  };
}
