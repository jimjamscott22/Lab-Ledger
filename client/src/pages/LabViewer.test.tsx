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
    steps: [{ index: 0, key: 'ad-user-onboarding#0', textHash: 'abc', text: 'Create the user', section: 'Steps' }],
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
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not save that step change');

    act(() => root.unmount());
  });

  it('keeps the step checked when the toggle request succeeds', async () => {
    vi.spyOn(api, 'toggleStep').mockResolvedValue({ checked: [0], status: 'in_progress', allChecked: true });
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
