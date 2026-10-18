import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import type { DatabaseStatus } from '@pommier/shared';

export interface DatabaseProbe {
  client?: PrismaClient;
  check(): Promise<DatabaseStatus>;
  close(): Promise<void>;
}

export function createDatabase(url: string | undefined): DatabaseProbe {
  if (!url) {
    return {
      check: async () => ({ status: 'not_configured', checkedAt: new Date().toISOString() }),
      close: async () => {},
    };
  }
  const adapter = new PrismaPg({
    connectionString: url,
    connectionTimeoutMillis: 2000,
    // This client deadline also covers COMMIT. It must outlive the existing
    // 20-second transaction budget, rather than report failure while a valid
    // deferred constraint/audit commit is still finishing. Connection and
    // server-side reporting statement/transaction deadlines remain separate.
    query_timeout: 25000,
    max: 5,
  });
  const prisma = new PrismaClient({ adapter });
  return {
    client: prisma,
    async check() {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return { status: 'ready', checkedAt: new Date().toISOString() };
      } catch {
        return { status: 'unavailable', checkedAt: new Date().toISOString() };
      }
    },
    async close() {
      await prisma.$disconnect();
    },
  };
}
