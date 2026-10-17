import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.enum(['127.0.0.1', '::1']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => /^postgres(?:ql)?:/.test(value), 'Use uma conexão PostgreSQL.')
    .optional(),
  WEB_DIST: z.string().min(1).default('apps/web/dist'),
});

export function parseConfig(environment: NodeJS.ProcessEnv = process.env) {
  return environmentSchema.parse(environment);
}
export type AppConfig = ReturnType<typeof parseConfig>;
