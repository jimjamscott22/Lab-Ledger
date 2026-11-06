import type { FastifyInstance } from 'fastify';
import { SearchQuery } from '@lab-ledger/shared';
import type { AppContext } from '../app';
import { searchAll } from '../search';

export function registerSearchRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/search', async (req) => {
    const { q, limit } = SearchQuery.parse(req.query);
    return searchAll(ctx.db, q, limit);
  });
}
