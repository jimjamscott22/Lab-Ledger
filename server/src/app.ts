import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { z, ZodError } from 'zod';
import { authCookie, presentedToken, tokensMatch } from './auth';
import type { Config } from './config';
import type { Db } from './db/open';
import type { LabEvents } from './events';
import type { IngestService } from './ingest/service';
import { registerLabRoutes } from './routes/labs';
import { registerProgressRoutes } from './routes/progress';
import { registerJournalRoutes } from './routes/journal';
import { registerAttachmentRoutes } from './routes/attachments';
import { registerStatsRoutes } from './routes/stats';
import { registerBackupRoutes } from './routes/backup';
import { registerTicketRoutes } from './routes/ticket';
import { registerQuestionRoutes } from './routes/questions';
import { registerSearchRoutes } from './routes/search';

export interface AppContext {
  config: Config;
  db: Db;
  events: LabEvents;
  ingest: IngestService;
  now: () => Date;
}

const AuthBody = z.object({ token: z.string().min(1).max(500) });

export async function buildApp(
  ctx: AppContext,
  opts: { clientDir?: string | null } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const authToken = ctx.config.authToken;

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', issues: error.issues });
    }
    return reply.send(error);
  });

  if (authToken) {
    app.addHook('onRequest', async (req, reply) => {
      const url = req.url.split('?')[0];
      if (!url.startsWith('/api/') || url === '/api/auth') return;
      const presented = presentedToken(req.headers.authorization, req.headers.cookie);
      if (presented && tokensMatch(presented, authToken)) return;
      return reply.code(401).send({ error: 'Unauthorized' });
    });
  }

  app.get('/api/auth', async (req) => {
    const presented = presentedToken(req.headers.authorization, req.headers.cookie);
    return {
      required: Boolean(authToken),
      authenticated: !authToken || Boolean(presented && tokensMatch(presented, authToken)),
    };
  });

  app.post('/api/auth', async (req, reply) => {
    if (!authToken) return { ok: true };
    const body = AuthBody.parse(req.body);
    if (!tokensMatch(body.token, authToken)) return reply.code(401).send({ error: 'Unauthorized' });
    return reply.header('set-cookie', authCookie(body.token)).send({ ok: true });
  });

  registerLabRoutes(app, ctx);
  registerProgressRoutes(app, ctx);
  registerJournalRoutes(app, ctx);
  registerTicketRoutes(app, ctx);
  registerQuestionRoutes(app, ctx);
  registerSearchRoutes(app, ctx);
  await registerAttachmentRoutes(app, ctx);
  registerStatsRoutes(app, ctx);
  registerBackupRoutes(app, ctx);

  if (opts.clientDir && fs.existsSync(path.join(opts.clientDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: opts.clientDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Not found' });
    });
  }
  return app;
}
