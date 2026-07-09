import type { HotkeyConfig } from './hotkeys';

const STORAGE_KEY = 'pivi_hotkeys';
const DEFAULT: HotkeyConfig = { ptt: 'V', mute: 'M' };

export const loadHotkeys = (): HotkeyConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT;
    }
    const parsed = JSON.parse(raw) as Partial<HotkeyConfig>;
    return {
      ptt: typeof parsed.ptt === 'string' && parsed.ptt ? parsed.ptt : DEFAULT.ptt,
      mute: typeof parsed.mute === 'string' && parsed.mute ? parsed.mute : DEFAULT.mute,
    };
  } catch {
    return DEFAULT;
  }
};

export const saveHotkeys = (config: HotkeyConfig) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* storage unavailable */
  }
};
