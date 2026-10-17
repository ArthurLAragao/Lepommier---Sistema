import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createDatabase } from '../src/database.js';
import { localMaintenanceTarget } from '../src/auth/maintenance.js';

export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
export function testUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests.');
  const url = localMaintenanceTarget(raw);
  const operational = process.env.DATABASE_URL
    ? localMaintenanceTarget(process.env.DATABASE_URL)
    : null;
  if (
    !url.pathname.endsWith('_test') ||
    (operational &&
      decodeURIComponent(url.pathname) === decodeURIComponent(operational.pathname) &&
      (url.port || '5432') === (operational.port || '5432'))
  )
    throw new Error('Refusing a non-isolated test database.');
  return url;
}
export function migrate(rawUrl: string, config?: string) {
  const result = spawnSync(
    process.execPath,
    [
      resolve(projectRoot, 'node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      ...(config ? ['--config', config] : []),
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: rawUrl, PRISMA_HIDE_UPDATE_MESSAGE: 'true' },
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  if (result.status !== 0)
    throw new Error(
      `Isolated migration failed: ${(result.stderr ?? '').replaceAll(rawUrl, '[database URL redacted]')}`,
    );
}
/** Fresh named DBs are retained. Never reset/drop the supplied database. */
export async function freshDatabase(upgrade: boolean | 'identity' = false) {
  const url = testUrl();
  const name = `pommier_${randomUUID().replaceAll('-', '').slice(0, 12)}_test`;
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  url.pathname = `/${name}`;
  const connection = createDatabase(url.toString());
  const client = connection.client;
  let legacy:
    | { userId: string; passwordHash: string; initializedAt: Date; sessionDigest: string }
    | undefined;
  if (!client) throw new Error('Test database client missing.');
  if (upgrade) {
    const path = resolve(projectRoot, 'data/test-runs', name);
    const baseline = resolve(path, 'migrations/202610170001_foundation');
    mkdirSync(baseline, { recursive: true });
    writeFileSync(
      resolve(baseline, 'migration.sql'),
      readFileSync(
        resolve(projectRoot, 'apps/api/prisma/migrations/202610170001_foundation/migration.sql'),
      ),
    );
    writeFileSync(resolve(path, 'migrations/migration_lock.toml'), 'provider = "postgresql"\n');
    if (upgrade === 'identity') {
      const identity = resolve(path, 'migrations/202610170002_identity');
      mkdirSync(identity, { recursive: true });
      writeFileSync(
        resolve(identity, 'migration.sql'),
        readFileSync(
          resolve(projectRoot, 'apps/api/prisma/migrations/202610170002_identity/migration.sql'),
        ),
      );
    }
    const config = resolve(path, 'baseline.config.ts');
    writeFileSync(
      config,
      `export default { schema: ${JSON.stringify(resolve(projectRoot, 'apps/api/prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(resolve(path, 'migrations'))} }, datasource: { url: process.env.DATABASE_URL } };`,
    );
    migrate(url.toString(), config);
    await client.storeSettings.create({
      data: { id: 1, createdAt: new Date('2001-01-01T00:00:00Z') },
    });
    if (upgrade === 'identity') {
      const { PasswordHasher } = await import('../src/auth/password.js');
      const { tokenDigest } = await import('../src/auth/security.js');
      const passwordHash = await new PasswordHasher().hash(randomUUID());
      const initializedAt = new Date();
      const user = await client.user.create({
        data: {
          loginIdentifier: 'preserved-owner',
          displayName: 'Preserved synthetic owner',
          role: 'OWNER',
          passwordHash,
        },
      });
      await client.installationState.update({ where: { id: 1 }, data: { initializedAt } });
      const sessionDigest = tokenDigest(randomUUID());
      await client.session.create({
        data: {
          userId: user.id,
          tokenDigest: sessionDigest,
          expiresAt: new Date(initializedAt.getTime() + 43200000),
        },
      });
      await client.auditEvent.create({
        data: {
          eventType: 'SETUP_COMPLETED',
          actorId: user.id,
          targetId: user.id,
          correlationId: randomUUID(),
          metadata: {},
        },
      });
      legacy = { userId: user.id, passwordHash, initializedAt, sessionDigest };
    }
  }
  migrate(url.toString());
  return { connection, client, url: url.toString(), legacy };
}
