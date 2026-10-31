import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import type { Config } from './config';
import type { Db } from './db/open';
import type { LabEvents } from './events';
import type { IngestService } from './ingest/service';
import { registerLabRoutes } from './routes/labs';
import { registerProgressRoutes } from './routes/progress';

export interface AppContext {
  config: Config;
  db: Db;
  events: LabEvents;
  ingest: IngestService;
  now: () => Date;
}

export async function buildApp(ctx: AppContext, opts: { clientDir?: string | null } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', issues: error.issues });
    }
    return reply.send(error);
  });

  registerLabRoutes(app, ctx);
  registerProgressRoutes(app, ctx);

  if (opts.clientDir && fs.existsSync(path.join(opts.clientDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: opts.clientDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Not found' });
    });
  }
  return app;
}
