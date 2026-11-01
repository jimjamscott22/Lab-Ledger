import { describe, expect, it } from 'vitest';
import { addDays, LEITNER_INTERVAL_DAYS, nextBox } from './questions';

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
});
