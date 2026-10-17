import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../apps/api/src/database.js';
import { devFixtureTarget } from '../apps/api/src/auth/maintenance.js';
import { AuthService } from '../apps/api/src/auth/service.js';
import { setupSchema } from '@pommier/shared';
import { AppError } from '../apps/api/src/errors.js';
import { privateInput } from './private-input.js';
async function main() {
  if (!process.argv.includes('--confirm-dev-fixture'))
    throw new AppError(
      400,
      'CONFIRM_REQUIRED',
      'Informe --confirm-dev-fixture para confirmar o banco descartável.',
    );
  const url = devFixtureTarget(process.env);
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)),
      'migrate',
      'deploy',
    ],
    {
      env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: 'true' },
      windowsHide: true,
      stdio: 'pipe',
    },
  );
  if (result.status !== 0) throw new Error('Development fixture migration failed');
  const connection = createDatabase(url);
  try {
    if (!connection.client) throw new Error('No client');
    const input = await privateInput();
    const secret = randomBytes(32).toString('base64url');
    const auth = new AuthService(connection.client, () => new Date(), secret);
    await auth.setup(
      setupSchema.parse({
        loginIdentifier: input.loginIdentifier,
        displayName: 'Conta de desenvolvimento',
        password: input.password,
        installationSecret: secret,
      }),
      randomUUID(),
    );
    process.stdout.write(
      'Fixture explícita criada no banco de desenvolvimento. Nenhum registro de operação foi incluído.\n',
    );
  } finally {
    await connection.close();
  }
}
main().catch((error: unknown) => {
  process.stderr.write(
    error instanceof AppError
      ? `${error.message}\n`
      : 'Fixture recusada ou não concluída. Confira o guia de desenvolvimento.\n',
  );
  process.exitCode = 1;
});
