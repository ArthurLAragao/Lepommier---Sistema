import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'apps/api/prisma/schema.prisma',
  migrations: { path: 'apps/api/prisma/migrations' },
  // Generation must work before installing PostgreSQL. Runtime config requires a URL.
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://unconfigured@127.0.0.1:5432/le_pommier',
  },
});
