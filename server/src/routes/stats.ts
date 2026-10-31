import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app';
import { buildStats } from '../stats';

export function registerStatsRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/stats', async () => buildStats(ctx.db, ctx.now(), ctx.config.timezone));
}
