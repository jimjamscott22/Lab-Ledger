import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { LabDetail } from '@lab-ledger/shared';

const LAB = '/labs/ad-user-onboarding';

test('sections preserves source order, supports contents links and interview disclosure', async ({
  page,
}) => {
  const detail = (await (await page.request.get(`/api${LAB}`)).json()) as LabDetail;
  await page.goto(LAB);
  await page.getByRole('tab', { name: 'Sections', exact: true }).click();
  await expect(page).toHaveURL(/view=sections/);
  const reader = page.locator('.section-reader');
  await expect(reader.locator(':scope > section > h2')).toHaveText(
    detail.lab.sections.map((s) => s.heading),
  );
  await expect(reader.getByRole('checkbox')).toHaveCount(0);
  const lastLink = reader.getByRole('navigation').getByRole('link').last();
  const target = (await lastLink.getAttribute('href'))!;
  await lastLink.click();
  await expect(page.locator(target)).toBeFocused();
  const answer = reader.locator('details').first();
  await answer.locator('summary').click();
  await expect(answer).toHaveAttribute('open', '');
  await expect(answer).toContainText(detail.lab.questions[0].question);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Sections', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('view tabs support keyboard and history without invoking lab navigation', async ({ page }) => {
  await page.goto(LAB);
  await page.getByRole('tab', { name: 'Original', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Sections', exact: true })).toBeFocused();
  await expect(page).toHaveURL(`${LAB}?view=sections`);
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Original', exact: true })).toBeFocused();
  await expect(page).toHaveURL(LAB);
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Sections', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Next lab', exact: true }).click();
  await expect(page).toHaveURL('/labs/gpo-drive-mapping?view=sections');
  await expect(page.locator('.section-reader')).toContainText('Reading view');
});

test('switching views retains progress and the journal editor', async ({ page }) => {
  await page.goto(LAB);
  const step = page.locator('ol[aria-label="Steps"] input').first();
  const original = await step.isChecked();
  await step.setChecked(!original);
  await page.getByRole('tab', { name: 'Sections', exact: true }).click();
  await expect(step).toBeChecked({ checked: !original });
  await page.getByRole('tab', { name: 'Journal', exact: true }).click();
  await page.getByLabel('Journal (Markdown)').fill('Sections view preserves my draft');
  await page.getByRole('tab', { name: 'Original', exact: true }).click();
  await expect(page.getByLabel('Journal (Markdown)')).toHaveValue(
    'Sections view preserves my draft',
  );
  await expect(
    page.frameLocator('iframe[title^="Lab:"]').locator('input[type="checkbox"]').first(),
  ).toBeChecked({ checked: !original });
  await page.reload();
  await expect(page.locator('ol[aria-label="Steps"] input').first()).toBeChecked({
    checked: !original,
  });
});

test('unparsed sections explain the fallback and retain the original lab', async ({ page }) => {
  await page.route(`**/api${LAB}`, async (route) => {
    const response = await route.fetch();
    const detail = (await response.json()) as LabDetail;
    detail.lab.sections = [];
    detail.lab.parseStatus = 'partial';
    await route.fulfill({ response, json: detail });
  });
  await page.goto(`${LAB}?view=sections`);
  await expect(page.getByText('No readable sections were found.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Original', exact: true }).click();
  await expect(page.locator('iframe')).toBeVisible();
  await expect(page.getByText('parsed partially')).toBeVisible();
});

test('source markup cannot style the app, execute code, load remote images or add forms', async ({
  page,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4318')) external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(`**/api${LAB}`, async (route) => {
    const response = await route.fetch();
    const detail = (await response.json()) as LabDetail;
    detail.lab.sections = [
      {
        kind: 'other',
        heading: '<img src=x onerror=alert(1)>',
        html: '<style>body{display:none}</style><script>window.__sectionXss=1</script><img src="https://example.com/pixel" onerror="window.__sectionXss=2" alt="diagram"><form><input type="checkbox"><button>Submit</button></form><div class="topbar" style="position:fixed" id="view-original">Safe content</div><a href="javascript:alert(1)">Link text</a>',
      },
    ];
    await route.fulfill({ response, json: detail });
  });
  await page.goto(`${LAB}?view=sections`);
  const reader = page.locator('.section-reader');
  await expect(reader).toContainText('Safe content');
  await expect(reader).toContainText('<img src=x onerror=alert(1)>');
  await expect(
    reader.locator('script, style, img, form, input, button, [style], .topbar'),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __sectionXss?: number }).__sectionXss),
  ).toBeUndefined();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of ['light', 'dark']) {
  test(`sections is readable on mobile and accessible (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/labs/windows-wont-wake-from-sleep?view=sections');
    await expect(page).toHaveTitle(/Lab/);
    await expect(page.getByRole('heading', { name: 'Contents', exact: true })).toBeInViewport();
    await expect(page.getByRole('navigation', { name: 'Lab sections' })).toBeVisible();
    await expect(page.locator('.lab-reading-panel')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .exclude('iframe')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `/tmp/lab-ledger-sections-${theme}.png` });
  });
}
