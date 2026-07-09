import { describe, expect, it, vi } from 'vitest';
import { createWebRtcSession } from '../media/webrtcSession';
import type { WebRtcSignalMessage } from '../types/runtimeSession';

const createFakePeerConnection = () => {
  const fake = {
    createDataChannel: vi.fn(),
    createOffer: vi.fn(async (): Promise<RTCSessionDescriptionInit> => ({ type: 'offer', sdp: 'offer-sdp' })),
    createAnswer: vi.fn(async (): Promise<RTCSessionDescriptionInit> => ({ type: 'answer', sdp: 'answer-sdp' })),
    setLocalDescription: vi.fn(async () => {}),
    setRemoteDescription: vi.fn(async () => {}),
    addIceCandidate: vi.fn(async () => {}),
    close: vi.fn(),
    onicecandidate: null as ((event: unknown) => void) | null,
  };

  return fake;
};

describe('createWebRtcSession', () => {
  it('creates and sends an offer through the control signal sender', async () => {
    const peerConnection = createFakePeerConnection();
    const sendSignal = vi.fn(async () => {});
    const session = createWebRtcSession({
      selfId: 'host-1',
      peerId: 'user-2',
      roomId: 'room-a',
      createPeerConnection: () => peerConnection,
      sendSignal,
    });

    await session.startOffer();

    expect(peerConnection.createOffer).toHaveBeenCalledTimes(1);
    expect(sendSignal).toHaveBeenCalledWith({
      roomId: 'room-a',
      from: 'host-1',
      target: 'user-2',
      signalType: 'Offer',
      payload: JSON.stringify({ type: 'offer', sdp: 'offer-sdp' }),
    });
  });

  it('answers an incoming offer and applies incoming ice candidates', async () => {
    const peerConnection = createFakePeerConnection();
    const sendSignal = vi.fn(async () => {});
    const session = createWebRtcSession({
      selfId: 'user-2',
      peerId: 'host-1',
      roomId: 'room-a',
      createPeerConnection: () => peerConnection,
      sendSignal,
    });
    const offerMessage: WebRtcSignalMessage = {
      type: 'WebRtcSignal',
      payload: {
        from: 'host-1',
        target: 'user-2',
        signalType: 'Offer',
        payload: JSON.stringify({ type: 'offer', sdp: 'offer-sdp' }),
      },
    };
    const candidateMessage: WebRtcSignalMessage = {
      type: 'WebRtcSignal',
      payload: {
        from: 'host-1',
        target: 'user-2',
        signalType: 'IceCandidate',
        payload: JSON.stringify({ candidate: 'abc', sdpMid: '0' }),
      },
    };

    await session.handleSignal(offerMessage);
    await session.handleSignal(candidateMessage);

    expect(peerConnection.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'offer-sdp' });
    expect(peerConnection.createAnswer).toHaveBeenCalledTimes(1);
    expect(sendSignal).toHaveBeenCalledWith({
      roomId: 'room-a',
      from: 'user-2',
      target: 'host-1',
      signalType: 'Answer',
      payload: JSON.stringify({ type: 'answer', sdp: 'answer-sdp' }),
    });
    expect(peerConnection.addIceCandidate).toHaveBeenCalledWith({ candidate: 'abc', sdpMid: '0' });
  });
});
