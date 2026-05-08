import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// Isolated config for prod-targeted feature tests under e2e/feature-tests/.
// Does NOT spin up a local dev server. Auths via a setup project that signs in
// once per run and saves storage state to e2e/feature-tests/.auth/<user>.json.
//
// Run:
//   PAM_TEST_PASSWORD=<pw> \
//   npx playwright test --config=playwright.feature-tests.config.ts
//
// Override target via E2E_BASE_URL (default https://mcmforge.com).
export default defineConfig({
  testDir: './e2e/feature-tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'feature-tests-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://mcmforge.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'feature-tests',
      dependencies: ['setup'],
      testMatch: /\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, 'e2e/feature-tests/.auth/pam.json'),
      },
    },
  ],
});
