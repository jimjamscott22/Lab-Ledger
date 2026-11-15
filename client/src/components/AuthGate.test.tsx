// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';
import { api } from '../lib/api';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AuthGate', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  async function render() {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AuthGate>
          <p>The lab list</p>
        </AuthGate>,
      );
    });
    return root;
  }

  it('renders the app when no token is required', async () => {
    vi.spyOn(api, 'authStatus').mockResolvedValue({ required: false, authenticated: true });
    const root = await render();
    expect(container.textContent).toContain('The lab list');
    act(() => root.unmount());
  });

  it('asks for a token and opens the app after it is accepted', async () => {
    vi.spyOn(api, 'authStatus').mockResolvedValue({ required: true, authenticated: false });
    vi.spyOn(api, 'unlock').mockResolvedValue({ ok: true });
    const root = await render();
    expect(container.querySelector('input')?.type).toBe('password');
    const input = container.querySelector('input')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'lab-secret-token');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(api.unlock).toHaveBeenCalledWith('lab-secret-token');
    expect(container.textContent).toContain('The lab list');
    act(() => root.unmount());
  });
});
