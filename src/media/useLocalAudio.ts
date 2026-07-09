import { useEffect, useRef, useState } from 'react';

export interface LocalAudio {
  stream: MediaStream | null;
  isMuted: boolean;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
}

/**
 * Acquires the local microphone stream while `active` is true and exposes a
 * mute control that toggles the audio track's `enabled` flag (so a muted mic
 * stops sending, rather than sending silence).
 *
 * Acquisition is non-fatal: if the environment has no `getUserMedia` (e.g. no
 * permission, or a headless test host), `stream` stays null and the room still
 * works for receiving remote audio.
 */
export const useLocalAudio = (active: boolean): LocalAudio => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    if (!active) {
      if (trackRef.current) {
        trackRef.current.stop();
        trackRef.current = null;
      }
      setStream(null);
      setIsMuted(false);
      return;
    }

    let cancelled = false;
    const acquire = async () => {
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          acquired.getTracks().forEach((t) => t.stop());
          return;
        }
        trackRef.current = acquired.getAudioTracks()[0] ?? null;
        if (trackRef.current) {
          trackRef.current.enabled = !isMuted;
        }
        setStream(acquired);
      } catch {
        /* no mic available - receiving audio still works */
      }
    };

    acquire();

    return () => {
      cancelled = true;
      if (trackRef.current) {
        trackRef.current.stop();
        trackRef.current = null;
      }
      setStream(null);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMuted = (muted: boolean) => {
    if (trackRef.current) {
      trackRef.current.enabled = !muted;
    }
    setIsMuted(muted);
  };

  const toggleMute = () => setMuted(!isMuted);

  return { stream, isMuted, toggleMute, setMuted };
};
