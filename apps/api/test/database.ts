import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createDatabase } from '../src/database.js';
import { localMaintenanceTarget } from '../src/auth/maintenance.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

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
export async function freshDatabase(
  upgrade: boolean | 'identity' | 'registry' | 'inventory' | 'orders' | 'cash' = false,
  beforeUpgrade?: (client: PrismaClient, url: string) => Promise<void>,
) {
  if (beforeUpgrade && upgrade !== 'orders' && upgrade !== 'cash')
    throw new Error('The explicit pre-upgrade fixture requires the five-migration baseline.');
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
  let registryLegacy:
    { customerId: string; productId: string; categoryId: string; marketingId: string } | undefined;
  let inventoryLegacy:
    { batchId: string; reservationId: string; movementId: string; operationId: string } | undefined;
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
    if (
      upgrade === 'identity' ||
      upgrade === 'registry' ||
      upgrade === 'inventory' ||
      upgrade === 'orders' ||
      upgrade === 'cash'
    ) {
      const identity = resolve(path, 'migrations/202610170002_identity');
      mkdirSync(identity, { recursive: true });
      writeFileSync(
        resolve(identity, 'migration.sql'),
        readFileSync(
          resolve(projectRoot, 'apps/api/prisma/migrations/202610170002_identity/migration.sql'),
        ),
      );
    }
    if (
      upgrade === 'registry' ||
      upgrade === 'inventory' ||
      upgrade === 'orders' ||
      upgrade === 'cash'
    ) {
      const registry = resolve(path, 'migrations/202610170003_registry');
      mkdirSync(registry, { recursive: true });
      writeFileSync(
        resolve(registry, 'migration.sql'),
        readFileSync(
          resolve(projectRoot, 'apps/api/prisma/migrations/202610170003_registry/migration.sql'),
        ),
      );
    }
    if (upgrade === 'inventory' || upgrade === 'orders' || upgrade === 'cash') {
      const inventory = resolve(path, 'migrations/202610170004_inventory');
      mkdirSync(inventory, { recursive: true });
      writeFileSync(
        resolve(inventory, 'migration.sql'),
        readFileSync(
          resolve(projectRoot, 'apps/api/prisma/migrations/202610170004_inventory/migration.sql'),
        ),
      );
    }
    const config = resolve(path, 'baseline.config.ts');
    if (upgrade === 'orders' || upgrade === 'cash') {
      const orders = resolve(path, 'migrations/202610170005_orders');
      mkdirSync(orders, { recursive: true });
      writeFileSync(
        resolve(orders, 'migration.sql'),
        readFileSync(
          resolve(projectRoot, 'apps/api/prisma/migrations/202610170005_orders/migration.sql'),
        ),
      );
    }
    writeFileSync(
      config,
      `export default { schema: ${JSON.stringify(resolve(projectRoot, 'apps/api/prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(resolve(path, 'migrations'))} }, datasource: { url: process.env.DATABASE_URL } };`,
    );
    if (upgrade === 'cash')
      for (const name of ['202610170006_cash', '202610170007_cash_session_entry']) {
        const target = resolve(path, 'migrations', name);
        mkdirSync(target, { recursive: true });
        writeFileSync(
          resolve(target, 'migration.sql'),
          readFileSync(resolve(projectRoot, 'apps/api/prisma/migrations', name, 'migration.sql')),
        );
      }
    migrate(url.toString(), config);
    await client.storeSettings.create({
      data: { id: 1, createdAt: new Date('2001-01-01T00:00:00Z') },
    });
    if (
      upgrade === 'identity' ||
      upgrade === 'registry' ||
      upgrade === 'inventory' ||
      upgrade === 'orders' ||
      upgrade === 'cash'
    ) {
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
      if (
        upgrade === 'registry' ||
        upgrade === 'inventory' ||
        upgrade === 'orders' ||
        upgrade === 'cash'
      ) {
        const customer = await client.customer.create({
          data: {
            name: 'Preserved synthetic customer',
            nameKey: 'preserved synthetic customer',
            phone: '+5585999990001',
            notes: 'Preserved synthetic note',
            marketingState: 'OPTED_OUT',
          },
        });
        const marketing = await client.marketingPreferenceEvent.create({
          data: {
            customerId: customer.id,
            actorId: user.id,
            previousState: 'UNKNOWN',
            state: 'OPTED_OUT',
            source: 'CUSTOMER_REQUEST',
            reason: 'CUSTOMER_REQUEST',
            evidence: 'Synthetic retained reference',
          },
        });
        const category = await client.category.create({
          data: { name: 'Preserved category', nameKey: 'preserved category', active: false },
        });
        const product = await client.product.create({
          data: {
            name: 'Preserved product',
            nameKey: 'preserved product',
            code: 'PRESERVED',
            categoryId: category.id,
            origin: 'BOTH',
            active: false,
            sellingPriceCents: 1399,
            estimatedCostCents: 500,
          },
        });
        registryLegacy = {
          customerId: customer.id,
          productId: product.id,
          categoryId: category.id,
          marketingId: marketing.id,
        };
        if (upgrade === 'inventory' || upgrade === 'orders' || upgrade === 'cash')
          inventoryLegacy = await client.$transaction(async (tx) => {
            const op = await tx.inventoryOperation.create({
              data: {
                actorId: user.id,
                key: randomUUID(),
                kind: 'OPENING',
                requestDigest: 'a'.repeat(64),
                createdAt: initializedAt,
              },
              select: { id: true },
            });
            const batch = await tx.batch.create({
              data: {
                productId: product.id,
                reference: 'Legacy synthetic inventory',
                referenceKey: 'legacy synthetic inventory',
                source: 'OPENING',
                actorId: user.id,
                recordedAt: initializedAt,
                expiresAt: new Date('2099-01-01'),
                physical: 4n,
                reserved: 2n,
              },
              select: { id: true },
            });
            const movement = await tx.inventoryMovement.create({
              data: {
                productId: product.id,
                batchId: batch.id,
                operationId: op.id,
                actorId: user.id,
                type: 'OPENING',
                quantity: 4,
                reason: 'INITIAL_COUNT',
                createdAt: initializedAt,
              },
              select: { id: true },
            });
            const reservation = await tx.inventoryReservation.create({
              data: {
                productId: product.id,
                quantity: 2,
                sourceNamespace: 'INTERNAL',
                sourceReference: randomUUID(),
                eligibilityThrough: new Date('2098-12-31'),
                actorId: user.id,
                createdAt: initializedAt,
              },
              select: { id: true },
            });
            await tx.reservationAllocation.create({
              data: {
                productId: product.id,
                reservationId: reservation.id,
                batchId: batch.id,
                allocated: 2,
              },
              select: { id: true },
            });
            await tx.inventoryOperation.update({
              where: { id: op.id },
              data: {
                result: { operationId: op.id, targetId: batch.id, batchId: batch.id },
                completedAt: initializedAt,
              },
              select: { id: true },
            });
            return {
              batchId: batch.id,
              reservationId: reservation.id,
              movementId: movement.id,
              operationId: op.id,
            };
          });
      }
    }
  }
  if (beforeUpgrade) await beforeUpgrade(client, url.toString());
  migrate(url.toString());
  return { connection, client, url: url.toString(), legacy, registryLegacy, inventoryLegacy };
}
