import { describe, expect, it } from 'vitest';
import type { BackupV1, TicketFields } from '@lab-ledger/shared';
import { importBackup } from './backup';
import * as repo from './db/repo';
import { buildMatchQuery, rebuildSearchIndex, searchAll } from './search';
import { makeTestApp } from './testing-app';

const NOW = '2026-10-30T12:00:00.000Z';
const journal = (bodyMd: string) => ({ bodyMd, timeTakenMin: null, difficulty: null, confidence: null });
const ticket = (over: Partial<TicketFields> = {}): TicketFields => ({
  ticketNumber: '',
  requester: '',
  issue: '',
  impact: '',
  troubleshootingSteps: '',
  rootCause: '',
  resolution: '',
  timeToResolve: '',
  followUp: '',
  ...over,
});
const text = (r: { snippet: { text: string }[] }) => r.snippet.map((p) => p.text).join('');

describe('buildMatchQuery', () => {
  it('quotes every term and makes the last one a prefix match', () => {
    expect(buildMatchQuery('group policy')).toBe('"group" "policy"*');
  });

  it('keeps unicode letters and digits and drops punctuation', () => {
    expect(buildMatchQuery('  Get-ADUser, résumé #42! ')).toBe('"Get" "ADUser" "résumé" "42"*');
  });

  it('neutralises FTS operators by quoting them as plain terms', () => {
    expect(buildMatchQuery('NEAR(a b) OR "x*')).toBe('"NEAR" "a" "b" "OR" "x"*');
  });

  it('returns null when there is nothing searchable', () => {
    expect(buildMatchQuery('')).toBeNull();
    expect(buildMatchQuery('  !!! "" ** ')).toBeNull();
  });

  it('caps the number of terms', () => {
    const q = buildMatchQuery(Array.from({ length: 30 }, (_, i) => `t${i}`).join(' '))!;
    expect(q.match(/"t\d+"/g)).toHaveLength(10);
  });
});

