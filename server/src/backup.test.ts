import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
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
    await app.inject({
      method: 'PUT',
      url: '/api/labs/ad-user-onboarding/ticket',
      payload: {
        ticketNumber: 'INC-1',
        requester: 'Jamie',
        issue: 'Account needed',
        impact: 'New hire blocked',
        troubleshootingSteps: 'Checked request',
        rootCause: 'No account',
        resolution: 'Created account',
        timeToResolve: '20 minutes',
        followUp: 'Confirm login',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/questions/ad-user-onboarding/0/review',
      payload: { rating: 'good' },
    });
    const boundary = 'b';
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });

    const original = exportBackup(ctx.db, dataDir, new Date('2026-10-29T00:00:00Z'));
    expect(original.attachments).toHaveLength(1);
    expect(original.tickets).toHaveLength(1);
    expect(original.questionReviews).toHaveLength(1);

    const freshDb = openDb(':memory:');
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-'));
    importBackup(freshDb, freshDir, JSON.parse(JSON.stringify(original)));
    const restored = exportBackup(freshDb, freshDir, new Date('2026-10-29T00:00:00Z'));
    expect(restored).toEqual(original);
    const files = fs.readdirSync(path.join(freshDir, 'attachments', 'ad-user-onboarding'));
    expect(files).toHaveLength(1);
    expect(fs.readFileSync(path.join(freshDir, 'attachments', 'ad-user-onboarding', files[0])).equals(PNG)).toBe(true);
  });

  it('keeps the old database and attachments when staging a restore fails', async () => {
    const { app, ctx, dataDir } = await makeTestApp();
    await app.inject({ method: 'PUT', url: '/api/labs/ad-user-onboarding/journal', payload: { bodyMd: 'original', timeTakenMin: 1, difficulty: 1, confidence: 1 } });
    const boundary = 'b';
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
    const before = exportBackup(ctx.db, dataDir, new Date('2026-10-29T00:00:00Z'));
    const keptFiles = fs.readdirSync(path.join(dataDir, 'attachments', 'ad-user-onboarding'));

    const replacement = { ...before, journals: [{ ...before.journals[0], bodyMd: 'replacement' }],
      attachments: [
        { ...before.attachments[0], id: '11111111-1111-1111-1111-111111111111', fileName: '11111111-1111-1111-1111-111111111111.png' },
        { ...before.attachments[0], id: '22222222-2222-2222-2222-222222222222', fileName: '22222222-2222-2222-2222-222222222222.png' },
      ] };

    const realWrite = fs.writeFileSync;
    let calls = 0;
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(((...args: Parameters<typeof fs.writeFileSync>) => {
      if (++calls === 2) throw new Error('ENOSPC: no space left on device');
      return realWrite(...args);
    }) as typeof fs.writeFileSync);
    try {
      expect(() => importBackup(ctx.db, dataDir, replacement)).toThrow(/ENOSPC/);
    } finally {
      spy.mockRestore();
    }

    expect(exportBackup(ctx.db, dataDir, new Date('2026-10-29T00:00:00Z'))).toEqual(before);
    expect(fs.readdirSync(path.join(dataDir, 'attachments', 'ad-user-onboarding'))).toEqual(keptFiles);
    expect(fs.existsSync(path.join(dataDir, 'attachments.restore-new'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'attachments.restore-old'))).toBe(false);
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
