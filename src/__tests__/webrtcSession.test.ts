import { describe, expect, it, vi } from 'vitest';
import { createWebRtcSession } from '../media/webrtcSession';
import type { WebRtcSignalMessage } from '../types/runtimeSession';

const createFakePeerConnection = () => {
  const fake = {
    createDataChannel: vi.fn(() => ({
      readyState: 'open',
      label: 'pivi-chat',
      onopen: null,
      onmessage: null,
      send: vi.fn(),
      close: vi.fn(),
    })),
    createOffer: vi.fn(async (): Promise<RTCSessionDescriptionInit> => ({ type: 'offer', sdp: 'offer-sdp' })),
    createAnswer: vi.fn(async (): Promise<RTCSessionDescriptionInit> => ({ type: 'answer', sdp: 'answer-sdp' })),
    setLocalDescription: vi.fn(async () => {}),
    setRemoteDescription: vi.fn(async () => {}),
    addIceCandidate: vi.fn(async () => {}),
    addTrack: vi.fn(),
    close: vi.fn(),
    onicecandidate: null as ((event: unknown) => void) | null,
    ontrack: null as ((event: unknown) => void) | null,
    ondatachannel: null as ((event: unknown) => void) | null,
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

  it('adds local audio tracks to the peer connection and surfaces remote streams', async () => {
    const audioTrack = { kind: 'audio', id: 't1' } as unknown as MediaStreamTrack;
    const localStream = { getTracks: () => [audioTrack] } as unknown as MediaStream;
    const pc: any = {
      createDataChannel: vi.fn(() => ({ readyState: 'open', label: 'pivi-chat', onopen: null, onmessage: null, send: vi.fn(), close: vi.fn() })),
      createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' })),
      createAnswer: vi.fn(async () => ({ type: 'answer', sdp: 'answer-sdp' })),
      setLocalDescription: vi.fn(async () => {}),
      setRemoteDescription: vi.fn(async () => {}),
      addIceCandidate: vi.fn(async () => {}),
      addTrack: vi.fn(),
      close: vi.fn(),
      onicecandidate: null,
      ontrack: null,
      ondatachannel: null,
    };
    const onRemoteStream = vi.fn();
    const session = createWebRtcSession({
      selfId: 'host-1',
      peerId: 'user-2',
      roomId: 'room-a',
      createPeerConnection: () => pc,
      localStream,
      onRemoteStream,
      sendSignal: vi.fn(async () => {}),
    });

    await session.startOffer();

    expect(pc.addTrack).toHaveBeenCalledWith(audioTrack, localStream);

    const remoteStream = { id: 'remote' } as unknown as MediaStream;
    pc.ontrack({ streams: [remoteStream] });
    expect(onRemoteStream).toHaveBeenCalledWith(remoteStream);
  });

  it('sends and receives chat frames over the data channel', async () => {
    const chatChannel: any = {
      readyState: 'open',
      onopen: null,
      onmessage: null,
      send: vi.fn(),
      close: vi.fn(),
      label: 'pivi-chat',
    };
    const pc = createFakePeerConnection();
    (pc as any).createDataChannel = vi.fn(() => chatChannel);

    const onChatMessage = vi.fn();
    const session = createWebRtcSession({
      selfId: 'host-1',
      peerId: 'user-2',
      roomId: 'room-a',
      createPeerConnection: () => pc,
      onChatMessage,
      sendSignal: vi.fn(async () => {}),
    });

    await session.startOffer();
    expect((pc as any).createDataChannel).toHaveBeenCalled();

    // incoming frame from peer
    chatChannel.onmessage({ data: 'incoming-frame' });
    expect(onChatMessage).toHaveBeenCalledWith('incoming-frame');

    // outgoing frame
    expect(session.sendChat('outgoing-frame')).toBe(true);
    expect(chatChannel.send).toHaveBeenCalledWith('outgoing-frame');
  });

  it('renegotiates when a track is added mid-session', async () => {
    const pc = createFakePeerConnection();
    const sendSignal = vi.fn(async () => {});
    const session = createWebRtcSession({
      selfId: 'h',
      peerId: 'u',
      roomId: 'r',
      createPeerConnection: () => pc,
      sendSignal,
    });
    await session.startOffer();
    sendSignal.mockClear();
    (pc.createOffer as ReturnType<typeof vi.fn>).mockClear();

    const videoTrack = { kind: 'video' } as unknown as MediaStreamTrack;
    const screenStream = { id: 'screen' } as unknown as MediaStream;
    await session.addTrack(videoTrack, screenStream);

    expect((pc as { addTrack: ReturnType<typeof vi.fn> }).addTrack).toHaveBeenCalledWith(
      videoTrack,
      screenStream,
    );
    expect(pc.createOffer).toHaveBeenCalled();
    expect(sendSignal).toHaveBeenCalled();
    const calls = sendSignal.mock.calls as unknown as { signalType: string }[][];
    const last = calls[calls.length - 1];
    expect(last?.[0]?.signalType).toBe('Offer');
  });

  it('routes video tracks to onRemoteScreen and audio to onRemoteStream', async () => {
    const pc = createFakePeerConnection();
    const onRemoteStream = vi.fn();
    const onRemoteScreen = vi.fn();
    const session = createWebRtcSession({
      selfId: 'h',
      peerId: 'u',
      roomId: 'r',
      createPeerConnection: () => pc,
      onRemoteStream,
      onRemoteScreen,
      sendSignal: vi.fn(async () => {}),
    });
    await session.startOffer();

    const audioStream = { id: 'a' } as unknown as MediaStream;
    const screenStream = { id: 'v' } as unknown as MediaStream;
    (pc as { ontrack: (e: unknown) => void }).ontrack({ streams: [audioStream], track: { kind: 'audio' } });
    (pc as { ontrack: (e: unknown) => void }).ontrack({ streams: [screenStream], track: { kind: 'video' } });

    expect(onRemoteStream).toHaveBeenCalledWith(audioStream);
    expect(onRemoteScreen).toHaveBeenCalledWith(screenStream);
  });
});
