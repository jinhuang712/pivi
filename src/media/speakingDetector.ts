/**
 * Hysteresis-based speaking detector. Feed it a normalized audio level
 * (0..1, e.g. RMS from an AnalyserNode); it returns whether the source is
 * considered speaking, with separate on/off thresholds to avoid flicker.
 */
export class SpeakingDetector {
  private speaking = false;

  constructor(
    private readonly onThreshold = 0.05,
    private readonly offThreshold = 0.02,
  ) {}

  processLevel(level: number): boolean {
    if (!this.speaking && level >= this.onThreshold) {
      this.speaking = true;
    } else if (this.speaking && level < this.offThreshold) {
      this.speaking = false;
    }
    return this.speaking;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  reset(): void {
    this.speaking = false;
  }
}

/**
 * Samples a MediaStream's audio level via the Web Audio API and reports
 * speaking-state changes through the detector. Non-fatal if the Web Audio
 * APIs are unavailable (some hosts / permissions).
 */
export class SpeakingMonitor {
  private detector = new SpeakingDetector();
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private lastSpoken = false;

  constructor(private readonly onChange: (speaking: boolean) => void) {}

  start(stream: MediaStream): boolean {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      return false;
    }
    try {
      this.context = new Ctx();
      const source = this.context.createMediaStreamSource(stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);
      const buffer = new Uint8Array(this.analyser.frequencyBinCount);
      const tick = () => {
        if (!this.analyser) {
          return;
        }
        this.analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const v = (buffer[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buffer.length);
        const spoken = this.detector.processLevel(rms);
        if (spoken !== this.lastSpoken) {
          this.lastSpoken = spoken;
          this.onChange(spoken);
        }
        this.rafId = window.requestAnimationFrame(tick);
      };
      this.rafId = window.requestAnimationFrame(tick);
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  stop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.analyser = null;
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
    this.detector.reset();
    this.lastSpoken = false;
  }
}
