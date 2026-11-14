// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabDetail, Ticket } from '@lab-ledger/shared';
import LabViewer from './LabViewer';
import { api } from '../lib/api';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const detail: LabDetail = {
  lab: {
    slug: 'ad-user-onboarding',
    date: '2026-10-23',
    labNumber: 1,
    title: 'AD User Onboarding',
    topicLabel: 'AD users/groups',
    topics: ['ad-gpo'],
    tags: [],
    timeEstimateMin: null,
    scenarioText: null,
    prerequisites: [],
    steps: [
      {
        index: 0,
        key: 'ad-user-onboarding#0',
        textHash: 'abc',
        text: 'Create the user',
        section: 'Steps',
      },
    ],
    questions: [],
    sections: [],
    fileName: '2026-10-23-ad-user-onboarding.html',
    fileHash: 'hash',
    parseStatus: 'ok',
    ingestedAt: '2026-10-23T00:00:00.000Z',
  },
  state: { status: 'not_started', startedAt: null, completedAt: null, updatedAt: null },
  checked: [],
  journal: null,
  neighbors: { prev: null, next: null },
};

const ticket: Ticket = {
  fields: {
    ticketNumber: '',
    requester: '',
    issue: '',
    impact: '',
    troubleshootingSteps: '',
    rootCause: '',
    resolution: '',
    timeToResolve: '',
    followUp: '',
  },
  updatedAt: null,
};

describe('LabViewer optimistic mutations', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.spyOn(api, 'lab').mockResolvedValue(detail);
    vi.spyOn(api, 'ticket').mockResolvedValue(ticket);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  async function render() {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/labs/ad-user-onboarding']}>
          <Routes>
            <Route path="/labs/:slug" element={<LabViewer />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    return root;
  }

  it('rolls a step back and reports the error when the toggle request fails', async () => {
    vi.spyOn(api, 'toggleStep').mockRejectedValue(new Error('500 Server error'));
    const root = await render();

    const checkbox = container.querySelector<HTMLInputElement>('.steps input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect(checkbox!.checked).toBe(false);

    await act(async () => {
      checkbox!.click();
    });

    expect(checkbox!.checked).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not save that step change',
    );

    act(() => root.unmount());
  });

  it('rolls back to the server-confirmed state when a fast check-then-uncheck both fail', async () => {
    const rejecters: Array<(err: Error) => void> = [];
    vi.spyOn(api, 'toggleStep').mockImplementation(
      () => new Promise((_, reject) => rejecters.push(reject)),
    );
    const root = await render();

    const checkbox = container.querySelector<HTMLInputElement>('.steps input[type="checkbox"]');
    expect(checkbox).not.toBeNull();

    // Check, then uncheck, before either request settles.
    await act(async () => {
      checkbox!.click();
    });
    expect(checkbox!.checked).toBe(true);
    await act(async () => {
      checkbox!.click();
    });
    expect(checkbox!.checked).toBe(false);
    expect(rejecters).toHaveLength(1);

    await act(async () => {
      rejecters[0](new Error('500 Server error'));
    });
    expect(rejecters).toHaveLength(2);
    await act(async () => {
      rejecters[1](new Error('500 Server error'));
    });

    // Nothing was ever saved, so the step must end unchecked.
    expect(checkbox!.checked).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not save');

    act(() => root.unmount());
  });

  it('rolls status back to the server-confirmed value when rapid changes both fail', async () => {
    const rejecters: Array<(err: Error) => void> = [];
    vi.spyOn(api, 'setStatus').mockImplementation(
      () => new Promise((_, reject) => rejecters.push(reject)),
    );
    vi.spyOn(api, 'toggleStep').mockResolvedValue({
      checked: [],
      status: 'not_started',
      allChecked: false,
    });
    const root = await render();

    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Status"]');
    expect(select).not.toBeNull();
    expect(select!.value).toBe('not_started');

    const changeTo = async (value: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
        setter.call(select, value);
        select!.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };

    await changeTo('in_progress');
    expect(select!.value).toBe('in_progress');
    await changeTo('completed');
    expect(select!.value).toBe('completed');

    await act(async () => {
      rejecters[0](new Error('500 Server error'));
    });
    await act(async () => {
      rejecters[1](new Error('500 Server error'));
    });

    expect(select!.value).toBe('not_started');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not save');

    act(() => root.unmount());
  });

  it('keeps a real panel for every notes tab and moves with the arrow keys', async () => {
    const root = await render();
    for (const id of ['steps', 'journal', 'ticket']) {
      const tab = container.querySelector(`#tab-${id}`);
      const panelId = tab?.getAttribute('aria-controls');
      expect(panelId).toBe(`panel-${id}`);
      expect(container.querySelector(`#${panelId}`)).not.toBeNull();
    }

    const steps = container.querySelector<HTMLButtonElement>('#tab-steps');
    expect(steps?.tabIndex).toBe(0);
    expect(container.querySelector<HTMLButtonElement>('#tab-journal')?.tabIndex).toBe(-1);
    steps?.focus();
    await act(async () => {
      steps?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    const journal = container.querySelector<HTMLButtonElement>('#tab-journal');
    expect(journal?.getAttribute('aria-selected')).toBe('true');
    expect(journal?.tabIndex).toBe(0);
    expect(document.activeElement).toBe(journal);
    expect(container.querySelector('#panel-steps')?.hasAttribute('hidden')).toBe(true);
    expect(container.querySelector('#panel-journal')?.hasAttribute('hidden')).toBe(false);

    act(() => root.unmount());
  });

  it('keeps the step checked when the toggle request succeeds', async () => {
    vi.spyOn(api, 'toggleStep').mockResolvedValue({
      checked: [0],
      status: 'in_progress',
      allChecked: true,
    });
    const root = await render();

    const checkbox = container.querySelector<HTMLInputElement>('.steps input[type="checkbox"]');
    await act(async () => {
      checkbox!.click();
    });

    expect(checkbox!.checked).toBe(true);
    expect(container.querySelector('[role="alert"]')).toBeNull();

    act(() => root.unmount());
  });
});
