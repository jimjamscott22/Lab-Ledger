import { describe, it, expect } from 'vitest';
import { computeStreaks, buildStats } from './stats';
import { makeTestApp } from './testing-app';

describe('computeStreaks', () => {
  it('counts consecutive active days ending today', () => {
    expect(computeStreaks(['2026-10-27', '2026-10-28', '2026-10-29'], [], '2026-10-29')).toEqual({ current: 3, longest: 3 });
  });
  it('counts from yesterday when today has no activity yet', () => {
    expect(computeStreaks(['2026-10-27', '2026-10-28'], [], '2026-10-29').current).toBe(2);
  });
  it('resets after a gap but remembers the longest', () => {
    const r = computeStreaks(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-28', '2026-10-29'], [], '2026-10-29');
    expect(r).toEqual({ current: 2, longest: 3 });
  });
  it('treats skipped days as transparent', () => {
    const r = computeStreaks(['2026-10-27', '2026-10-29'], ['2026-10-28'], '2026-10-29');
    expect(r).toEqual({ current: 2, longest: 2 });
  });
  it('is zero when yesterday is also empty', () => {
    expect(computeStreaks(['2026-10-20'], [], '2026-10-29')).toEqual({ current: 0, longest: 1 });
  });
  it('handles no data', () => {
    expect(computeStreaks([], [], '2026-10-29')).toEqual({ current: 0, longest: 0 });
  });
});

describe('buildStats', () => {
  it('is empty-safe on a fresh database', async () => {
    const { ctx } = await makeTestApp();
    const s = buildStats(ctx.db, ctx.now(), 'America/New_York');
    expect(s).toMatchObject({ completed: 0, total: 7, currentStreak: 0, longestStreak: 0, totalMinutes: 0, avgDifficulty: null });
    expect(s.topicCoverage).toHaveLength(12);
    expect(s.topicCoverage.find((t) => t.topic === 'ad-gpo')).toEqual({ topic: 'ad-gpo', count: 2, completed: 0, pct: 0 });
    expect(s.today?.slug).toBe('windows-wont-wake-from-sleep');
    expect(s.recentJournals).toEqual([]);
  });
});
