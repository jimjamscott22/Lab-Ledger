import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, type Db } from './open';
import * as repo from './repo';
import type { Lab } from '@lab-ledger/shared';

const lab = (slug: string, date: string, n: number | null, steps = 2): Lab => ({
  slug,
  date,
  labNumber: n,
  title: `T ${slug}`,
  topicLabel: 'x',
  topics: ['linux'],
  tags: [],
  timeEstimateMin: null,
  scenarioText: null,
  prerequisites: [],
  steps: Array.from({ length: steps }, (_, i) => ({
    index: i,
    key: `${slug}#${i}`,
    textHash: `h${i}`,
    text: `s${i}`,
    section: '',
  })),
  questions: [],
  sections: [],
  fileName: `${date}-${slug}.html`,
  fileHash: 'f',
  parseStatus: 'ok',
  ingestedAt: 'now',
});

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
});

describe('repo', () => {
  it('creates the Phase 1 tables', () => {
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(['labs', 'lab_state', 'step_progress', 'journals', 'attachments', 'activity']),
    );
  });
  it('upserts and orders labs by date then number', () => {
    repo.upsertLab(db, lab('b', '2026-10-24', 2));
    repo.upsertLab(db, lab('a', '2026-10-23', 1));
    repo.upsertLab(db, lab('a', '2026-10-23', 1));
    expect(repo.listLabs(db).map((l) => l.slug)).toEqual(['a', 'b']);
    expect(repo.getLab(db, 'a')?.steps).toHaveLength(2);
    expect(repo.getLab(db, 'zzz')).toBeNull();
  });
  it('marks missing files', () => {
    repo.upsertLab(db, lab('a', '2026-10-23', 1));
    repo.markMissing(db, 'a');
    expect(repo.getLab(db, 'a')?.missingFile).toBe(true);
  });
  it('tracks status transitions with timestamps', () => {
    expect(repo.getState(db, 'a').status).toBe('not_started');
    const s1 = repo.setStatus(db, 'a', 'in_progress', 't1');
    expect(s1).toMatchObject({ status: 'in_progress', startedAt: 't1', completedAt: null });
    const s2 = repo.setStatus(db, 'a', 'completed', 't2');
    expect(s2).toMatchObject({ startedAt: 't1', completedAt: 't2' });
    expect(repo.setStatus(db, 'a', 'in_progress', 't3').completedAt).toBeNull();
  });
  it('persists step toggles', () => {
    repo.setStep(db, 'a', 1, 'h1', true, 't');
    repo.setStep(db, 'a', 0, 'h0', true, 't');
    repo.setStep(db, 'a', 1, 'h1', false, 't2');
    expect(repo.getChecked(db, 'a')).toEqual([0]);
    expect(repo.getProgressRows(db, 'a')).toHaveLength(2);
  });
  it('round-trips a journal and enforces rating bounds', () => {
    expect(repo.getJournal(db, 'a')).toBeNull();
    const j = repo.putJournal(
      db,
      'a',
      { bodyMd: 'hi', timeTakenMin: 30, difficulty: 3, confidence: 4 },
      't',
    );
    expect(j).toEqual({
      bodyMd: 'hi',
      timeTakenMin: 30,
      difficulty: 3,
      confidence: 4,
      updatedAt: 't',
    });
    expect(() =>
      repo.putJournal(db, 'a', { bodyMd: '', timeTakenMin: null, difficulty: 9, confidence: null }, 't'),
    ).toThrow();
  });
  it('summarises labs with progress and notes', () => {
    repo.upsertLab(db, lab('a', '2026-10-23', 1, 3));
    repo.setStep(db, 'a', 0, 'h0', true, 't');
    repo.putJournal(db, 'a', { bodyMd: 'notes', timeTakenMin: null, difficulty: null, confidence: null }, 't');
    expect(repo.listSummaries(db)[0]).toMatchObject({
      slug: 'a',
      stepsTotal: 3,
      stepsChecked: 1,
      hasNotes: true,
      status: 'not_started',
    });
  });
  it('separates active and skipped activity days', () => {
    repo.addActivity(db, '2026-10-23', 'a', 'step', 't');
    repo.addActivity(db, '2026-10-24', 'b', 'skipped', 't');
    expect(repo.activityDays(db)).toEqual({ active: ['2026-10-23'], skipped: ['2026-10-24'] });
  });
});
