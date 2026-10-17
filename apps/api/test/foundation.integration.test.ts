import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createDatabase } from '../src/database.js';
import { buildApp } from '../src/app.js';

const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl)
  throw new Error(
    'TEST_DATABASE_URL is required. Use the dedicated test database; see docs/TESTING.md.',
  );
const url = new URL(rawUrl);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
  !url.pathname.endsWith('_test') ||
  rawUrl === process.env.DATABASE_URL
) {
  throw new Error(
    'Integration tests require a distinct loopback PostgreSQL database with a name ending in _test.',
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: rawUrl, connectionTimeoutMillis: 2000 }),
});
beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('foundation against a real dedicated PostgreSQL database', () => {
  it('connects with Prisma and verifies the migration exists', async () => {
    const rows = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
    expect(rows[0]?.version).toMatch(/PostgreSQL/);
    expect(await prisma.storeSettings.count()).toBeGreaterThanOrEqual(0);
  });
  it('reports actual database readiness through the API', async () => {
    const app = await buildApp({ database: createDatabase(rawUrl) });
    try {
      const response = await app.inject('/api/health/ready');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'ready', database: { status: 'ready' } });
    } finally {
      await app.close();
    }
  });
});
