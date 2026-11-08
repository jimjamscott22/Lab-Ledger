import { describe, expect, it } from 'vitest';
import type { SearchResult } from '@lab-ledger/shared';
import { makeTestApp } from './testing-app';

describe('search API', () => {
  it('returns ranked results with highlighted snippet parts', async () => {
    const { app } = await makeTestApp();
    const res = await app.inject('/api/search?q=wake');
    expect(res.statusCode).toBe(200);
    const body = res.json() as SearchResult[];
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ slug: 'windows-wont-wake-from-sleep', kind: 'lab', labNumber: 7 });
    expect(body[0].snippet.some((p) => p.match)).toBe(true);
  });

  it('finds journal notes written through the journal API', async () => {
    const { app } = await makeTestApp();
    const put = await app.inject({
      method: 'PUT',
      url: '/api/labs/gpo-drive-mapping/journal',
      payload: { bodyMd: 'The mapping failed because of a stale kerberos ticket', timeTakenMin: 30, difficulty: 2, confidence: 4 },
    });
    expect(put.statusCode).toBe(200);
    const body = (await app.inject('/api/search?q=kerberos')).json() as SearchResult[];
    expect(body.map((r) => [r.slug, r.kind])).toEqual([['gpo-drive-mapping', 'journal']]);
  });

  it('finds ticket write-ups written through the ticket API', async () => {
    const { app } = await makeTestApp();
    const fields = {
      ticketNumber: 'INC-1', requester: 'Pat', issue: 'Drive missing', impact: '', troubleshootingSteps: '',
      rootCause: 'Stale kerberos ticket', resolution: '', timeToResolve: '', followUp: '',
    };
    expect((await app.inject({ method: 'PUT', url: '/api/labs/gpo-drive-mapping/ticket', payload: fields })).statusCode).toBe(200);
    const body = (await app.inject('/api/search?q=kerberos')).json() as SearchResult[];
    expect(body.map((r) => [r.slug, r.kind])).toEqual([['gpo-drive-mapping', 'ticket']]);
  });

  it('returns an empty list for a blank or unsearchable query', async () => {
    const { app } = await makeTestApp();
    for (const q of ['', '%20%20', '%22', '*']) {
      const res = await app.inject(`/api/search?q=${q}`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    }
  });

  it('rejects a missing, oversized, or malformed request', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject('/api/search')).statusCode).toBe(400);
    expect((await app.inject(`/api/search?q=${'a'.repeat(201)}`)).statusCode).toBe(400);
    expect((await app.inject('/api/search?q=wake&limit=0')).statusCode).toBe(400);
    expect((await app.inject('/api/search?q=wake&limit=51')).statusCode).toBe(400);
    expect((await app.inject('/api/search?q=wake&limit=abc')).statusCode).toBe(400);
  });

  it('honours the limit parameter', async () => {
    const { app } = await makeTestApp();
    const body = (await app.inject('/api/search?q=rollback&limit=2')).json() as SearchResult[];
    expect(body).toHaveLength(2);
  });
});
