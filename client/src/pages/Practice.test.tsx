// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DueQuestion, QuestionReview } from '@lab-ledger/shared';
import Practice from './Practice';
import { api } from '../lib/api';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialDeck: DueQuestion[] = [
  {
    slug: 'ad-user-onboarding',
    labTitle: 'AD User Onboarding',
    labNumber: 1,
    topics: ['ad-gpo'],
    questionIndex: 0,
    question: 'First due question?',
    answerHtml: '<p>First answer.</p>',
    box: 1,
    dueDate: null,
  },
  {
    slug: 'ad-user-onboarding',
    labTitle: 'AD User Onboarding',
    labNumber: 1,
    topics: ['ad-gpo'],
    questionIndex: 1,
    question: 'Second due question?',
    answerHtml: '<p>Second answer.</p>',
    box: 1,
    dueDate: null,
  },
];

const fakeReview: QuestionReview = {
  slug: 'ad-user-onboarding',
  questionIndex: 0,
  box: 2,
  lastRating: 'good',
  lastReviewed: '2026-11-01T10:00:00.000Z',
  dueDate: '2026-11-03',
};

describe('Practice deck rating lock', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it('removes a reviewed card immediately while a slow due-question reload is in flight', async () => {
    let resolveReload!: (questions: DueQuestion[]) => void;
    let callCount = 0;
    vi.spyOn(api, 'dueQuestions').mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(initialDeck);
      return new Promise<DueQuestion[]>((resolve) => {
        resolveReload = resolve;
      });
    });
    const reviewSpy = vi.spyOn(api, 'reviewQuestion').mockResolvedValue(fakeReview);

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Practice />
        </MemoryRouter>,
      );
    });

    expect(container.querySelector('#practice-question')?.textContent).toBe('First due question?');

    await act(async () => {
      const revealBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Reveal answer'),
      );
      revealBtn?.click();
    });

    await act(async () => {
      const goodBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Good'),
      );
      goodBtn?.click();
    });

    expect(reviewSpy).toHaveBeenCalledTimes(1);
    expect(reviewSpy).toHaveBeenCalledWith('ad-user-onboarding', 0, 'good');
    // Even before reload() resolves, the already-reviewed card is removed locally
    expect(container.querySelector('#practice-question')?.textContent).toBe('Second due question?');

    await act(async () => {
      resolveReload([initialDeck[1]]);
    });
    expect(container.querySelector('#practice-question')?.textContent).toBe('Second due question?');

    act(() => {
      root.unmount();
    });
  });
});
