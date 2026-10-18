import { defineConfig, devices } from '@playwright/test';

const e2eUrl = process.env.E2E_DATABASE_URL;
if (!e2eUrl)
  throw new Error('E2E_DATABASE_URL is required; browser tests must not use store data.');
function localTarget(raw: string): URL {
  try {
    const target = new URL(raw);
    if (
      ['postgres:', 'postgresql:'].includes(target.protocol) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) &&
      [...target.searchParams].every(([key, value]) => key === 'schema' && value === 'public')
    )
      return target;
  } catch {
    /* Never expose a connection string in config errors. */
  }
  throw new Error(
    'Use an unambiguous local PostgreSQL URL; only schema=public query parameters are allowed.',
  );
}
const database = localTarget(e2eUrl);
const operational = process.env.DATABASE_URL ? localTarget(process.env.DATABASE_URL) : null;
if (
  !database.pathname.endsWith('_test') ||
  (operational &&
    decodeURIComponent(database.pathname) === decodeURIComponent(operational.pathname) &&
    (database.port || '5432') === (operational.port || '5432'))
)
  throw new Error('Refusing a non-isolated browser database.');
if (!process.env.E2E_SETUP_SECRET_FILE || !process.env.E2E_OWNER_PASSWORD)
  throw new Error('Provide isolated browser fixture credentials and setup file.');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3333', trace: 'off', timezoneId: 'Asia/Tokyo' },
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
    stdout: process.env.E2E_DIAGNOSTIC_LOGS === '1' ? 'pipe' : 'ignore',
    command: 'node --env-file-if-exists=.env scripts/start.mjs',
    url: 'http://127.0.0.1:3333/api/health/live',
    reuseExistingServer: !process.env.CI && process.env.E2E_REUSE_SERVER === '1',
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '3333',
      DATABASE_URL: e2eUrl,
      PUBLIC_ORIGIN: 'http://127.0.0.1:3333',
      INSTALLATION_SECRET_FILE: process.env.E2E_SETUP_SECRET_FILE,
    },
    timeout: 30000,
  },
});
