import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { openDb } from './open';
import { SCHEMA_V1 } from './schema';

describe('database migrations', () => {
  it('upgrades a Phase 1 database with the tickets table', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-db-'));
    const file = path.join(dir, 'app.db');
    const oldDb = new Database(file);
    oldDb.exec(SCHEMA_V1);
    oldDb.pragma('user_version = 1');
    oldDb.close();

    const db = openDb(file);
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'")
        .get(),
    ).toEqual({ name: 'tickets' });
    db.close();
  });
});