describe('searchAll', () => {
  it('finds a lab by a word in its title and highlights the match', async () => {
    const { ctx } = await makeTestApp();
    const results = searchAll(ctx.db, 'wake');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      slug: 'windows-wont-wake-from-sleep',
      kind: 'lab',
      labTitle: "PC Won't Wake From Sleep",
      labNumber: 7,
      date: '2026-10-29',
    });
    const hit = results[0].snippet.filter((p) => p.match).map((p) => p.text.toLowerCase());
    expect(hit).toContain('wake');
  });

  it('finds words that only appear in lab body text, with stemming and prefixes', async () => {
    const { ctx } = await makeTestApp();
    const exact = searchAll(ctx.db, 'rollback');
    expect(new Set(exact.map((r) => r.slug)).size).toBe(6); // lab 01 has no rollback section
    expect(searchAll(ctx.db, 'rollbac')).toHaveLength(exact.length);
    expect(searchAll(ctx.db, 'verifying').length).toBeGreaterThan(0);
  });

  it('does not index stylesheet text', async () => {
    const { ctx } = await makeTestApp();
    expect(searchAll(ctx.db, 'font')).toEqual([]);
  });

  it('matches case-insensitively and requires every term', async () => {
    const { ctx } = await makeTestApp();
    expect(searchAll(ctx.db, 'INTUNE enrollment').map((r) => r.slug)).toContain('intune-device-enrollment');
    expect(searchAll(ctx.db, 'intune kerberosnotthere')).toEqual([]);
  });

  it('returns an empty list instead of throwing for hostile input', async () => {
    const { ctx } = await makeTestApp();
    for (const q of ['', '   ', '"', 'AND OR NOT', 'NEAR(', '* *', 'a:b', "'; DROP TABLE labs; --", '-wake', '^wake']) {
      expect(() => searchAll(ctx.db, q)).not.toThrow();
    }
    expect(searchAll(ctx.db, '')).toEqual([]);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM labs').get()).toEqual({ n: 7 });
  });

  it('respects the result limit', async () => {
    const { ctx } = await makeTestApp();
    expect(searchAll(ctx.db, 'rollback', 3)).toHaveLength(3);
  });

  it('ranks title matches ahead of body matches', async () => {
    const { ctx } = await makeTestApp();
    repo.putJournal(ctx.db, 'gpo-drive-mapping', journal('permissions'), NOW);
    const results = searchAll(ctx.db, 'permissions');
    expect(results.map((r) => [r.slug, r.kind])).toEqual([
      ['linux-file-permissions', 'lab'],
      ['gpo-drive-mapping', 'journal'],
    ]);
  });

  it('indexes journals, replacing the entry on every save', async () => {
    const { ctx } = await makeTestApp();
    repo.putJournal(ctx.db, 'gpo-drive-mapping', journal('Fixed it by purging the stale kerberos tickets'), NOW);
    const results = searchAll(ctx.db, 'kerberos');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ slug: 'gpo-drive-mapping', kind: 'journal', labTitle: 'GPO Drive Mapping' });
    expect(text(results[0])).toContain('kerberos');

    repo.putJournal(ctx.db, 'gpo-drive-mapping', journal('Actually it was DNS'), NOW);
    expect(searchAll(ctx.db, 'kerberos')).toEqual([]);
    expect(searchAll(ctx.db, 'dns').filter((r) => r.kind === 'journal')).toHaveLength(1);
  });

  it('indexes every ticket write-up field', async () => {
    const { ctx } = await makeTestApp();
    repo.putTicket(ctx.db, 'gpo-drive-mapping', ticket({ rootCause: 'Stale kerberos ticket', followUp: 'Monitor zebra' }), NOW);
    expect(searchAll(ctx.db, 'kerberos')[0]).toMatchObject({ slug: 'gpo-drive-mapping', kind: 'ticket' });
    expect(searchAll(ctx.db, 'zebra')[0]).toMatchObject({ slug: 'gpo-drive-mapping', kind: 'ticket' });

    repo.putTicket(ctx.db, 'gpo-drive-mapping', ticket(), NOW);
    expect(searchAll(ctx.db, 'kerberos')).toEqual([]);
  });

  it('stops matching a journal once it is emptied', async () => {
    const { ctx } = await makeTestApp();
    repo.putJournal(ctx.db, 'gpo-drive-mapping', journal('kerberos'), NOW);
    repo.putJournal(ctx.db, 'gpo-drive-mapping', journal('   '), NOW);
    expect(searchAll(ctx.db, 'kerberos')).toEqual([]);
  });

  it('returns user markup as plain text and never as highlight markers', async () => {
    const { ctx } = await makeTestApp();
    repo.putJournal(ctx.db, 'gpo-drive-mapping', journal('<img src=x onerror=alert(1)> kerb\u0002e\u0003ros'), NOW);
    const [r] = searchAll(ctx.db, 'img');
    expect(text(r)).toContain('<img src=x onerror=alert(1)>');
    expect(text(r).includes('\u0002') || text(r).includes('\u0003')).toBe(false);
  });

  it('rebuilds the whole index from stored data', async () => {
    const { ctx } = await makeTestApp();
    repo.putJournal(ctx.db, 'gpo-drive-mapping', journal('kerberos'), NOW);
    ctx.db.exec('DELETE FROM search_idx');
    expect(searchAll(ctx.db, 'kerberos')).toEqual([]);
    rebuildSearchIndex(ctx.db);
    expect(searchAll(ctx.db, 'kerberos')).toHaveLength(1);
    expect(searchAll(ctx.db, 'wake')).toHaveLength(1);
    rebuildSearchIndex(ctx.db);
    expect(searchAll(ctx.db, 'wake')).toHaveLength(1);
  });

  it('keeps indexing a lab that is re-ingested', async () => {
    const { ctx } = await makeTestApp();
    const lab = repo.getLab(ctx.db, 'windows-wont-wake-from-sleep')!;
    repo.upsertLab(ctx.db, { ...lab, title: 'PC Will Not Hibernate' });
    expect(searchAll(ctx.db, 'hibernate').map((r) => r.slug)).toEqual(['windows-wont-wake-from-sleep']);
    expect(searchAll(ctx.db, 'wake').filter((r) => r.kind === 'lab' && r.labTitle.includes("Won't"))).toEqual([]);
  });

  it('re-indexes journals and tickets after a restore', async () => {
    const { ctx, dataDir } = await makeTestApp();
    repo.putJournal(ctx.db, 'gpo-drive-mapping', journal('old kerberos note'), NOW);
    repo.putTicket(ctx.db, 'gpo-drive-mapping', ticket({ issue: 'old kerberos ticket' }), NOW);
    const backup: BackupV1 = {
      version: 1,
      exportedAt: NOW,
      labState: [],
      stepProgress: [],
      journals: [
        { slug: 'intune-device-enrollment', bodyMd: 'restored zebra note', timeTakenMin: null, difficulty: null, confidence: null, updatedAt: NOW },
      ],
      tickets: [{ slug: 'intune-device-enrollment', fields: ticket({ issue: 'restored zebra ticket' }), updatedAt: NOW }],
      questionReviews: [],
      attachments: [],
      activity: [],
    };
    importBackup(ctx.db, dataDir, backup);
    expect(searchAll(ctx.db, 'kerberos')).toEqual([]);
    expect(searchAll(ctx.db, 'zebra').map((r) => [r.slug, r.kind]).sort()).toEqual([
      ['intune-device-enrollment', 'journal'],
      ['intune-device-enrollment', 'ticket'],
    ]);
    expect(searchAll(ctx.db, 'wake')).toHaveLength(1);
  });
});
