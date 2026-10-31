import { test, expect } from '@playwright/test';

test('backup downloads valid JSON and Markdown', async ({ page }) => {
  const json = await page.request.get('/api/backup');
  expect(json.status()).toBe(200);
  const body = await json.json();
  expect(body.version).toBe(1);
  expect(body.journals.length).toBeGreaterThan(0);
  const md = await page.request.get('/api/backup/markdown');
  expect(md.headers()['content-type']).toContain('text/markdown');
  expect(await md.text()).toContain('Mapped the drive');
});

test('restoring the backup into the same app keeps data identical', async ({ page }) => {
  const before = await (await page.request.get('/api/backup')).json();
  const res = await page.request.post('/api/restore', { data: before });
  expect(res.status()).toBe(200);
  const after = await (await page.request.get('/api/backup')).json();
  expect({ ...after, exportedAt: '' }).toEqual({ ...before, exportedAt: '' });
});
