// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ticket, TicketFields } from '@lab-ledger/shared';
import { TicketEditor } from './TicketEditor';
import { api } from '../lib/api';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const emptyFields: TicketFields = {
  ticketNumber: '',
  requester: '',
  issue: 'Initial issue',
  impact: '',
  troubleshootingSteps: '',
  rootCause: '',
  resolution: '',
  timeToResolve: '',
  followUp: '',
};

const fakeTicket: Ticket = {
  fields: emptyFields,
  updatedAt: '2026-10-23T00:00:00.000Z',
};

describe('TicketEditor flush on leave', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.spyOn(api, 'ticket').mockResolvedValue(fakeTicket);
    vi.spyOn(api, 'saveTicket').mockResolvedValue(fakeTicket);
    vi.spyOn(api, 'saveTicketOnLeave').mockImplementation(() => {});
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  async function renderAndEdit(ticketNumber: string) {
    const root = createRoot(container);
    await act(async () => {
      root.render(<TicketEditor slug="ad-user-onboarding" />);
    });
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, ticketNumber);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return root;
  }

  it('flushes dirty edits on pagehide before debounce completes', async () => {
    const root = await renderAndEdit('INC-2001');

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(api.saveTicketOnLeave).toHaveBeenCalledTimes(1);
    expect(api.saveTicketOnLeave).toHaveBeenCalledWith('ad-user-onboarding', {
      ...emptyFields,
      ticketNumber: 'INC-2001',
    });

    // Unmounting afterward does not double-send the already-flushed state
    act(() => {
      root.unmount();
    });
    expect(api.saveTicketOnLeave).toHaveBeenCalledTimes(1);
  });

  it('flushes dirty edits when document becomes hidden', async () => {
    const root = await renderAndEdit('INC-2002');

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(api.saveTicketOnLeave).toHaveBeenCalledTimes(1);
    expect(api.saveTicketOnLeave).toHaveBeenCalledWith('ad-user-onboarding', {
      ...emptyFields,
      ticketNumber: 'INC-2002',
    });

    act(() => {
      root.unmount();
    });
  });
});
