import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // One retry locally too: the API rotates refresh tokens per request and
  // throttles logins to 10 per 15 minutes, so a long serial run can lose a
  // cached session mid-suite. The retry re-seeds it and passes.
  retries: 1,
  // The API has a shared login rate limiter and demo data is shared, so run serially.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },

  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'setup',
      testMatch: /global-setup\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop',
      dependencies: ['setup'],
      testIgnore: [/global-setup\.spec\.ts/, /responsive\.spec\.ts/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: WEB_URL,
        reuseExistingServer: true,
        timeout: 180_000,
        cwd: __dirname,
      },

  metadata: { apiUrl: API_URL },
});