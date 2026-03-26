import { describe, expect, it } from 'vitest';
import { AudioControlEngine } from '../media/audioControl';

describe('AudioControlEngine', () => {
  it('should bind and unbind remote media stream', () => {
    const engine = new AudioControlEngine();
    const stream = { id: 'stream-a' } as unknown as MediaStream;
    const audio = engine.bindRemoteStream('peer-a', stream);
    expect(audio.srcObject).toBe(stream);
    expect(engine.getRemoteBinding('peer-a')).toBeDefined();
    expect(engine.unbindRemoteStream('peer-a')).toBe(true);
    expect(engine.getRemoteBinding('peer-a')).toBeUndefined();
  });

  it('should apply local volume and mute for remote peer', () => {
    const engine = new AudioControlEngine();
    const stream = { id: 'stream-a' } as unknown as MediaStream;
    engine.bindRemoteStream('peer-a', stream);
    expect(engine.setRemoteVolume('peer-a', 35)).toBe(true);
    expect(engine.getRemoteBinding('peer-a')?.element.volume).toBeCloseTo(0.35);
    expect(engine.setLocalMute('peer-a', true)).toBe(true);
    expect(engine.getRemoteBinding('peer-a')?.element.muted).toBe(true);
  });

  it('should force local track disabled when server mute is applied', () => {
    const engine = new AudioControlEngine();
    const track = { enabled: true } as MediaStreamTrack;
    expect(engine.applyServerMute(track, true)).toBe(true);
    expect(track.enabled).toBe(false);
    expect(engine.applyServerMute(track, false)).toBe(true);
    expect(track.enabled).toBe(true);
  });
});
