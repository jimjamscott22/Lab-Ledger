import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

test('iframe is sandboxed without allow-scripts and raw HTML carries the CSP', async ({ page }) => {
  await page.goto('/labs/ad-user-onboarding');
  const sandbox = await page.locator('iframe[title^="Lab:"]').getAttribute('sandbox');
  expect(sandbox).toBe('allow-same-origin');
  expect(sandbox).not.toContain('allow-scripts');
  const raw = await page.request.get('/api/labs/ad-user-onboarding/raw');
  expect(raw.headers()['content-security-policy']).toBe(
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
  );
});

test('no external network requests on any page', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (!['http:', 'https:'].includes(u.protocol)) return;
    if (u.origin !== 'http://127.0.0.1:4318') external.push(req.url());
  });
  for (const url of ['/', '/labs', '/labs/ad-user-onboarding', '/labs/windows-wont-wake-from-sleep', '/settings']) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
  }
  expect(external).toEqual([]);
});

test('built client assets reference no external origins', () => {
  const dist = path.resolve('client/dist');
  const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  expect(index).not.toMatch(/<(script|link)[^>]+(src|href)=["']https?:/i);
  const assets = path.join(dist, 'assets');
  for (const f of fs.readdirSync(assets)) {
    const text = fs.readFileSync(path.join(assets, f), 'utf8');
    if (f.endsWith('.css')) expect(text).not.toMatch(/url\(\s*["']?https?:/i);
    if (f.endsWith('.js')) {
      expect(text).not.toMatch(/fetch\(\s*["'`]https?:/);
      expect(text).not.toMatch(/new\s+(WebSocket|EventSource)\(\s*["'`](https?|wss?):/);
    }
  }
});
