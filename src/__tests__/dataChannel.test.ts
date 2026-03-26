import { describe, expect, it, vi } from 'vitest';
import { createReliableDataChannel } from '../media/dataChannel';

describe('createReliableDataChannel', () => {
  it('should create ordered reliable channel and send text when open', () => {
    const send = vi.fn();
    const close = vi.fn();
    const mockChannel = {
      readyState: 'open',
      send,
      close,
    } as unknown as RTCDataChannel;

    const createDataChannel = vi.fn().mockReturnValue(mockChannel);
    const pc = { createDataChannel } as unknown as RTCPeerConnection;
    const channel = createReliableDataChannel(pc);

    expect(createDataChannel).toHaveBeenCalledWith('chat-reliable', {
      ordered: true,
      protocol: 'json+binary',
    });
    expect(channel.sendText('hello')).toBe(true);
    expect(send).toHaveBeenCalledWith('hello');
  });

  it('should return false when channel is not open', () => {
    const send = vi.fn();
    const close = vi.fn();
    const mockChannel = {
      readyState: 'connecting',
      send,
      close,
    } as unknown as RTCDataChannel;

    const pc = {
      createDataChannel: vi.fn().mockReturnValue(mockChannel),
    } as unknown as RTCPeerConnection;

    const channel = createReliableDataChannel(pc);
    expect(channel.sendText('hello')).toBe(false);
    expect(channel.sendBinary(new ArrayBuffer(16))).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('should close channel when close is called', () => {
    const close = vi.fn();
    const mockChannel = {
      readyState: 'open',
      send: vi.fn(),
      close,
    } as unknown as RTCDataChannel;

    const pc = {
      createDataChannel: vi.fn().mockReturnValue(mockChannel),
    } as unknown as RTCPeerConnection;

    const channel = createReliableDataChannel(pc);
    channel.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
