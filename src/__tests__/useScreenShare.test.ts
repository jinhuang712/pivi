import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreenShare } from '../media/useScreenShare';

describe('useScreenShare', () => {
  let stopTrack: ReturnType<typeof vi.fn>;
  let original: PropertyDescriptor | undefined;

  beforeEach(() => {
    stopTrack = vi.fn();
    const track = { kind: 'video', stop: stopTrack, onended: null } as unknown as MediaStreamTrack;
    const stream = {
      getVideoTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn().mockResolvedValue(stream) },
    });
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(navigator, 'mediaDevices', original);
    }
  });

  it('starts sharing and exposes the screen stream', async () => {
    const { result } = renderHook(() => useScreenShare());
    let acquired: MediaStream | null = null;
    await act(async () => {
      acquired = await result.current.start({ quality: '1080p' });
    });
    expect(acquired).not.toBeNull();
    expect(result.current.isSharing).toBe(true);
    expect(result.current.stream).not.toBeNull();
  });

  it('stop ends the track and clears the stream', async () => {
    const { result } = renderHook(() => useScreenShare());
    await act(async () => {
      await result.current.start({ quality: '1080p' });
    });
    act(() => result.current.stop());
    expect(result.current.isSharing).toBe(false);
    expect(result.current.stream).toBeNull();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('returns null (no crash) when getDisplayMedia is unavailable', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: undefined },
    });
    const { result } = renderHook(() => useScreenShare());
    let acquired: MediaStream | null = 'sentinel' as unknown as MediaStream;
    await act(async () => {
      acquired = await result.current.start({ quality: '1080p' });
    });
    expect(acquired).toBeNull();
    expect(result.current.isSharing).toBe(false);
  });
});
