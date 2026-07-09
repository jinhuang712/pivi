import { useEffect, useRef } from 'react';
import {
  bindHotkeys,
  unbindHotkeys,
  subscribeHotkey,
  type HotkeyEvent,
} from '../lib/hotkeys';

export interface UseHotkeysOptions {
  ptt: string;
  mute: string;
  active: boolean;
  bind?: (ptt: string, mute: string) => Promise<void>;
  unbind?: () => Promise<void>;
  subscribe?: (handler: (event: HotkeyEvent) => void) => Promise<() => void>;
  onPttDown?: () => void;
  onPttUp?: () => void;
  onMuteToggle?: () => void;
}

/**
 * Binds the configured PTT / mute global shortcuts while `active`, and
 * dispatches fired-shortcut events to the provided handlers:
 * - mute (pressed): toggle the mic
 * - ptt (pressed): start talking (unmute)
 * - ptt (released): stop talking (mute)
 *
 * Bind/unbind/subscribe are injectable so the dispatch logic is testable
 * without the Tauri runtime.
 */
export const useHotkeys = ({
  ptt,
  mute,
  active,
  bind = bindHotkeys,
  unbind = unbindHotkeys,
  subscribe = subscribeHotkey,
  onPttDown,
  onPttUp,
  onMuteToggle,
}: UseHotkeysOptions) => {
  const handlersRef = useRef({ onPttDown, onPttUp, onMuteToggle });
  handlersRef.current = { onPttDown, onPttUp, onMuteToggle };

  useEffect(() => {
    if (!active || !ptt || !mute) {
      return;
    }
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        await bind(ptt, mute);
        unlisten = await subscribe((event) => {
          const handlers = handlersRef.current;
          if (event.kind === 'mute' && event.state === 'pressed') {
            handlers.onMuteToggle?.();
          } else if (event.kind === 'ptt' && event.state === 'pressed') {
            handlers.onPttDown?.();
          } else if (event.kind === 'ptt' && event.state === 'released') {
            handlers.onPttUp?.();
          }
        });
        if (cancelled) {
          unlisten?.();
          unlisten = null;
        }
      } catch {
        /* global shortcuts unavailable in this environment */
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
      void unbind();
    };
  }, [active, ptt, mute, bind, unbind, subscribe]);
};
