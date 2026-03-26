import { describe, expect, it, vi } from 'vitest';
import {
  bindScreenShareEnded,
  buildScreenConstraints,
  publishScreenTrack,
  startScreenShare,
  stopScreenShare,
} from '../media/screenShare';

describe('screenShare', () => {
  it('should build constraints for 1080p', () => {
    const constraints = buildScreenConstraints({ quality: '1080p', includeSystemAudio: true });
    expect(constraints.audio).toBe(true);
    expect(constraints.video).toMatchObject({
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60 },
    });
  });

  it('should start screen share using getDisplayMedia', async () => {
    const videoTrack = { kind: 'video' } as MediaStreamTrack;
    const stream = {
      getVideoTracks: () => [videoTrack],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: vi.fn().mockResolvedValue(stream),
      },
    });

    const session = await startScreenShare({ quality: '720p', includeSystemAudio: false });
    expect(session.videoTrack).toBe(videoTrack);
    expect(session.stream).toBe(stream);
  });

  it('should replace existing video sender when publishing', async () => {
    const replaceTrack = vi.fn().mockResolvedValue(undefined);
    const pc = {
      getSenders: () => [{ track: { kind: 'video' }, replaceTrack }],
      addTrack: vi.fn(),
    } as unknown as RTCPeerConnection;
    const track = { kind: 'video' } as MediaStreamTrack;
    const result = await publishScreenTrack([pc], track);
    expect(replaceTrack).toHaveBeenCalledWith(track);
    expect(result).toEqual({ replaced: 1, added: 0 });
  });

  it('should stop all tracks when stopping share', () => {
    const stop1 = vi.fn();
    const stop2 = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stop1 }, { stop: stop2 }],
    } as unknown as MediaStream;
    stopScreenShare(stream);
    expect(stop1).toHaveBeenCalledTimes(1);
    expect(stop2).toHaveBeenCalledTimes(1);
  });

  it('should bind onended callback to video track', () => {
    const videoTrack = { onended: null as (() => void) | null } as MediaStreamTrack;
    const session = {
      stream: {} as MediaStream,
      videoTrack,
    };
    const onEnded = vi.fn();
    bindScreenShareEnded(session, onEnded);
    if (typeof videoTrack.onended === 'function') {
      videoTrack.onended(new Event('ended'));
    }
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
});
