export type ShareQualityPreset = '720p' | '1080p' | '原画';

export interface ScreenShareStartOptions {
  quality: ShareQualityPreset;
  includeSystemAudio?: boolean;
}

export interface ScreenShareSession {
  stream: MediaStream;
  videoTrack: MediaStreamTrack;
}

export function buildScreenConstraints(options: ScreenShareStartOptions): MediaStreamConstraints {
  const qualityMap: Record<ShareQualityPreset, { width?: number; height?: number; frameRate?: number }> = {
    '720p': { width: 1280, height: 720, frameRate: 30 },
    '1080p': { width: 1920, height: 1080, frameRate: 60 },
    '原画': {},
  };

  const quality = qualityMap[options.quality];
  return {
    video: {
      ...(quality.width ? { width: { ideal: quality.width } } : {}),
      ...(quality.height ? { height: { ideal: quality.height } } : {}),
      ...(quality.frameRate ? { frameRate: { ideal: quality.frameRate } } : {}),
    },
    audio: options.includeSystemAudio ?? false,
  };
}

export async function startScreenShare(options: ScreenShareStartOptions): Promise<ScreenShareSession> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error('当前环境不支持屏幕共享');
  }
  const stream = await navigator.mediaDevices.getDisplayMedia(buildScreenConstraints(options));
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    throw new Error('未获取到屏幕视频轨道');
  }
  return { stream, videoTrack };
}

export async function publishScreenTrack(
  peerConnections: RTCPeerConnection[],
  videoTrack: MediaStreamTrack,
): Promise<{ replaced: number; added: number }> {
  let replaced = 0;
  let added = 0;
  for (const pc of peerConnections) {
    const existing = pc.getSenders().find((sender) => sender.track?.kind === 'video');
    if (existing) {
      await existing.replaceTrack(videoTrack);
      replaced += 1;
    } else {
      pc.addTrack(videoTrack);
      added += 1;
    }
  }
  return { replaced, added };
}

export function stopScreenShare(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

export function bindScreenShareEnded(session: ScreenShareSession, onEnded: () => void): void {
  session.videoTrack.onended = onEnded;
}
