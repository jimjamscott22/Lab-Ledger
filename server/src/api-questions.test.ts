import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DueQuestion, QuestionReview, Stats } from '@lab-ledger/shared';
import { makeTestApp } from './testing-app';
import { SAMPLE_LAB_FILE, SAMPLE_LAB_HTML } from './ingest/regression-sample';

describe('interview practice API', () => {
  it('lists unreviewed questions as due and filters them by topic', async () => {
    const { app } = await makeTestApp();
    const all = (await app.inject('/api/questions/due')).json() as DueQuestion[];
    expect(all).toHaveLength(21);
    expect(all[0]).toMatchObject({
      slug: 'ad-user-onboarding',
      questionIndex: 0,
      box: 1,
      dueDate: null,
    });

    const windows = (await app.inject('/api/questions/due?topic=windows-troubleshooting')).json();
    expect(windows).toHaveLength(3);
    expect(windows[0].slug).toBe('windows-wont-wake-from-sleep');
    expect((await app.inject('/api/questions/due?topic=unknown')).statusCode).toBe(400);
  });

  it('does not serve <details> blocks outside Interview Questions as questions', async () => {
    const { app, ctx, labsDir } = await makeTestApp();
    fs.writeFileSync(path.join(labsDir, SAMPLE_LAB_FILE), SAMPLE_LAB_HTML);
    ctx.ingest.rescan();
    const due = ((await app.inject('/api/questions/due')).json() as DueQuestion[]).filter(
      (q) => q.slug === 'sample-onboarding',
    );
    expect(due.map((q) => [q.questionIndex, q.question])).toEqual([
      [0, "1. A user says they're locked out. What do you check?"],
      [1, '2. Why assign permissions to a group?'],
    ]);
  });

  it('schedules a reviewed question and removes it from today’s deck', async () => {
    const { app } = await makeTestApp({ now: new Date('2026-10-29T15:00:00Z') });
    const response = await app.inject({
      method: 'POST',
      url: '/api/questions/ad-user-onboarding/0/review',
      payload: { rating: 'good' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json() as QuestionReview).toMatchObject({
      slug: 'ad-user-onboarding',
      questionIndex: 0,
      box: 2,
      lastRating: 'good',
      dueDate: '2026-10-31',
    });

    expect(((await app.inject('/api/questions/due')).json() as DueQuestion[])).toHaveLength(20);
    expect(((await app.inject('/api/stats')).json() as Stats).questionsDue).toBe(20);
  });

  it('validates ratings and question identity', async () => {
    const { app } = await makeTestApp();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/questions/ad-user-onboarding/0/review',
          payload: { rating: 'perfect' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/questions/ad-user-onboarding/99/review',
          payload: { rating: 'again' },
        })
      ).statusCode,
    ).toBe(404);
  });
});
