import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const LAB = `<html><head><title>Lab 08: Toast Test</title></head><body><h1>Toast Test</h1>
<h2>Steps</h2><div><label><input type="checkbox"> one</label></div><div><label><input type="checkbox"> two</label></div></body></html>`;

test('a new lab appears within 5s without reload, with a toast', async ({ page }) => {
  await page.goto('/labs');
  await expect(page.locator('.lab-card')).toHaveCount(7);

  const dir = path.resolve('.e2e/labs');
  fs.appendFileSync(path.join(dir, 'lab-log.txt'), '2026-10-30 | Lab 08 | Intune enrollment | toast-test\n');
  fs.writeFileSync(path.join(dir, '2026-10-30-toast-test.html'), LAB);

  await expect(page.getByRole('status').filter({ hasText: 'New lab: Toast Test' })).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.lab-card')).toHaveCount(8, { timeout: 5000 });
  await expect(page.locator('.lab-card').first()).toContainText('Toast Test');
});
