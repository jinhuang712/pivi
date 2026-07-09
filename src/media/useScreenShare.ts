import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bindScreenShareEnded,
  startScreenShare,
  stopScreenShare,
  type ScreenShareSession,
  type ShareQualityPreset,
} from './screenShare';

export interface UseScreenShare {
  isSharing: boolean;
  stream: MediaStream | null;
  start: (opts: { quality: ShareQualityPreset; includeSystemAudio?: boolean }) => Promise<MediaStream | null>;
  stop: () => void;
}

/**
 * Owns the getDisplayMedia lifecycle for screen sharing. `start` acquires the
 * screen stream (non-fatal if unavailable); `stop` ends the tracks. The hook
 * also reflects the user stopping via the browser's native share bar.
 */
export const useScreenShare = (): UseScreenShare => {
  const [isSharing, setIsSharing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const sessionRef = useRef<ScreenShareSession | null>(null);

  const stop = useCallback(() => {
    if (sessionRef.current) {
      stopScreenShare(sessionRef.current.stream);
      sessionRef.current = null;
    }
    setStream(null);
    setIsSharing(false);
  }, []);

  const start = useCallback(
    async (opts: { quality: ShareQualityPreset; includeSystemAudio?: boolean }): Promise<MediaStream | null> => {
      try {
        const session = await startScreenShare(opts);
        const videoTrack = session.videoTrack;
        bindScreenShareEnded(session, () => {
          // user stopped via the browser UI / native bar
          if (sessionRef.current?.videoTrack === videoTrack) {
            stop();
          }
        });
        sessionRef.current = session;
        setStream(session.stream);
        setIsSharing(true);
        return session.stream;
      } catch {
        return null;
      }
    },
    [stop],
  );

  useEffect(() => () => stop(), [stop]);

  return { isSharing, stream, start, stop };
};
