import type { WebRtcSignalMessage, WebRtcSignalType } from '../types/runtimeSession';

type PeerConnectionLike = {
  createDataChannel: (label: string) => unknown;
  createOffer: () => Promise<RTCSessionDescriptionInit>;
  createAnswer: () => Promise<RTCSessionDescriptionInit>;
  setLocalDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
  setRemoteDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  close: () => void;
  onicecandidate: any;
};

interface CreateWebRtcSessionOptions {
  selfId: string;
  peerId: string;
  roomId: string;
  createPeerConnection?: () => PeerConnectionLike;
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
  sendSignal,
  onSignalApplied,
}: CreateWebRtcSessionOptions) => {
  const peerConnection = createPeerConnection();
  let negotiationPrepared = false;

  const prepareNegotiation = () => {
    if (negotiationPrepared) {
      return;
    }

    negotiationPrepared = true;
    peerConnection.createDataChannel(`pivi-control-${peerId}`);
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

  const close = () => {
    peerConnection.close();
  };

  return {
    startOffer,
    handleSignal,
    close,
  };
};
