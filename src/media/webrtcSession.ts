import type { WebRtcSignalMessage, WebRtcSignalType } from '../types/runtimeSession';

type DataChannelLike = {
  readyState: string;
  label: string;
  onopen: any;
  onmessage: any;
  // RTCDataChannel.send is overloaded (string | Blob | ArrayBuffer | ArrayBufferView),
  // so the alias declares it loosely.
  send: any;
  close: () => void;
};

type PeerConnectionLike = {
  createDataChannel: (label: string) => DataChannelLike;
  createOffer: (options?: RTCOfferOptions) => Promise<RTCSessionDescriptionInit>;
  createAnswer: () => Promise<RTCSessionDescriptionInit>;
  setLocalDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
  setRemoteDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  addTrack: (track: MediaStreamTrack, stream: MediaStream) => unknown;
  close: () => void;
  onicecandidate: any;
  ontrack: any;
  ondatachannel: any;
  iceConnectionState: string;
  oniceconnectionstatechange: any;
};

interface CreateWebRtcSessionOptions {
  selfId: string;
  peerId: string;
  roomId: string;
  createPeerConnection?: () => PeerConnectionLike;
  localStream?: MediaStream;
  onRemoteStream?: (stream: MediaStream) => void;
  onRemoteScreen?: (stream: MediaStream) => void;
  onDataMessage?: (data: string | ArrayBuffer) => void;
  sendSignal: (payload: {
    roomId: string;
    from: string;
    target: string;
    signalType: WebRtcSignalType;
    payload: string;
  }) => Promise<void>;
  onSignalApplied?: (signalType: WebRtcSignalType) => void;
  /** Reports RTCPeerConnection ICE connection state transitions, with the time
   * spent in the "checking" state so a relay-fallback engine can time out. */
  onIceStateChange?: (state: string, checkingElapsedMs: number) => void;
  /** How long to stay in "checking" before reporting a timed-out checking
   * event (which a relay-fallback engine treats as "switch to relay"). */
  iceCheckingTimeoutMs?: number;
}

const defaultPeerConnectionFactory = () => new RTCPeerConnection();

const serializeIceCandidate = (candidate: RTCIceCandidate | RTCIceCandidateInit) =>
  JSON.stringify('toJSON' in candidate ? candidate.toJSON() : candidate);

