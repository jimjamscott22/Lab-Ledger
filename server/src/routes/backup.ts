import type { FastifyInstance } from 'fastify';
import { BackupSchema } from '@lab-ledger/shared';
import type { AppContext } from '../app';
import { backupToMarkdown, exportBackup, importBackup, BackupValidationError } from '../backup';

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

  app.post('/api/restore', { bodyLimit: 256 * 1024 * 1024 }, async (req, reply) => {
    const payload = BackupSchema.parse(req.body);
    try {
      importBackup(ctx.db, ctx.config.dataDir, payload);
    } catch (err) {
      if (err instanceof BackupValidationError) return reply.code(400).send({ error: err.message });
      throw err;
    }
    return { ok: true };
  });
}
