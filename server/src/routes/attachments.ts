import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type { AppContext } from '../app';
import * as repo from '../db/repo';

const SLUG_RE = /^[a-z0-9-]+$/;
const ID_RE = /^[0-9a-f-]{36}$/;
export const MAX_BYTES = 10 * 1024 * 1024;

export function sniffImage(b: Buffer): { mime: 'image/png' | 'image/jpeg' | 'image/webp'; ext: 'png' | 'jpg' | 'webp' } | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export async function registerAttachmentRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  await app.register(multipart, { limits: { fileSize: MAX_BYTES, files: 1 } });

  app.post('/api/labs/:slug/attachments', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    if (!SLUG_RE.test(slug) || !repo.getLab(ctx.db, slug)) return reply.code(404).send({ error: 'Lab not found' });
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: 'Missing file' });
    let buf: Buffer;
    try {
      buf = await part.toBuffer();
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : undefined;
      if (code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({ error: 'File too large (max 10 MB)' });
      }
      throw err;
    }
    if (part.file.truncated) return reply.code(413).send({ error: 'File too large (max 10 MB)' });
    const kind = sniffImage(buf);
    if (!kind) return reply.code(415).send({ error: 'Only png, jpg and webp images are allowed' });

    const id = randomUUID();
    const fileName = `${id}.${kind.ext}`;
    const dir = path.join(ctx.config.dataDir, 'attachments', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), buf);
    repo.insertAttachment(ctx.db, { id, slug, fileName, mime: kind.mime, bytes: buf.length, createdAt: ctx.now().toISOString() });
    return { id, url: `/api/attachments/${id}` };
  });

  app.get('/api/attachments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = ID_RE.test(id) ? repo.getAttachment(ctx.db, id) : null;
    if (!row) return reply.code(404).send({ error: 'Not found' });
    const file = path.join(ctx.config.dataDir, 'attachments', row.slug, row.fileName);
    if (!fs.existsSync(file)) return reply.code(404).send({ error: 'Not found' });
    return reply.header('Content-Type', row.mime).header('X-Content-Type-Options', 'nosniff').header('Content-Disposition', 'inline').send(fs.readFileSync(file));
  });
}
