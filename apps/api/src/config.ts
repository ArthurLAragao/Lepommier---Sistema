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
  PUBLIC_ORIGIN: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        url.origin === value &&
        ['http:', 'https:'].includes(url.protocol) &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      );
    }, 'Use a origem local exata, sem caminho ou barra final.')
    .optional(),
  INSTALLATION_SECRET_FILE: z.string().min(1).default('data/installation-secret'),
});

export function parseConfig(environment: NodeJS.ProcessEnv = process.env) {
  const config = environmentSchema.parse(environment);
  const hostname = config.HOST === '::1' ? '[::1]' : config.HOST;
  return {
    ...config,
    publicOrigin:
      config.PUBLIC_ORIGIN ??
      `http://${hostname}:${config.NODE_ENV === 'development' ? 5173 : config.PORT}`,
  };
}
export type AppConfig = ReturnType<typeof parseConfig>;
