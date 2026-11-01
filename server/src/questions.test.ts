import { describe, expect, it } from 'vitest';
import type { Question } from '@lab-ledger/shared';
import {
  addDays,
  LEITNER_INTERVAL_DAYS,
  nextBox,
  remapQuestionReviews,
  type ReviewRow,
} from './questions';

const q = (index: number, question: string): Question => ({
  index,
  question,
  answerHtml: '<p>a</p>',
});

const r = (q_index: number, box = 2, due_date = '2026-11-05'): ReviewRow => ({
  slug: 'ad-user-onboarding',
  q_index,
  box,
  last_rating: 'good',
  last_reviewed: '2026-11-01T00:00:00Z',
  due_date,
});

describe('Leitner scheduling', () => {
  it('uses the documented 1, 2, 4, 8, and 16 day intervals', () => {
    expect(LEITNER_INTERVAL_DAYS).toEqual([1, 2, 4, 8, 16]);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 2)).toBe('2027-01-02');
  });

  it('moves boxes according to the answer rating and clamps them to 1-5', () => {
    expect(nextBox(4, 'again')).toBe(1);
    expect(nextBox(3, 'hard')).toBe(2);
    expect(nextBox(1, 'hard')).toBe(1);
    expect(nextBox(3, 'good')).toBe(4);
    expect(nextBox(5, 'good')).toBe(5);
    expect(nextBox(2, 'easy')).toBe(4);
    expect(nextBox(4, 'easy')).toBe(5);
  });

  it('remaps question reviews when questions are reordered, inserted, or removed', () => {
    const prev = [q(0, 'What is OU?'), q(1, 'What is GPO?')];
    const reviews = [r(0, 3, '2026-11-05')];

    // Inserted new first question -> review moves to index 1, index 0 stays unreviewed
    const withInserted = [q(0, 'New first question?'), q(1, 'What is OU?'), q(2, 'What is GPO?')];
    expect(remapQuestionReviews(reviews, prev, withInserted)).toEqual([
      { ...reviews[0], q_index: 1 },
    ]);

    // Reordered questions -> review follows 'What is OU?'
    const reordered = [q(0, 'What is GPO?'), q(1, 'What is OU?')];
    expect(remapQuestionReviews(reviews, prev, reordered)).toEqual([
      { ...reviews[0], q_index: 1 },
    ]);

    // Removed reviewed question -> review is dropped rather than attached to remaining question
    const withRemoved = [q(0, 'What is GPO?')];
    expect(remapQuestionReviews(reviews, prev, withRemoved)).toEqual([]);

    // In-place wording edit with same question count -> keeps positional review
    const edited = [q(0, 'What is an Organizational Unit (OU)?'), q(1, 'What is GPO?')];
    expect(remapQuestionReviews(reviews, prev, edited)).toEqual([
      { ...reviews[0], q_index: 0 },
    ]);
  });
});
