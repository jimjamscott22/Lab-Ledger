import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { makeTestApp } from './testing-app';
import { openDb } from './db/open';
import { exportBackup, importBackup, backupToMarkdown } from './backup';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 7)]);

describe('backup', () => {
  it('round-trips into a fresh DB and data dir identically', async () => {
    const { app, ctx, dataDir } = await makeTestApp();
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/steps', payload: { index: 0, checked: true } });
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/status', payload: { status: 'completed' } });
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/journal', payload: { bodyMd: 'notes ![x](/api/attachments/1)', timeTakenMin: 10, difficulty: 2, confidence: 5 } });
    const boundary = 'b';
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });

    const original = exportBackup(ctx.db, dataDir, new Date('2026-10-29T00:00:00Z'));
    expect(original.attachments).toHaveLength(1);

    const freshDb = openDb(':memory:');
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-'));
    importBackup(freshDb, freshDir, JSON.parse(JSON.stringify(original)));
    const restored = exportBackup(freshDb, freshDir, new Date('2026-10-29T00:00:00Z'));
    expect(restored).toEqual(original);
    const files = fs.readdirSync(path.join(freshDir, 'attachments', 'ad-user-onboarding'));
    expect(files).toHaveLength(1);
    expect(fs.readFileSync(path.join(freshDir, 'attachments', 'ad-user-onboarding', files[0])).equals(PNG)).toBe(true);
  });

  it('restore via the HTTP API validates input', async () => {
    const { app } = await makeTestApp();
    expect((await app.inject({ method: 'POST', url: '/api/restore', payload: { version: 2 } })).statusCode).toBe(400);
    const evil = { version: 1, exportedAt: 'x', labState: [], stepProgress: [], journals: [], activity: [],
      attachments: [{ id: '../../x', slug: 'a', fileName: 'x.png', mime: 'image/png', bytes: 1, createdAt: 'x', dataBase64: 'AA==' }] };
    expect((await app.inject({ method: 'POST', url: '/api/restore', payload: evil })).statusCode).toBe(400);
  });

  it('serves JSON and Markdown downloads', async () => {
    const { app } = await makeTestApp();
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/journal', payload: { bodyMd: 'my notes', timeTakenMin: 5, difficulty: 1, confidence: 2 } });
    const json = await app.inject('/api/backup');
    expect(json.json()).toMatchObject({ version: 1 });
    expect(json.headers['content-disposition']).toMatch(/attachment; filename="lab-backup-.*\.json"/);
    const md = await app.inject('/api/backup/markdown');
    expect(md.headers['content-type']).toMatch(/text\/markdown/);
    expect(md.body).toContain('Lab 01');
    expect(md.body).toContain('my notes');
  });

  it('markdown skips labs without notes', async () => {
    const { ctx } = await makeTestApp();
    expect(backupToMarkdown(ctx.db)).not.toContain('Lab 01');
  });
});
