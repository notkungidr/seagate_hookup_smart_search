// @ts-check
import { defineConfig, devices } from '@playwright/test';

const FRONTEND_BASE =
  process.env.FRONTEND_BASE_URL ||
  'http://localhost:5173/prodline/seagate/hookup/hookup_smart_search/frontend/';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: FRONTEND_BASE,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    locale: 'th-TH',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
