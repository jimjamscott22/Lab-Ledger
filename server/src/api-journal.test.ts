import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { makeTestApp } from './testing-app';
import type { Stats } from '@lab-ledger/shared';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

function multipart(fileName: string, mime: string, data: Buffer) {
  const boundary = '----labtest';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`;
  const body = Buffer.concat([Buffer.from(head), data, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('journal API', () => {
  it('returns an empty journal, saves, and reloads', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject('/api/labs/ad-user-onboarding/journal')).json()).toMatchObject({ bodyMd: '', difficulty: null });
    const body = { bodyMd: '## What I did\nstuff', timeTakenMin: 45, difficulty: 3, confidence: 4 };
    const put = await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/journal', payload: body });
    expect(put.json()).toMatchObject(body);
    expect((await app.inject('/api/labs/ad-user-onboarding/journal')).json()).toMatchObject(body);
  });
  it('rejects bad ratings and unknown labs', async () => {
    const { app } = await makeTestApp();
    const base = { bodyMd: '', timeTakenMin: null, difficulty: null, confidence: null };
    expect((await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/journal', payload: { ...base, difficulty: 6 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/labs/nope/journal', payload: base })).statusCode).toBe(404);
  });
});

describe('attachments API', () => {
  it('stores a png under DATA_DIR and serves it back safely', async () => {
    const { app, dataDir } = await makeTestApp();
    const up = await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', ...multipart('shot.png', 'image/png', PNG) });
    expect(up.statusCode).toBe(200);
    const { id, url } = up.json() as { id: string; url: string };
    expect(url).toBe(`/api/attachments/${id}`);
    const stored = fs.readdirSync(path.join(dataDir, 'attachments', 'ad-user-onboarding'));
    expect(stored).toEqual([`${id}.png`]);
    const get = await app.inject(url);
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');
    expect(get.headers['x-content-type-options']).toBe('nosniff');
    expect(get.headers['content-disposition']).toBe('inline');
    expect(get.rawPayload.equals(PNG)).toBe(true);
  });
  it('rejects files whose bytes do not match an allowed image type', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', ...multipart('x.png', 'image/png', Buffer.from('<script>alert(1)</script>')) });
    expect(res.statusCode).toBe(415);
  });
  it('rejects uploads over 10 MB', async () => {
    const { app } = await makeTestApp();
    const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024 + 1)]);
    const res = await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', ...multipart('big.png', 'image/png', big) });
    expect(res.statusCode).toBe(413);
  });
  it('404s for unknown labs and ids', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'POST', url: '/api/labs/nope/attachments', ...multipart('a.png', 'image/png', PNG) })).statusCode).toBe(404);
    expect((await app.inject('/api/attachments/00000000-0000-0000-0000-000000000000')).statusCode).toBe(404);
    expect((await app.inject('/api/attachments/..%2F..%2Fetc')).statusCode).toBe(404);
  });
});

describe('stats API', () => {
  it('reflects completion, streak, time and difficulty', async () => {
    const { app } = await makeTestApp({ now: new Date('2026-10-29T15:00:00Z') });
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/status', payload: { status: 'completed' } });
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/journal', payload: { bodyMd: 'did it', timeTakenMin: 90, difficulty: 4, confidence: 3 } });
    await app.inject({ method: 'PUT', url: '/api/labs/gpo-drive-mapping/journal', payload: { bodyMd: '', timeTakenMin: 30, difficulty: 2, confidence: null } });
    const s = (await app.inject('/api/stats')).json() as Stats;
    expect(s).toMatchObject({ completed: 1, total: 7, currentStreak: 1, longestStreak: 1, totalMinutes: 120, avgDifficulty: 3 });
    expect(s.topicCoverage.find((t) => t.topic === 'ad-gpo')).toEqual({ topic: 'ad-gpo', count: 2, completed: 1, pct: 50 });
    expect(s.recentJournals).toHaveLength(1);
    expect(s.recentJournals[0]).toMatchObject({ slug: 'ad-user-onboarding', snippet: 'did it' });
  });
});
