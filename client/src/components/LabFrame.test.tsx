// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSearchShortcut } from '../lib/hotkeys';
import { LabFrame } from './LabFrame';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('LabFrame key forwarding', () => {
  let container: HTMLDivElement;
  let root: Root;
  let frameDoc: Document;
  let windowKeys: KeyboardEvent[];
  const onKey = vi.fn();
  const onWindowKey = (e: KeyboardEvent) => windowKeys.push(e);

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    windowKeys = [];
    onKey.mockClear();
    window.addEventListener('keydown', onWindowKey);
    await act(async () => {
      root.render(<LabFrame slug="demo" title="Demo" checked={new Set()} onToggle={() => {}} onKey={onKey} />);
    });
    const iframe = container.querySelector('iframe')!;
    await act(async () => {
      iframe.dispatchEvent(new Event('load'));
    });
    frameDoc = iframe.contentDocument!;
  });
  afterEach(() => {
    window.removeEventListener('keydown', onWindowKey);
    act(() => root.unmount());
    container.remove();
  });

  it('re-dispatches Ctrl/Cmd+K from inside the lab to the page so Search can open', () => {
    const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
    frameDoc.dispatchEvent(e);
    expect(windowKeys).toHaveLength(1);
    expect(isSearchShortcut(windowKeys[0])).toBe(true);
    expect(e.defaultPrevented).toBe(true);
  });

  it('does not forward ordinary keys to the page window', () => {
    frameDoc.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }));
    expect(windowKeys).toHaveLength(0);
    expect(onKey).toHaveBeenCalledTimes(1);
  });
});
