import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

const PAGES = ['/', '/labs', '/labs/ad-user-onboarding', '/settings'];

for (const scheme of ['light', 'dark'] as const) {
  for (const url of PAGES) {
    test(`no serious axe violations on ${url} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.addInitScript((s) => localStorage.setItem('theme', s), scheme);
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('iframe')
        .analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}
