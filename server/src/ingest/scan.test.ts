import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { openDb } from '../db/open';
import * as repo from '../db/repo';
import { scanLabs } from './scan';
import { createIngestService } from './service';
import { LabEvents } from '../events';
import { copyFixtures } from '../testing';
import type { LabEventPayload } from '@lab-ledger/shared';

const hashDir = (dir: string) => {
  const h = createHash('sha256');
  for (const f of fs.readdirSync(dir).sort()) h.update(f).update(fs.readFileSync(path.join(dir, f)));
  return h.digest('hex');
};

describe('scanLabs', () => {
  it('ingests the 7 fixture labs in date order with numbers 1-7 and topics', () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    const r = scanLabs(db, dir);
    expect(r.added).toHaveLength(7);
    const labs = repo.listLabs(db);
    expect(labs.map((l) => l.labNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(labs.map((l) => l.date)).toEqual([...labs.map((l) => l.date)].sort());
    expect(labs.map((l) => l.steps.length)).toEqual([9, 12, 12, 15, 13, 14, 42]);
    expect(labs[6].topics).toEqual(['windows-troubleshooting']);
    expect(labs[2].topics).toEqual(['m365-entra']);
    expect(labs[0].topicLabel).toBe('AD users/groups');
  });

  it('lists malformed files without crashing and ignores bad filenames', () => {
    const dir = copyFixtures({ malformed: true });
    const db = openDb(':memory:');
    const r = scanLabs(db, dir);
    expect(r.added).toHaveLength(9);
    expect(repo.getLab(db, 'malformed-lab')?.parseStatus).toBe('partial');
    expect(repo.getLab(db, 'empty-lab')?.parseStatus).toBe('failed');
    expect(repo.getLab(db, 'not-a-lab')).toBeNull();
  });

  it('is idempotent and skips unchanged files', () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    scanLabs(db, dir);
    const r = scanLabs(db, dir);
    expect(r).toEqual({ added: [], updated: [], removed: [], warnings: [] });
  });

  it('detects added, changed and removed files', () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    scanLabs(db, dir);
    fs.writeFileSync(path.join(dir, '2026-10-30-new-one.html'), '<html><head><title>Lab 08: New One</title></head><body><h1>New One</h1><label><input type="checkbox"> a</label></body></html>');
    fs.appendFileSync(path.join(dir, '2026-10-23-ad-user-onboarding.html'), '\n<!-- edit -->');
    fs.rmSync(path.join(dir, '2026-10-24-gpo-drive-mapping.html'));
    const r = scanLabs(db, dir);
    expect(r.added).toEqual(['new-one']);
    expect(r.updated).toEqual(['ad-user-onboarding']);
    expect(r.removed).toEqual(['gpo-drive-mapping']);
    expect(repo.getLab(db, 'gpo-drive-mapping')?.missingFile).toBe(true);
  });

  it('creates a placeholder for a log line without a file', () => {
    const dir = copyFixtures();
    fs.appendFileSync(path.join(dir, 'lab-log.txt'), '2026-10-30 | Lab 08 | DNS basics | dns-basics\n');
    const db = openDb(':memory:');
    scanLabs(db, dir);
    const lab = repo.getLab(db, 'dns-basics');
    expect(lab).toMatchObject({ missingFile: true, labNumber: 8, title: 'DNS basics' });
  });

  it('ingests a file with no log line using the number from the title', () => {
    const dir = copyFixtures();
    fs.writeFileSync(path.join(dir, '2026-10-30-no-log.html'), '<html><head><title>Lab 09: No Log</title></head><body><h1>No Log</h1><label><input type="checkbox"> a</label></body></html>');
    const db = openDb(':memory:');
    scanLabs(db, dir);
    expect(repo.getLab(db, 'no-log')).toMatchObject({ labNumber: 9, topicLabel: null });
  });

  it('keeps the newest file when two share a slug', () => {
    const dir = copyFixtures();
    const older = path.join(dir, '2026-10-20-ad-user-onboarding.html');
    fs.copyFileSync(path.join(dir, '2026-10-23-ad-user-onboarding.html'), older);
    fs.utimesSync(older, new Date('2020-01-01'), new Date('2020-01-01'));
    const db = openDb(':memory:');
    const r = scanLabs(db, dir);
    expect(r.warnings.join(' ')).toMatch(/Duplicate slug ad-user-onboarding/);
    expect(repo.getLab(db, 'ad-user-onboarding')?.date).toBe('2026-10-23');
  });

  it('keeps progress when a lab is re-parsed with a reordered step', () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    scanLabs(db, dir);
    const lab = repo.getLab(db, 'ad-user-onboarding')!;
    repo.setStep(db, lab.slug, 0, lab.steps[0].textHash, true, 't');
    const file = path.join(dir, '2026-10-23-ad-user-onboarding.html');
    const html = fs.readFileSync(file, 'utf8');
    const a = html.indexOf('<div class="card step">');
    const b = html.indexOf('<div class="card step">', a + 1);
    const c = html.indexOf('<div class="card step">', b + 1);
    const swapped = html.slice(0, a) + html.slice(b, c) + html.slice(a, b) + html.slice(c);
    fs.writeFileSync(file, swapped);
    scanLabs(db, dir);
    const after = repo.getLab(db, lab.slug)!;
    expect(after.steps[1].textHash).toBe(lab.steps[0].textHash);
    expect(repo.getChecked(db, lab.slug)).toEqual([1]);
  });

  it('preserves question review records when a lab file gains or reorders questions', () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    scanLabs(db, dir);
    db.prepare(
      `INSERT INTO question_reviews (slug, q_index, box, last_rating, last_reviewed, due_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('ad-user-onboarding', 0, 3, 'easy', '2026-10-29T10:00:00Z', '2026-11-02');

    const file = path.join(dir, '2026-10-23-ad-user-onboarding.html');
    const html = fs.readFileSync(file, 'utf8');
    const inserted = html.replace(
      '<details><summary>Question 1 for AD User Onboarding?</summary>',
      '<details><summary>Brand new Question 0?</summary><p>Answer 0.</p></details>\n<details><summary>Question 1 for AD User Onboarding?</summary>',
    );
    fs.writeFileSync(file, inserted);
    scanLabs(db, dir);

    const rows = db
      .prepare('SELECT q_index, box, due_date FROM question_reviews WHERE slug=? ORDER BY q_index')
      .all('ad-user-onboarding');
    expect(rows).toEqual([{ q_index: 1, box: 3, due_date: '2026-11-02' }]);
  });

  it('never modifies the source files', () => {
    const dir = copyFixtures({ malformed: true });
    const before = hashDir(dir);
    const db = openDb(':memory:');
    scanLabs(db, dir);
    scanLabs(db, dir);
    expect(hashDir(dir)).toBe(before);
  });
});

describe('createIngestService', () => {
  it('publishes events with titles', () => {
    const dir = copyFixtures();
    const db = openDb(':memory:');
    const events = new LabEvents();
    const seen: LabEventPayload[] = [];
    events.subscribe((e) => seen.push(e));
    const svc = createIngestService({ db, labsDir: dir, events });
    svc.rescan();
    expect(seen.filter((e) => e.type === 'lab:added')).toHaveLength(7);
    expect(seen[0].title).toBeTruthy();
    fs.rmSync(path.join(dir, '2026-10-24-gpo-drive-mapping.html'));
    svc.rescan();
    expect(seen.at(-1)).toMatchObject({ type: 'lab:removed', slug: 'gpo-drive-mapping' });
  });
});
