import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { makeTestApp } from './testing-app';
import { openDb } from './db/open';
import { exportBackup, importBackup, backupToMarkdown, reconcileRestore } from './backup';

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

  it('rejects attachments whose bytes do not match their metadata, leaving data untouched', async () => {
    const { app, ctx, dataDir } = await makeTestApp();
    const boundary = 'b';
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
    const before = exportBackup(ctx.db, dataDir, new Date('2026-10-29T00:00:00Z'));
    const keptFiles = fs.readdirSync(path.join(dataDir, 'attachments', 'ad-user-onboarding'));

    const wrongLength = { ...before, attachments: [{ ...before.attachments[0], bytes: before.attachments[0].bytes + 1 }] };
    expect(() => importBackup(ctx.db, dataDir, wrongLength)).toThrow(/attachment/i);

    const wrongType = { ...before, attachments: [{ ...before.attachments[0], mime: 'image/jpeg' as const, fileName: before.attachments[0].fileName.replace(/\.png$/, '.jpg') }] };
    expect(() => importBackup(ctx.db, dataDir, wrongType)).toThrow(/attachment/i);

    expect(exportBackup(ctx.db, dataDir, new Date('2026-10-29T00:00:00Z'))).toEqual(before);
    expect(fs.readdirSync(path.join(dataDir, 'attachments', 'ad-user-onboarding'))).toEqual(keptFiles);
  });

  it('rejects a mismatched attachment with 400 via the HTTP API', async () => {
    const { app, ctx, dataDir } = await makeTestApp();
    const boundary = 'b';
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
    const before = exportBackup(ctx.db, dataDir, new Date('2026-10-29T00:00:00Z'));
    const bad = { ...before, attachments: [{ ...before.attachments[0], bytes: 1 }] };
    const res = await app.inject({ method: 'POST', url: '/api/restore', payload: bad });
    expect(res.statusCode).toBe(400);
  });

  it('restores a ~5 MiB attachment (the app’s own export size class)', () => {
    const big = Buffer.alloc(5 * 1024 * 1024, 7);
    PNG.copy(big, 0);
    const db = openDb(':memory:');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'big-restore-'));
    const backup: Parameters<typeof importBackup>[2] = {
      version: 1,
      exportedAt: '2026-10-29T00:00:00Z',
      labState: [],
      stepProgress: [],
      journals: [],
      tickets: [],
      questionReviews: [],
      activity: [],
      attachments: [
        {
          id: '33333333-3333-3333-3333-333333333333',
          slug: 'ad-user-onboarding',
          fileName: '33333333-3333-3333-3333-333333333333.png',
          mime: 'image/png',
          bytes: big.length,
          createdAt: '2026-10-29T00:00:00Z',
          dataBase64: big.toString('base64'),
        },
      ],
    };
    expect(() => importBackup(db, dir, backup)).not.toThrow();
    const written = fs.readFileSync(path.join(dir, 'attachments', 'ad-user-onboarding', '33333333-3333-3333-3333-333333333333.png'));
    expect(written.equals(big)).toBe(true);
  });

  it('survives a crash between the database commit and the attachment swap', async () => {
    const { app, ctx, dataDir } = await makeTestApp();
    const boundary = 'b';
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), PNG, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    await app.inject({ method: 'POST', url: '/api/labs/ad-user-onboarding/attachments', payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
    const before = exportBackup(ctx.db, dataDir, new Date('2026-10-29T00:00:00Z'));

    const newPng = Buffer.concat([PNG, Buffer.from([1, 2, 3])]);
    const replacement = {
      ...before,
      journals: [{ slug: 'ad-user-onboarding', bodyMd: 'restored', timeTakenMin: 1, difficulty: 1, confidence: 1, updatedAt: null }],
      attachments: [
        {
          ...before.attachments[0],
          id: '44444444-4444-4444-4444-444444444444',
          fileName: '44444444-4444-4444-4444-444444444444.png',
          bytes: newPng.length,
          dataBase64: newPng.toString('base64'),
        },
      ],
    };

    // Kill the process (simulated) at the first rename after the DB commit:
    // the transaction has committed, but the staged files are not yet live.
    const realRename = fs.renameSync;
    let crashed = false;
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation(((...args: Parameters<typeof fs.renameSync>) => {
      if (!crashed) {
        crashed = true;
        throw new Error('simulated crash after commit');
      }
      return realRename(...args);
    }) as typeof fs.renameSync);
    try {
      expect(() => importBackup(ctx.db, dataDir, replacement)).toThrow(/simulated crash/);
    } finally {
      spy.mockRestore();
    }

    // The commit and its recovery record landed together: startup recovery
    // must finish the swap, not delete the restored attachments.
    expect(ctx.db.prepare('SELECT phase FROM restore_state WHERE id = 1').get()).toEqual({ phase: 'files-pending' });
    reconcileRestore(ctx.db, dataDir);

    const restored = exportBackup(ctx.db, dataDir, new Date('2026-10-29T00:00:00Z'));
    expect(restored.journals[0].bodyMd).toBe('restored');
    expect(restored.attachments).toHaveLength(1);
    expect(restored.attachments[0].id).toBe('44444444-4444-4444-4444-444444444444');
    expect(Buffer.from(restored.attachments[0].dataBase64, 'base64').equals(newPng)).toBe(true);
    expect(ctx.db.prepare('SELECT phase FROM restore_state WHERE id = 1').get()).toBeUndefined();
    expect(fs.existsSync(path.join(dataDir, 'attachments.restore-new'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'attachments.restore-old'))).toBe(false);
  });

  it('discards staged files from a restore interrupted before the database commit', () => {
    const db = openDb(':memory:');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-'));
    const root = path.join(dir, 'attachments');
    const staging = path.join(dir, 'attachments.restore-new');
    fs.mkdirSync(path.join(root, 'lab-a'), { recursive: true });
    fs.writeFileSync(path.join(root, 'lab-a', 'old.png'), 'old');
    fs.mkdirSync(path.join(staging, 'lab-a'), { recursive: true });
    fs.writeFileSync(path.join(staging, 'lab-a', 'new.png'), 'new');

    reconcileRestore(db, dir);

    expect(fs.readFileSync(path.join(root, 'lab-a', 'old.png'), 'utf8')).toBe('old');
    expect(fs.existsSync(staging)).toBe(false);
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
