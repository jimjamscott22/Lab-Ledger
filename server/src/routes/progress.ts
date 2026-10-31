import type { FastifyInstance } from 'fastify';
import { StatusBody, StepToggleBody } from '@lab-ledger/shared';
import type { AppContext } from '../app';
import * as repo from '../db/repo';
import { dayInTz } from '../lib/time';

const SLUG_RE = /^[a-z0-9-]+$/;

export function registerProgressRoutes(app: FastifyInstance, ctx: AppContext): void {
  const recordActivity = (slug: string, kind: 'step' | 'completed' | 'skipped') => {
    const d = ctx.now();
    repo.addActivity(ctx.db, dayInTz(d, ctx.config.timezone), slug, kind, d.toISOString());
  };

  app.put('/api/labs/:slug/status', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = StatusBody.parse(req.body);
    if (!SLUG_RE.test(slug) || !repo.getLab(ctx.db, slug)) return reply.code(404).send({ error: 'Lab not found' });
    const prev = repo.getState(ctx.db, slug).status;
    const state = repo.setStatus(ctx.db, slug, body.status, ctx.now().toISOString());
    if (body.status !== prev) {
      if (body.status === 'completed') recordActivity(slug, 'completed');
      if (body.status === 'skipped') recordActivity(slug, 'skipped');
    }
    return state;
  });

  app.get('/api/labs/:slug/steps', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    if (!SLUG_RE.test(slug) || !repo.getLab(ctx.db, slug)) return reply.code(404).send({ error: 'Lab not found' });
    return { checked: repo.getChecked(ctx.db, slug) };
  });

  app.put('/api/labs/:slug/steps', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = StepToggleBody.parse(req.body);
    const lab = SLUG_RE.test(slug) ? repo.getLab(ctx.db, slug) : null;
    if (!lab) return reply.code(404).send({ error: 'Lab not found' });
    const step = lab.steps[body.index];
    if (!step) return reply.code(400).send({ error: 'Step index out of range' });

    const nowIso = ctx.now().toISOString();
    repo.setStep(ctx.db, slug, body.index, step.textHash, body.checked, nowIso);
    if (body.checked) {
      recordActivity(slug, 'step');
      if (repo.getState(ctx.db, slug).status === 'not_started') repo.setStatus(ctx.db, slug, 'in_progress', nowIso);
    }
    const checked = repo.getChecked(ctx.db, slug);
    return { checked, status: repo.getState(ctx.db, slug).status, allChecked: lab.steps.length > 0 && checked.length === lab.steps.length };
  });
}
