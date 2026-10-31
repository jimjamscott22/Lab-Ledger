import { test, expect } from '@playwright/test';

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('step progress persists across reload and syncs with the iframe', async ({ page }) => {
  await page.goto('/labs/ad-user-onboarding');
  await expect(page.getByText('0/9 steps')).toBeVisible();

  await page.getByRole('checkbox', { name: /Do 1 for ad-user-onboarding/ }).check();
  await expect(page.getByText('1/9 steps')).toBeVisible();
  const frame = page.frameLocator('iframe[title^="Lab:"]');
  await expect(frame.locator('input[type="checkbox"]').first()).toBeChecked();

  await frame.locator('input[type="checkbox"]').nth(1).check();
  await expect(page.getByText('2/9 steps')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Do 2 for ad-user-onboarding/ })).toBeChecked();

  await page.reload();
  await expect(page.getByText('2/9 steps')).toBeVisible();
  await expect(frame.locator('input[type="checkbox"]').first()).toBeChecked();
  await expect(page.getByLabel('Status')).toHaveValue('in_progress');
});

test('arrow keys navigate and the ends disable their buttons', async ({ page }) => {
  await page.goto('/labs/ad-user-onboarding');
  await expect(page.getByRole('button', { name: 'Previous lab' })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/labs\/gpo-drive-mapping$/);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/\/labs\/ad-user-onboarding$/);

  await page.goto('/labs/windows-wont-wake-from-sleep');
  await expect(page.getByRole('button', { name: 'Next lab' })).toBeDisabled();
  await expect(page.getByText('0/42 steps')).toBeVisible();
});

test('journal autosaves and a pasted screenshot renders after reload', async ({ page }) => {
  await page.goto('/labs/gpo-drive-mapping');
  await page.getByRole('tab', { name: 'Journal' }).click();
  const box = page.getByLabel('Journal (Markdown)');
  await box.fill('## What I did\nMapped the drive.');
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({ timeout: 5000 });

  const uploaded = page.waitForResponse((r) => r.url().includes('/attachments') && r.request().method() === 'POST');
  await page.evaluate(async (b64) => {
    const ta = document.querySelector('textarea')!;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'x.png', { type: 'image/png' }));
    ta.focus();
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG_B64);
  expect((await uploaded).status()).toBe(200);
  await expect(box).toHaveValue(/!\[screenshot\]\(\/api\/attachments\/[0-9a-f-]{36}\)/);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({ timeout: 5000 });

  await page.reload();
  await page.getByRole('tab', { name: 'Journal' }).click();
  await expect(page.getByLabel('Journal (Markdown)')).toHaveValue(/Mapped the drive/);
  const img = page.locator('.journal-preview img');
  await expect(img).toBeVisible();
  const src = await img.getAttribute('src');
  expect((await page.request.get(src!)).status()).toBe(200);
});

test('completing every step offers to mark the lab completed', async ({ page }) => {
  await page.goto('/labs/ad-user-onboarding');
  const boxes = page.locator('ol[aria-label="Steps"] input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await page.getByRole('button', { name: 'Mark completed' }).click();
  await expect(page.getByLabel('Status')).toHaveValue('completed');
  await page.goto('/');
  await expect(page.getByText('1/7', { exact: true })).toBeVisible();
});
