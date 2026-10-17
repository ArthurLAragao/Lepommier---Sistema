import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl) throw new Error('TEST_DATABASE_URL is required for the dedicated test database.');
function localTarget(raw) {
  try {
    const target = new URL(raw);
    if (
      ['postgres:', 'postgresql:'].includes(target.protocol) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) &&
      [...target.searchParams].every(([key, value]) => key === 'schema' && value === 'public')
    )
      return target;
  } catch {
    /* Report only a safe diagnostic, never the connection string. */
  }
  throw new Error(
    'Use an unambiguous local PostgreSQL URL; only schema=public query parameters are allowed.',
  );
}
const url = localTarget(rawUrl);
const operational = process.env.DATABASE_URL ? localTarget(process.env.DATABASE_URL) : null;
if (
  !url.pathname.endsWith('_test') ||
  (operational &&
    decodeURIComponent(url.pathname) === decodeURIComponent(operational.pathname) &&
    (url.port || '5432') === (operational.port || '5432'))
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
