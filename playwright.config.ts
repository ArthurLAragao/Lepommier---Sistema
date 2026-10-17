import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3333', trace: 'retain-on-failure', timezoneId: 'Asia/Tokyo' },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
        ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'node --env-file-if-exists=.env scripts/start.mjs',
    url: 'http://127.0.0.1:3333/api/health/live',
    reuseExistingServer: !process.env.CI && process.env.E2E_REUSE_SERVER === '1',
    env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3333' },
    timeout: 30000,
  },
});
