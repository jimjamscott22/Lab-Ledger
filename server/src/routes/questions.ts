import type { FastifyInstance } from 'fastify';
import { QuestionReviewBody, TOPICS, type Topic } from '@lab-ledger/shared';
import { z } from 'zod';
import type { AppContext } from '../app';
import * as repo from '../db/repo';
import { dayInTz } from '../lib/time';
import { listDueQuestions, reviewQuestion } from '../questions';

const SLUG_RE = /^[a-z0-9-]+$/;
const TopicQuery = z.object({
  topic: z.enum([...TOPICS, 'other']).optional(),
});

export function registerQuestionRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/questions/due', async (req) => {
    const { topic } = TopicQuery.parse(req.query);
    return listDueQuestions(ctx.db, dayInTz(ctx.now(), ctx.config.timezone), topic as Topic | undefined);
  });

  app.post('/api/questions/:slug/:index/review', async (req, reply) => {
    const { slug, index: rawIndex } = req.params as { slug: string; index: string };
    const index = /^\d+$/.test(rawIndex) ? Number(rawIndex) : -1;
    const { rating } = QuestionReviewBody.parse(req.body);
    const lab = SLUG_RE.test(slug) ? repo.getLab(ctx.db, slug) : null;
    if (!lab || !lab.questions.some((question) => question.index === index)) {
      return reply.code(404).send({ error: 'Question not found' });
    }
    const now = ctx.now();
    return reviewQuestion(
      ctx.db,
      slug,
      index,
      rating,
      now.toISOString(),
      dayInTz(now, ctx.config.timezone),
    );
  });
}
