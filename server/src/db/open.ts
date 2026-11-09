import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { rebuildSearchIndex } from '../search';
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5 } from './schema';

export type Db = Database.Database;

export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version < 1) {
    db.exec(SCHEMA_V1);
    db.pragma('user_version = 1');
  }
  if (version < 2) {
    db.exec(SCHEMA_V2);
    db.pragma('user_version = 2');
  }
  if (version < 3) {
    db.exec(SCHEMA_V3);
    db.pragma('user_version = 3');
  }
  if (version < 4) {
    db.transaction(() => {
      db.exec(SCHEMA_V4);
      rebuildSearchIndex(db);
      db.pragma('user_version = 4');
    })();
  }
  if (version < 5) {
    db.exec(SCHEMA_V5);
    db.pragma('user_version = 5');
  }
  return db;
}
