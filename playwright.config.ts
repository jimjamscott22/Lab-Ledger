import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4318', trace: 'retain-on-failure' },
  webServer: {
    command:
      'node scripts/e2e-prepare.mjs && PORT=4318 LABS_DIR=.e2e/labs DATA_DIR=.e2e/data WATCH_STABILITY_MS=300 npm run start',
    url: 'http://127.0.0.1:4318/api/labs',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
