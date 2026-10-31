import path from 'node:path';
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDb } from './db/open';
import { LabEvents } from './events';
import { createIngestService } from './ingest/service';
import { watchLabs } from './ingest/watch';
import { startScheduler } from './scheduler';

const config = loadConfig();
const db = openDb(path.join(config.dataDir, 'app.db'));
const events = new LabEvents();
const ingest = createIngestService({ db, labsDir: config.labsDir, events });

const first = ingest.rescan();
first.warnings.forEach((w) => console.warn(w));

const watcher = watchLabs({
  labsDir: config.labsDir,
  stabilityMs: config.watchStabilityMs,
  onChange: () => ingest.rescan().warnings.forEach((w) => console.warn(w)),
});
const stopScheduler = startScheduler(() => ingest.rescan(), config.timezone);

const clientDir = path.resolve(import.meta.dirname, '../../client/dist');
const app = await buildApp({ config, db, events, ingest, now: () => new Date() }, { clientDir });

const shutdown = async () => {
  stopScheduler();
  await watcher.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
console.log(`Lab Dashboard API on http://${config.host}:${config.port} (labs: ${config.labsDir}, data: ${config.dataDir})`);
