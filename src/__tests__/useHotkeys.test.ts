import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useHotkeys } from '../media/useHotkeys';

type Ev = { kind: 'ptt' | 'mute'; state: 'pressed' | 'released' };

describe('useHotkeys', () => {
  it('binds on activate and dispatches ptt-down/up and mute-toggle', async () => {
    let subscriber: ((e: Ev) => void) | null = null;
    const unlisten = vi.fn();
    const bind = vi.fn(async () => {});
    const unbind = vi.fn(async () => {});
    const subscribe = vi.fn(async (cb: (e: Ev) => void) => {
      subscriber = cb;
      return unlisten;
    });
    const onPttDown = vi.fn();
    const onPttUp = vi.fn();
    const onMuteToggle = vi.fn();

    renderHook(() =>
      useHotkeys({
        ptt: 'CTRL+SHIFT+V',
        mute: 'CTRL+SHIFT+M',
        active: true,
        bind,
        unbind,
        subscribe,
        onPttDown,
        onPttUp,
        onMuteToggle,
      }),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(bind).toHaveBeenCalledWith('CTRL+SHIFT+V', 'CTRL+SHIFT+M');

    act(() => subscriber!({ kind: 'mute', state: 'pressed' }));
    expect(onMuteToggle).toHaveBeenCalledTimes(1);

    act(() => subscriber!({ kind: 'ptt', state: 'pressed' }));
    expect(onPttDown).toHaveBeenCalledTimes(1);

    act(() => subscriber!({ kind: 'ptt', state: 'released' }));
    expect(onPttUp).toHaveBeenCalledTimes(1);
  });

  it('unbinds and unsubscribes on deactivate', async () => {
    const unlisten = vi.fn();
    const bind = vi.fn(async () => {});
    const unbind = vi.fn(async () => {});
    const subscribe = vi.fn(async (_cb: (e: Ev) => void) => unlisten);

    const { rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useHotkeys({ ptt: 'V', mute: 'M', active, bind, unbind, subscribe }),
      { initialProps: { active: true } },
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    rerender({ active: false });

    expect(unbind).toHaveBeenCalled();
    expect(unlisten).toHaveBeenCalled();
  });

  it('does nothing while inactive', async () => {
    const bind = vi.fn(async () => {});
    const unbind = vi.fn(async () => {});
    const subscribe = vi.fn(async () => vi.fn());

    renderHook(() =>
      useHotkeys({ ptt: 'V', mute: 'M', active: false, bind, unbind, subscribe }),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(bind).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });
});
