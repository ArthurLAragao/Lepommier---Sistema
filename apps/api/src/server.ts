import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { buildApp } from './app.js';
import { parseConfig } from './config.js';
import { createDatabase } from './database.js';

async function main() {
  const config = parseConfig();
  const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const secretPath = resolve(projectRoot, config.INSTALLATION_SECRET_FILE);
  const installationSecret = existsSync(secretPath)
    ? readFileSync(secretPath, 'utf8').trim()
    : undefined;
  if (installationSecret && !/^[A-Za-z0-9_-]{43}$/.test(installationSecret))
    throw new Error('Invalid installation secret file');
  const app = await buildApp({
    database: createDatabase(config.DATABASE_URL),
    logger: true,
    origin: config.publicOrigin,
    apiHost: `${config.HOST === '::1' ? '[::1]' : config.HOST}:${config.PORT}`,
    ...(installationSecret ? { installationSecret } : {}),
    ...(config.NODE_ENV === 'production' ? { webRoot: resolve(projectRoot, config.WEB_DIST) } : {}),
  });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app.close();
  };
  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch(() => {
  // Config/database failures must not print URLs, environment values or secrets.
  process.stderr.write(
    'Não foi possível iniciar o sistema. Confira a configuração local e a disponibilidade da porta.\n',
  );
  process.exitCode = 1;
});
