import { defineConfig, devices } from '@playwright/test';

// Loop scaffolding for the FORGE PRD agent-team flow.
// Visual Critic stage runs `npm run test:e2e` against `localhost:3000`.
// Boots the dashboard via `npm run dev` if not already running.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // Port 3030 used instead of 3000 to avoid conflicts with locally-running
    // MCP servers / other dev tools that commonly squat on 3000.
    baseURL: 'http://localhost:3030',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'next dev -p 3030',
    url: 'http://localhost:3030',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
