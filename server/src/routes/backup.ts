import type { FastifyInstance } from 'fastify';
import { BackupSchema } from '@lab-ledger/shared';
import type { AppContext } from '../app';
import { backupToMarkdown, exportBackup, importBackup } from '../backup';

export function registerBackupRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/backup', async (_req, reply) => {
    const now = ctx.now();
    return reply
      .header('Content-Disposition', `attachment; filename="lab-backup-${now.toISOString().slice(0, 10)}.json"`)
      .send(exportBackup(ctx.db, ctx.config.dataDir, now));
  });

  app.get('/api/backup/markdown', async (_req, reply) =>
    reply
      .header('Content-Type', 'text/markdown; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="lab-notes.md"')
      .send(backupToMarkdown(ctx.db)),
  );

  app.post('/api/restore', { bodyLimit: 256 * 1024 * 1024 }, async (req) => {
    const payload = BackupSchema.parse(req.body);
    importBackup(ctx.db, ctx.config.dataDir, payload);
    return { ok: true };
  });
}
