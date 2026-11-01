import { expect, test } from '@playwright/test';

test('practice deck reveals, rates, schedules, and filters questions', async ({ page }) => {
  await page.goto('/practice');
  await expect(page.getByRole('heading', { name: 'Interview practice' })).toBeVisible();
  await expect(page.getByText('21 due today', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Question 1 for AD User Onboarding/ })).toBeVisible();

  await page.keyboard.press('r');
  await expect(page.getByText('Answer 1.')).toBeVisible();
  await page.keyboard.press('3');
  await expect(page.getByText('20 due today', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Question 2 for AD User Onboarding/ })).toBeVisible();

  await page.getByLabel('Topic').selectOption('windows-troubleshooting');
  await expect(page.getByText('3 due today', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Question 1 for PC Won't Wake From Sleep/ }),
  ).toBeVisible();
});
