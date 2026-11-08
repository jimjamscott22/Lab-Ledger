import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const SEARCH = 'Search labs, notes and tickets';

test('help opens by button or question mark, contains focus and pauses viewer shortcuts', async ({
  page,
}) => {
  await page.goto('/labs/ad-user-onboarding');
  const help = page.getByRole('button', { name: 'Help' });
  await help.click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Ctrl/Cmd + K');
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  const before = await (await page.request.get('/api/labs/ad-user-onboarding')).json();
  await page.keyboard.press('s');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await expect(page).toHaveURL(/\/labs\/ad-user-onboarding$/);
  const after = await (await page.request.get('/api/labs/ad-user-onboarding')).json();
  expect(after.state).toEqual(before.state);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(help).toBeFocused();
  await page.keyboard.press('?');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).not.toBeVisible();
});

test('help works inside the lab frame and ignores text input and modifiers', async ({ page }) => {
  await page.goto('/labs/ad-user-onboarding');
  const box = page.frameLocator('iframe[title^="Lab:"]').locator('input[type="checkbox"]').first();
  await box.focus();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box).toBeFocused();
  await page.goto('/labs');
  await page.getByLabel(SEARCH).focus();
  await page.keyboard.type('?');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByLabel(SEARCH)).toHaveValue('?');
  await page.getByRole('heading', { name: 'Labs', exact: true }).click();
  await page.keyboard.press('Control+Shift+/');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('help pauses practice shortcuts', async ({ page }) => {
  await page.goto('/practice');
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
  await page.keyboard.press('?');
  await page.keyboard.press('r');
  await page.keyboard.press('1');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
});

test('lab filters combine, survive reload, reset, and follow browser history', async ({ page }) => {
  await page.goto('/labs');
  const labs = await (await page.request.get('/api/labs')).json();
  const linux = labs.find((lab: { slug: string }) => lab.slug === 'linux-file-permissions');
  await page.getByRole('combobox', { name: 'Topic', exact: true }).selectOption('linux');
  await page.getByRole('combobox', { name: 'Tag', exact: true }).selectOption(linux.tags[0]);
  await page.getByLabel('From date').fill(linux.date);
  await page.getByLabel('To date').fill(linux.date);
  await expect(page.locator('.lab-list li')).toHaveCount(1);
  await expect(page.locator('.lab-tags')).toContainText(linux.tags[0]);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Topic', exact: true })).toHaveValue('linux');
  await expect(page.locator('.lab-list li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('.lab-list li')).toHaveCount(7);
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Topic', exact: true })).toHaveValue('linux');
  await expect(page.locator('.lab-list li')).toHaveCount(1);
  await page.goForward();
  await expect(page.locator('.lab-list li')).toHaveCount(7);
});

test('text filter searches notes, preserves typing focus, and cancels pending search on reset', async ({
  page,
}) => {
  await page.request.put('/api/labs/linux-file-permissions/journal', {
    data: {
      bodyMd: 'Filterable kumquat journal',
      timeTakenMin: null,
      difficulty: null,
      confidence: null,
    },
  });
  await page.goto('/labs');
  const input = page.getByLabel(SEARCH);
  await input.fill('kumquat');
  await expect(page.locator('.lab-list li')).toHaveCount(1);
  await expect(input).toBeFocused();
  await expect(page.locator('.lab-list li')).toContainText('Linux');
  await page.getByRole('combobox', { name: 'Notes', exact: true }).selectOption('no');
  await expect(page.getByText('No labs match these filters.', { exact: false })).toBeVisible();
  await input.fill('wake');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(input).toHaveValue('');
  await expect(page).toHaveURL(/\/labs$/);
  await expect(page.locator('.lab-list li')).toHaveCount(7);
  // Wait beyond the debounce to catch a stale search resurrecting after reset.
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/\/labs$/);
});

test('failed filter requests surface an error and recover after reset', async ({ page }) => {
  await page.goto('/labs?from=2026-11-07&to=2026-11-01');
  await expect(page.getByRole('alert')).toContainText('From date must be on or before to date');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('.lab-list li')).toHaveCount(7);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const theme of ['light', 'dark']) {
  test(`help is accessible and fits mobile (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/labs');
    await expect(page).toHaveTitle(/Lab/);
    await expect(page.getByRole('heading', { name: 'Labs', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('button', { name: 'Help' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `/tmp/lab-ledger-help-${theme}.png` });
  });
}

test('reset cancels an uncommitted query even when the URL has no filters', async ({ page }) => {
  await page.goto('/labs');
  const input = page.getByLabel(SEARCH);
  await input.fill('uncommitted');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(input).toHaveValue('');
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/\/labs$/);
  await expect(page.locator('.lab-list li')).toHaveCount(7);
});
