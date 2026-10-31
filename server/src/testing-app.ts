import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp, type AppContext } from './app';
import { loadConfig } from './config';
import { openDb } from './db/open';
import { LabEvents } from './events';
import { createIngestService } from './ingest/service';
import { copyFixtures } from './testing';

export async function makeTestApp(opts: { malformed?: boolean; now?: Date } = {}) {
  const labsDir = copyFixtures({ malformed: opts.malformed });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-'));
  const config = { ...loadConfig({}), labsDir, dataDir };
  const db = openDb(':memory:');
  const events = new LabEvents();
  const ingest = createIngestService({ db, labsDir, events });
  ingest.rescan();
  let current = opts.now ?? new Date('2026-10-29T15:00:00Z');
  const ctx: AppContext = { config, db, events, ingest, now: () => current };
  const app = await buildApp(ctx, { clientDir: null });
  return { app, ctx, labsDir, dataDir, setNow: (d: Date) => { current = d; } };
}
