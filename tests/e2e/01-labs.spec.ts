import { test, expect } from '@playwright/test';

test('lists the 7 labs newest first with correct titles', async ({ page }) => {
  await page.goto('/labs');
  const cards = page.locator('.lab-card');
  await expect(cards).toHaveCount(7);
  await expect(cards.first()).toContainText("PC Won't Wake From Sleep");
  await expect(cards.first()).toContainText('Lab 07');
  await expect(cards.last()).toContainText('AD User Onboarding');
  await expect(cards.last()).toContainText('Lab 01');
  await expect(cards.first()).toContainText('0/42');
  await expect(cards.last()).toContainText('0/9');
});

test('home shows zeroed stats and 12 topics', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('0/7', { exact: true })).toBeVisible();
  await expect(page.locator('ul[aria-label="Topic coverage"] > li')).toHaveCount(12);
  await expect(page.getByRole('link', { name: 'Open' })).toBeVisible();
});
