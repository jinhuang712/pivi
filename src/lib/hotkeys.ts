import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface HotkeyConfig {
  ptt: string;
  mute: string;
}

export interface HotkeyEvent {
  kind: 'ptt' | 'mute';
  state: 'pressed' | 'released';
}

export const HOTKEY_EVENT = 'pivi-hotkey';

export const bindHotkeys = (ptt: string, mute: string) =>
  invoke<void>('bind_global_hotkeys', { ptt, mute });

export const unbindHotkeys = () => invoke<void>('unbind_global_hotkeys');

export const getBoundHotkeys = () =>
  invoke<HotkeyConfig | null>('get_global_hotkeys');

export type HotkeyUnlisten = () => void;

/** Subscribe to pivi-hotkey events; resolves to an unlisten function. */
export const subscribeHotkey = async (
  handler: (event: HotkeyEvent) => void,
): Promise<HotkeyUnlisten> => {
  const unlisten = await listen<HotkeyEvent>(HOTKEY_EVENT, (event) => {
    handler(event.payload);
  });
  return unlisten;
};
