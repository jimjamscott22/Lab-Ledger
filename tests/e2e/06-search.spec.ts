import { expect, test } from '@playwright/test';

const SEARCH_LABEL = 'Search labs, journal notes and tickets';
const WAKE_LAB_LINK = '.results a[href="/labs/windows-wont-wake-from-sleep"]';

test('Ctrl+K opens search from any page and results link to the lab', async ({ page }) => {
  await page.goto('/labs');
  await page.keyboard.press('Control+k');
  await expect(page).toHaveURL(/\/search$/);
  const input = page.getByLabel(SEARCH_LABEL);
  await expect(input).toBeFocused();

  await input.fill('wake');
  await expect(page).toHaveURL(/\/search\?q=wake$/);
  // Other specs leave notes mentioning "wake", so assert on the lab result rather than a count.
  await expect(page.locator('p[role="status"]')).toContainText('for “wake”');
  await expect(page.locator('mark').first()).toHaveText(/wake/i);

  await expect(page.locator(WAKE_LAB_LINK)).toHaveText("Lab 07: PC Won't Wake From Sleep");
  await page.locator(WAKE_LAB_LINK).click();
  await expect(page).toHaveURL(/\/labs\/windows-wont-wake-from-sleep$/);
});

test('Ctrl+K on a lab page opens search instead of moving between steps', async ({ page }) => {
  await page.goto('/labs/ad-user-onboarding');
  await page.keyboard.press('Control+k');
  await expect(page).toHaveURL(/\/search$/);
});

test('a journal typed in the editor becomes searchable and opens on the journal tab', async ({ page }) => {
  await page.goto('/labs/gpo-drive-mapping');
  await page.getByRole('tab', { name: 'Journal' }).click();
  await page.getByLabel('Journal (Markdown)').fill('Root cause was a stale kerberos ticket on the laptop');
  await expect
    .poll(async () => (await (await page.request.get('/api/search?q=kerberos')).json()).length)
    .toBe(1);

  await page.goto('/search?q=kerberos');
  const result = page.locator('.results li');
  await expect(result).toHaveCount(1);
  await expect(result).toContainText('Journal');
  await expect(result.locator('mark')).toHaveText('kerberos');
  await result.getByRole('link').click();
  await expect(page).toHaveURL(/\/labs\/gpo-drive-mapping\?tab=journal$/);
  await expect(page.getByRole('tab', { name: 'Journal' })).toHaveAttribute('aria-selected', 'true');
});

test('a ticket write-up is searchable and opens on the ticket tab', async ({ page }) => {
  const fields = {
    ticketNumber: 'INC-4242', requester: 'Pat', issue: 'Shared drive missing', impact: '', troubleshootingSteps: '',
    rootCause: 'Expired ocelot certificate', resolution: '', timeToResolve: '', followUp: '',
  };
  expect((await page.request.put('/api/labs/intune-device-enrollment/ticket', { data: fields })).ok()).toBe(true);
  await page.goto('/search?q=ocelot');
  const result = page.locator('.results li');
  await expect(result).toHaveCount(1);
  await expect(result).toContainText('Ticket');
  await result.getByRole('link').click();
  await expect(page.getByRole('tab', { name: 'Ticket' })).toHaveAttribute('aria-selected', 'true');
});

test('hostile note content is shown as text and never executes', async ({ page }) => {
  const body = '<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script> marmot';
  expect(
    (
      await page.request.put('/api/labs/linux-file-permissions/journal', {
        data: { bodyMd: body, timeTakenMin: null, difficulty: null, confidence: null },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/search?q=marmot');
  const result = page.locator('.results li');
  await expect(result).toHaveCount(1);
  await expect(result).toContainText('<img src=x onerror="window.__xss=1">');
  await expect(result.locator('img, script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});

test('queries with search syntax are harmless', async ({ page }) => {
  await page.goto('/search');
  const input = page.getByLabel(SEARCH_LABEL);
  for (const q of ['"', 'AND OR NOT', 'NEAR(', 'a:b', "'; DROP TABLE labs; --"]) {
    await input.fill(q);
    await input.press('Enter');
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await input.fill('wake');
  await input.press('Enter');
  await expect(page.locator(WAKE_LAB_LINK)).toBeVisible();
});

test('Ctrl+K on the search page focuses and selects the query', async ({ page }) => {
  await page.goto('/search?q=wake');
  await page.getByRole('link', { name: 'Home' }).focus();
  await page.keyboard.press('Control+k');
  const input = page.getByLabel(SEARCH_LABEL);
  await expect(input).toBeFocused();
  await page.keyboard.type('sleep');
  await expect(input).toHaveValue('sleep');
});
