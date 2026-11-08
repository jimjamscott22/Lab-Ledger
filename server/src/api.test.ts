import { describe, it, expect } from 'vitest';
import { makeTestApp } from './testing-app';
import type { LabDetail, LabSummary } from '@lab-ledger/shared';

describe('labs API', () => {
  it('lists the 7 labs with summary fields', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject('/api/labs');
    const labs = res.json() as LabSummary[];
    expect(res.statusCode).toBe(200);
    expect(labs).toHaveLength(7);
    expect(labs[0]).toMatchObject({ slug: 'ad-user-onboarding', labNumber: 1, status: 'not_started', stepsTotal: 9, stepsChecked: 0 });
  });

  it('filters by status, topic and text', async () => {
    const { app } = await makeTestApp();
    expect(((await app.inject('/api/labs?topic=linux')).json() as LabSummary[]).map((l) => l.slug)).toEqual(['linux-file-permissions']);
    expect(((await app.inject('/api/labs?q=intune')).json() as LabSummary[])).toHaveLength(1);
    expect(((await app.inject('/api/labs?status=completed')).json() as LabSummary[])).toHaveLength(0);
  });

  it('returns lab detail with neighbors', async () => {
    const { app } = await makeTestApp();
    const first = (await app.inject('/api/labs/ad-user-onboarding')).json() as LabDetail;
    expect(first.neighbors).toEqual({ prev: null, next: 'gpo-drive-mapping' });
    expect(first.lab.steps).toHaveLength(9);
    const last = (await app.inject('/api/labs/windows-wont-wake-from-sleep')).json() as LabDetail;
    expect(last.neighbors).toEqual({ prev: 'linux-file-permissions', next: null });
    expect(last.lab.steps).toHaveLength(42);
  });

  it('404s for unknown slugs and rejects unsafe slugs', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject('/api/labs/nope')).statusCode).toBe(404);
    expect((await app.inject('/api/labs/..%2Fetc%2Fpasswd/raw')).statusCode).toBe(404);
  });

  it('serves raw HTML with a strict CSP and nosniff', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject('/api/labs/ad-user-onboarding/raw');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body).toContain('AD User Onboarding');
  });

  it('rescan returns a result', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/labs/rescan' });
    expect(res.json()).toEqual({ added: [], updated: [], removed: [], warnings: [] });
  });
});

describe('status and step API', () => {
  it('toggling the first step moves the lab to in_progress and persists', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/steps', payload: { index: 0, checked: true } });
    expect(res.json()).toEqual({ checked: [0], status: 'in_progress', allChecked: false });
    const detail = (await app.inject('/api/labs/ad-user-onboarding')).json() as LabDetail;
    expect(detail.checked).toEqual([0]);
    expect(detail.state.status).toBe('in_progress');
  });

  it('reports allChecked and does not demote a completed lab', async () => {
    const { app } = await makeTestApp();
    for (let i = 0; i < 9; i++) {
      await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/steps', payload: { index: i, checked: true } });
    }
    const last = await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/steps', payload: { index: 8, checked: true } });
    expect(last.json().allChecked).toBe(true);
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/status', payload: { status: 'completed' } });
    const again = await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/steps', payload: { index: 0, checked: false } });
    expect(again.json().status).toBe('completed');
  });

  it('rejects out-of-range and malformed step input with 400', async () => {
    const { app } = await makeTestApp();
    const url = '/api/labs/ad-user-onboarding/steps';
    expect((await app.inject({ method: 'PUT', url, payload: { index: 9, checked: true } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url, payload: { index: -1, checked: true } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url, payload: { index: 'x', checked: true } })).statusCode).toBe(400);
  });

  it('sets status, validates it and records timestamps', async () => {
    const { app } = await makeTestApp();
    const ok = await app.inject({ method: 'PUT', url: '/api/labs/gpo-drive-mapping/status', payload: { status: 'completed' } });
    expect(ok.json()).toMatchObject({ status: 'completed' });
    expect(ok.json().completedAt).toBeTruthy();
    expect((await app.inject({ method: 'PUT', url: '/api/labs/gpo-drive-mapping/status', payload: { status: 'bogus' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/labs/nope/status', payload: { status: 'completed' } })).statusCode).toBe(404);
  });
});

describe('richer lab filters', () => {
  it('combines tags, inclusive dates, status, topic and notes', async () => {
    const { app } = await makeTestApp();
    const labs = (await app.inject('/api/labs')).json() as LabSummary[];
    const lab = labs[0];
    await app.inject({ method: 'PUT', url: `/api/labs/${lab.slug}/journal`, payload: {
      bodyMd: 'Unique marmalade troubleshooting note', timeTakenMin: null, difficulty: null, confidence: null,
    } });
    const params = new URLSearchParams({ tag: lab.tags[0], from: lab.date, to: lab.date, topic: lab.topics[0], status: 'not_started', notes: 'yes' });
    expect((await app.inject(`/api/labs?${params}`)).json()).toMatchObject([{ slug: lab.slug, hasNotes: true }]);
    params.set('notes', 'no');
    expect((await app.inject(`/api/labs?${params}`)).json()).toEqual([]);
    expect((await app.inject('/api/labs?q=marmalade')).json()).toMatchObject([{ slug: lab.slug }]);
    expect((await app.inject('/api/labs?tag=nonexistent')).json()).toEqual([]);
  });

  it('rejects invalid filters and reversed date ranges', async () => {
    const { app } = await makeTestApp();
    for (const query of ['status=bad', 'topic=bad', 'notes=maybe', 'from=2026-02-30', 'to=nope', 'from=2026-11-07&to=2026-11-01', `q=${'x'.repeat(201)}`]) {
      expect((await app.inject(`/api/labs?${query}`)).statusCode, query).toBe(400);
    }
    expect((await app.inject('/api/labs?q=%22')).json()).toEqual([]);
  });

  it('full-text filtering is not capped by ranked search limits or duplicate document matches', async () => {
    const { app, ctx } = await makeTestApp();
    // Multiple documents per lab must produce only one list entry.
    for (let i = 0; i < 60; i++) {
      ctx.db.prepare('INSERT INTO search_idx (slug, kind, title, body) VALUES (?,?,?,?)')
        .run('ad-user-onboarding', 'journal', 'Test', 'cantaloupe');
    }
    ctx.db.prepare('INSERT INTO search_idx (slug, kind, title, body) VALUES (?,?,?,?)')
      .run('linux-file-permissions', 'ticket', 'Test', 'cantaloupe');
    const results = (await app.inject('/api/labs?q=cantaloupe')).json() as LabSummary[];
    expect(results.map((lab) => lab.slug)).toEqual(['ad-user-onboarding', 'linux-file-permissions']);
  });
});
