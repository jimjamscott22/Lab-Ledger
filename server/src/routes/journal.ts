import type { FastifyInstance } from 'fastify';
import { JournalBody } from '@lab-ledger/shared';
import type { AppContext } from '../app';
import * as repo from '../db/repo';

const SLUG_RE = /^[a-z0-9-]+$/;
const EMPTY = { bodyMd: '', timeTakenMin: null, difficulty: null, confidence: null, updatedAt: null };

export function registerJournalRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/labs/:slug/journal', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    if (!SLUG_RE.test(slug) || !repo.getLab(ctx.db, slug)) return reply.code(404).send({ error: 'Lab not found' });
    return repo.getJournal(ctx.db, slug) ?? EMPTY;
  });

  app.put('/api/labs/:slug/journal', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = JournalBody.parse(req.body);
    if (!SLUG_RE.test(slug) || !repo.getLab(ctx.db, slug)) return reply.code(404).send({ error: 'Lab not found' });
    return repo.putJournal(ctx.db, slug, body, ctx.now().toISOString());
  });
}
