// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useAutosave } from './useAutosave';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ save, saveOnLeave }: { save: (v: string) => Promise<void>; saveOnLeave: (v: string) => void }) {
  const [value, setValue] = useState('a');
  const auto = useAutosave({ value, save, saveOnLeave });
  return (
    <>
      <output data-testid="state">{auto.saveState}</output>
      <button
        type="button"
        onClick={() => {
          auto.markDirty();
          setValue((v) => `${v}x`);
        }}
      >
        edit
      </button>
    </>
  );
}

describe('useAutosave', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function render(save: (v: string) => Promise<void>, saveOnLeave: (v: string) => void) {
    await act(async () => {
      root.render(<Harness save={save} saveOnLeave={saveOnLeave} />);
    });
  }

  async function edit() {
    await act(async () => {
      container.querySelector('button')!.click();
    });
  }

  it('serializes saves so a slow save cannot overwrite a newer edit', async () => {
    const resolvers: (() => void)[] = [];
    const save = vi.fn((_v: string) => new Promise<void>((resolve) => resolvers.push(resolve)));
    const saveOnLeave = vi.fn();
    await render(save, saveOnLeave);

    await edit(); // value: ax
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith('ax');

    await edit(); // value: axx, while first save is still in flight
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    // The second save must wait for the first to finish.
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('axx');

    await act(async () => {
      resolvers[1]();
    });
    expect(container.querySelector('[data-testid="state"]')?.textContent).toBe('saved');

    // Everything is saved, so leaving must not send a stale copy.
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(saveOnLeave).not.toHaveBeenCalled();
  });

  it('keeps edits dirty when a save fails so leaving flushes the latest copy', async () => {
    const save = vi.fn((_v: string) => Promise.reject(new Error('offline')));
    const saveOnLeave = vi.fn();
    await render(save, saveOnLeave);

    await edit();
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="state"]')?.textContent).toBe('error');

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(saveOnLeave).toHaveBeenCalledTimes(1);
    expect(saveOnLeave).toHaveBeenCalledWith('ax');
  });
});
