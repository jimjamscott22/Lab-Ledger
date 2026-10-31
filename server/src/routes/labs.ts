import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { LabDetail } from '@lab-ledger/shared';
import type { AppContext } from '../app';
import * as repo from '../db/repo';
import { LAB_FILE_RE } from '../ingest/parse';

const SLUG_RE = /^[a-z0-9-]+$/;
export const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

export function registerLabRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/labs', async (req) => {
    const q = req.query as { status?: string; topic?: string; q?: string };
    const needle = q.q?.trim().toLowerCase();
    return repo.listSummaries(ctx.db).filter(
      (l) =>
        (!q.status || l.status === q.status) &&
        (!q.topic || (l.topics as string[]).includes(q.topic)) &&
        (!needle || `${l.title} ${l.topicLabel ?? ''} ${l.slug}`.toLowerCase().includes(needle)),
    );
  });

  app.get('/api/labs/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const lab = SLUG_RE.test(slug) ? repo.getLab(ctx.db, slug) : null;
    if (!lab) return reply.code(404).send({ error: 'Lab not found' });
    const all = repo.listLabs(ctx.db);
    const i = all.findIndex((l) => l.slug === slug);
    const detail: LabDetail = {
      lab,
      state: repo.getState(ctx.db, slug),
      checked: repo.getChecked(ctx.db, slug),
      journal: repo.getJournal(ctx.db, slug),
      neighbors: { prev: all[i - 1]?.slug ?? null, next: all[i + 1]?.slug ?? null },
    };
    return detail;
  });

  app.get('/api/labs/:slug/raw', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const lab = SLUG_RE.test(slug) ? repo.getLab(ctx.db, slug) : null;
    if (!lab || lab.missingFile || !LAB_FILE_RE.test(lab.fileName)) return reply.code(404).send({ error: 'Lab file not found' });
    const file = path.join(ctx.config.labsDir, lab.fileName);
    if (!fs.existsSync(file)) return reply.code(404).send({ error: 'Lab file not found' });
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Content-Security-Policy', CSP)
      .header('X-Content-Type-Options', 'nosniff')
      .send(fs.readFileSync(file));
  });

  app.post('/api/labs/rescan', async () => ctx.ingest.rescan());

  app.get('/api/events', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    const off = ctx.events.subscribe((e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => {
      clearInterval(ping);
      off();
    });
  });
}
