import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl) throw new Error('TEST_DATABASE_URL is required for the dedicated test database.');
const url = new URL(rawUrl);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
  !url.pathname.endsWith('_test') ||
  rawUrl === process.env.DATABASE_URL
) {
  throw new Error(
    'Refusing migration: choose a distinct loopback database whose name ends in _test.',
  );
}
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)),
    'migrate',
    'deploy',
  ],
  {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: rawUrl },
    stdio: 'inherit',
    windowsHide: true,
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
