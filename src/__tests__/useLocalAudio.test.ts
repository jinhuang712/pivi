import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalAudio } from '../media/useLocalAudio';

describe('useLocalAudio', () => {
  let stopTrack: ReturnType<typeof vi.fn>;
  let originalMediaDevices: PropertyDescriptor | undefined;

  beforeEach(() => {
    stopTrack = vi.fn();
    const track = { enabled: true, stop: stopTrack } as unknown as MediaStreamTrack;
    const fakeStream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
    });
  });

  afterEach(() => {
    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    } else {
      // @ts-expect-error restore by deleting the test-installed prop
      delete navigator.mediaDevices;
    }
  });

  it('acquires the mic stream when active and exposes the audio track', async () => {
    const { result } = renderHook(() => useLocalAudio(true));
    // wait for the async getUserMedia to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.stream).not.toBeNull();
    expect(result.current.isMuted).toBe(false);
  });

  it('toggling mute disables the local audio track', async () => {
    const { result } = renderHook(() => useLocalAudio(true));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const track = result.current.stream!.getAudioTracks()[0];
    expect(track.enabled).toBe(true);

    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.isMuted).toBe(true);
    expect(track.enabled).toBe(false);

    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.isMuted).toBe(false);
    expect(track.enabled).toBe(true);
  });

  it('stops the track and clears the stream when deactivated', async () => {
    const { result, rerender } = renderHook(({ active }) => useLocalAudio(active), {
      initialProps: { active: true },
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.stream).not.toBeNull();

    rerender({ active: false });
    expect(result.current.stream).toBeNull();
    expect(stopTrack).toHaveBeenCalled();
  });
});
