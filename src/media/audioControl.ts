export interface RemoteAudioBinding {
  peerId: string;
  element: HTMLAudioElement;
}

export class AudioControlEngine {
  private remoteBindings = new Map<string, RemoteAudioBinding>();

  bindRemoteStream(peerId: string, stream: MediaStream): HTMLAudioElement {
    const audio = this.remoteBindings.get(peerId)?.element ?? new Audio();
    audio.autoplay = true;
    audio.srcObject = stream;
    this.remoteBindings.set(peerId, { peerId, element: audio });
    return audio;
  }

  setRemoteVolume(peerId: string, volumePercent: number): boolean {
    const binding = this.remoteBindings.get(peerId);
    if (!binding) return false;
    const clamped = Math.max(0, Math.min(200, volumePercent));
    binding.element.volume = clamped / 100;
    return true;
  }

  setLocalMute(peerId: string, muted: boolean): boolean {
    const binding = this.remoteBindings.get(peerId);
    if (!binding) return false;
    binding.element.muted = muted;
    return true;
  }

  applyServerMute(localTrack: MediaStreamTrack | null, muted: boolean): boolean {
    if (!localTrack) return false;
    localTrack.enabled = !muted;
    return true;
  }

  unbindRemoteStream(peerId: string): boolean {
    const binding = this.remoteBindings.get(peerId);
    if (!binding) return false;
    binding.element.srcObject = null;
    this.remoteBindings.delete(peerId);
    return true;
  }

  getRemoteBinding(peerId: string): RemoteAudioBinding | undefined {
    return this.remoteBindings.get(peerId);
  }
}
