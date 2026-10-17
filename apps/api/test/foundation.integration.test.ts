import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createDatabase } from '../src/database.js';
import { buildApp } from '../src/app.js';
import { testUrl } from './database.js';

const rawUrl = testUrl().toString();

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
