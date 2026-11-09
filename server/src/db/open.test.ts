import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { searchAll } from '../search';
import { openDb } from './open';
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3 } from './schema';

describe('database migrations', () => {
  it('backfills the search index when upgrading an existing version 3 database', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-db-'));
    const file = path.join(dir, 'app.db');
    const old = new Database(file);
    old.exec(SCHEMA_V1 + SCHEMA_V2 + SCHEMA_V3);
    old.pragma('user_version = 3');
    const lab = {
      slug: 'dns-cache', date: '2026-10-30', labNumber: 8, title: 'Flush the DNS cache', topicLabel: null,
      topics: ['dns-dhcp'], tags: [], timeEstimateMin: null, scenarioText: 'Users see stale addresses', prerequisites: [],
      steps: [], questions: [], sections: [{ kind: 'steps', heading: 'Steps', html: '<ul><li>Run ipconfig</li></ul>' }],
      fileName: 'x.html', fileHash: 'h', parseStatus: 'ok', ingestedAt: '2026-10-30T00:00:00Z',
    };
    old
      .prepare('INSERT INTO labs (slug,date,lab_number,title,parsed_json) VALUES (?,?,?,?,?)')
      .run(lab.slug, lab.date, lab.labNumber, lab.title, JSON.stringify(lab));
    old.prepare('INSERT INTO journals (slug, body_md) VALUES (?,?)').run('dns-cache', 'Remembered to use flushdns');
    old
      .prepare('INSERT INTO tickets (slug, fields_json) VALUES (?,?)')
      .run('dns-cache', JSON.stringify({ issue: 'Stale record', rootCause: 'Long TTL' }));
    old.close();

    const db = openDb(file);
    expect(db.pragma('user_version', { simple: true })).toBe(5);
    expect(searchAll(db, 'ipconfig').map((r) => r.kind)).toEqual(['lab']);
    expect(searchAll(db, 'flushdns').map((r) => r.kind)).toEqual(['journal']);
    expect(searchAll(db, 'ttl').map((r) => r.kind)).toEqual(['ticket']);
    db.close();
  });

  it('upgrades a Phase 1 database through all Phase 2 migrations', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-db-'));
    const file = path.join(dir, 'app.db');
    const oldDb = new Database(file);
    oldDb.exec(SCHEMA_V1);
    oldDb.pragma('user_version = 1');
    oldDb.close();

    const db = openDb(file);
    expect(db.pragma('user_version', { simple: true })).toBe(5);
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'")
        .get(),
    ).toEqual({ name: 'tickets' });
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='question_reviews'")
        .get(),
    ).toEqual({ name: 'question_reviews' });
    db.close();
  });
});
