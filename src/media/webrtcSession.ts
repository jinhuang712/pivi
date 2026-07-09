import type { WebRtcSignalMessage, WebRtcSignalType } from '../types/runtimeSession';

type DataChannelLike = {
  readyState: string;
  label: string;
  onopen: any;
  onmessage: any;
  send: (data: string) => void;
  close: () => void;
};

type PeerConnectionLike = {
  createDataChannel: (label: string) => DataChannelLike;
  createOffer: () => Promise<RTCSessionDescriptionInit>;
  createAnswer: () => Promise<RTCSessionDescriptionInit>;
  setLocalDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
  setRemoteDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  addTrack: (track: MediaStreamTrack, stream: MediaStream) => unknown;
  close: () => void;
  onicecandidate: any;
  ontrack: any;
  ondatachannel: any;
};

interface CreateWebRtcSessionOptions {
  selfId: string;
  peerId: string;
  roomId: string;
  createPeerConnection?: () => PeerConnectionLike;
  localStream?: MediaStream;
  onRemoteStream?: (stream: MediaStream) => void;
  onChatMessage?: (frame: string) => void;
  sendSignal: (payload: {
    roomId: string;
    from: string;
    target: string;
    signalType: WebRtcSignalType;
    payload: string;
  }) => Promise<void>;
  onSignalApplied?: (signalType: WebRtcSignalType) => void;
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
  onChatMessage,
  sendSignal,
  onSignalApplied,
}: CreateWebRtcSessionOptions) => {
  const peerConnection = createPeerConnection();
  let negotiationPrepared = false;

  if (onRemoteStream) {
    peerConnection.ontrack = (event: unknown) => {
      const streams = (event as { streams?: MediaStream[] })?.streams;
      if (streams && streams[0]) {
        onRemoteStream(streams[0]);
      }
    };
  }

  let chatChannel: DataChannelLike | null = null;
  const wireChatChannel = (channel: DataChannelLike) => {
    chatChannel = channel;
    channel.onmessage = (event: { data?: string }) => {
      if (event?.data) {
        onChatMessage?.(event.data);
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

  const sendChat = (frame: string): boolean => {
    if (chatChannel && chatChannel.readyState === 'open') {
      chatChannel.send(frame);
      return true;
    }
    return false;
  };

  const close = () => {
    chatChannel?.close();
    peerConnection.close();
  };

  return {
    startOffer,
    handleSignal,
    sendChat,
    close,
  };
};
