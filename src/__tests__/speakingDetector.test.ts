import { describe, expect, it } from 'vitest';
import { SpeakingDetector } from '../media/speakingDetector';

describe('SpeakingDetector', () => {
  it('turns on above the on-threshold and off below the off-threshold', () => {
    const d = new SpeakingDetector(0.05, 0.02);
    expect(d.processLevel(0.01)).toBe(false);
    expect(d.processLevel(0.06)).toBe(true);
    expect(d.processLevel(0.01)).toBe(false);
  });

  it('keeps speaking through the hysteresis band', () => {
    const d = new SpeakingDetector(0.05, 0.02);
    expect(d.processLevel(0.08)).toBe(true);
    expect(d.processLevel(0.03)).toBe(true); // between thresholds -> still on
    expect(d.processLevel(0.01)).toBe(false);
  });

  it('does not trigger inside the hysteresis band when not speaking', () => {
    const d = new SpeakingDetector(0.05, 0.02);
    expect(d.processLevel(0.03)).toBe(false); // between thresholds -> stays off
  });

  it('reset clears the speaking state', () => {
    const d = new SpeakingDetector(0.05, 0.02);
    d.processLevel(0.1);
    expect(d.isSpeaking).toBe(true);
    d.reset();
    expect(d.isSpeaking).toBe(false);
  });
});