export const createWebRtcSession = ({
  selfId,
  peerId,
  roomId,
  createPeerConnection = defaultPeerConnectionFactory,
  localStream,
  onRemoteStream,
  onRemoteScreen,
  onDataMessage,
  sendSignal,
  onSignalApplied,
  onIceStateChange,
  iceCheckingTimeoutMs = 8_000,
}: CreateWebRtcSessionOptions) => {
  const peerConnection = createPeerConnection();
  let negotiationPrepared = false;

  // ICE connection state tracking for the relay-fallback engine. We report
  // every state transition; while in "checking" we also arm a timeout so the
  // engine can decide to switch to relay if connectivity never establishes.
  let checkingSince: number | null = null;
  let checkingTimer: ReturnType<typeof setTimeout> | null = null;

  const reportIceState = (state: string) => {
    const elapsed = checkingSince !== null ? Date.now() - checkingSince : 0;
    onIceStateChange?.(state, elapsed);
  };

  const clearCheckingTimer = () => {
    if (checkingTimer !== null) {
      clearTimeout(checkingTimer);
      checkingTimer = null;
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    const state = peerConnection.iceConnectionState;
    if (state === 'checking') {
      if (checkingSince === null) {
        checkingSince = Date.now();
      }
      if (checkingTimer === null) {
        checkingTimer = setTimeout(() => {
          checkingTimer = null;
          // If we are still negotiating after the timeout, report a timed-out
          // "checking" so the engine can fall back to relay.
          if (peerConnection.iceConnectionState === 'checking') {
            reportIceState('checking');
          }
        }, iceCheckingTimeoutMs);
      }
    } else {
      clearCheckingTimer();
      checkingSince = null;
    }
    reportIceState(state);
  };

  if (onRemoteStream || onRemoteScreen) {
    peerConnection.ontrack = (event: unknown) => {
      const e = event as { streams?: MediaStream[]; track?: { kind?: string } };
      const stream = e.streams?.[0];
      if (!stream) {
        return;
      }
      if (e.track?.kind === 'video') {
        onRemoteScreen?.(stream);
      } else {
        onRemoteStream?.(stream);
      }
    };
  }

  let chatChannel: DataChannelLike | null = null;
  const wireChatChannel = (channel: DataChannelLike) => {
    chatChannel = channel;
    channel.onmessage = (event: { data?: string | ArrayBuffer }) => {
      if (event?.data !== undefined && event?.data !== null) {
        onDataMessage?.(event.data);
      }
    };
  };
  peerConnection.ondatachannel = (event: unknown) => {
    const channel = (event as { channel?: DataChannelLike })?.channel;
    if (channel) {
      wireChatChannel(channel);
    }
  };

  const prepareNegotiation = () => {
    if (negotiationPrepared) {
      return;
    }

    negotiationPrepared = true;
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });
    }
    peerConnection.onicecandidate = (event: unknown) => {
      const candidate = typeof event === 'object' && event !== null && 'candidate' in event ? event.candidate : null;
      if (!candidate) {
        return;
      }

      void sendSignal({
        roomId,
        from: selfId,
        target: peerId,
        signalType: 'IceCandidate',
        payload: serializeIceCandidate(candidate as RTCIceCandidate | RTCIceCandidateInit),
      });
    };
  };

  const sendLocalDescription = async (signalType: 'Offer' | 'Answer', description: RTCSessionDescriptionInit) => {
    await sendSignal({
      roomId,
      from: selfId,
      target: peerId,
      signalType,
      payload: JSON.stringify(description),
    });
  };

  const startOffer = async () => {
    prepareNegotiation();
    wireChatChannel(peerConnection.createDataChannel('pivi-chat'));
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await sendLocalDescription('Offer', offer);
  };

  const handleSignal = async (message: WebRtcSignalMessage) => {
    prepareNegotiation();

    if (message.payload.signalType === 'Offer') {
      const offer = JSON.parse(message.payload.payload) as RTCSessionDescriptionInit;
      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await sendLocalDescription('Answer', answer);
      onSignalApplied?.('Offer');
      return;
    }

    if (message.payload.signalType === 'Answer') {
      const answer = JSON.parse(message.payload.payload) as RTCSessionDescriptionInit;
      await peerConnection.setRemoteDescription(answer);
      onSignalApplied?.('Answer');
      return;
    }

    if (message.payload.signalType === 'IceCandidate') {
      const candidate = JSON.parse(message.payload.payload) as RTCIceCandidateInit;
      await peerConnection.addIceCandidate(candidate);
      onSignalApplied?.('IceCandidate');
    }
  };

  const sendRaw = (data: string | ArrayBuffer): boolean => {
    if (chatChannel && chatChannel.readyState === 'open') {
      chatChannel.send(data);
      return true;
    }
    return false;
  };

  const sendChat = (frame: string): boolean => sendRaw(frame);

  const addTrack = async (track: MediaStreamTrack, stream: MediaStream) => {
    peerConnection.addTrack(track, stream);
    // renegotiate so the peer subscribes to the newly added track
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await sendLocalDescription('Offer', offer);
  };

  // ICE restart: forces a fresh gathering/connectivity pass. Used by the
  // relay-fallback flow as the single retry before declaring relay mode.
  const restartIce = async () => {
    const offer = await peerConnection.createOffer({ iceRestart: true });
    await peerConnection.setLocalDescription(offer);
    await sendLocalDescription('Offer', offer);
  };

  const close = () => {
    clearCheckingTimer();
    checkingSince = null;
    chatChannel?.close();
    peerConnection.close();
  };

  return {
    startOffer,
    handleSignal,
    sendChat,
    sendRaw,
    addTrack,
    restartIce,
    close,
  };
};
