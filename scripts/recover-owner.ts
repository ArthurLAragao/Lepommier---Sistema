import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { parseConfig } from '../apps/api/src/config.js';
import { createDatabase } from '../apps/api/src/database.js';
import { recoverOwner, localMaintenanceTarget } from '../apps/api/src/auth/maintenance.js';
import { AppError } from '../apps/api/src/errors.js';
import { privateInput } from './private-input.js';
async function main() {
  if (!process.argv.includes('--confirm-local-recovery'))
    throw new AppError(
      400,
      'CONFIRM_REQUIRED',
      'A recuperação local exige a opção --confirm-local-recovery.',
    );
  const config = parseConfig();
  if (!config.DATABASE_URL)
    throw new AppError(400, 'DATABASE_REQUIRED', 'Configure a conexão local do banco.');
  localMaintenanceTarget(config.DATABASE_URL);
  const listening = await new Promise<boolean>((resolve, reject) => {
    const socket = net.createConnection({ host: config.HOST, port: config.PORT });
    socket.setTimeout(2000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED') resolve(false);
      else reject(new Error('Cannot establish maintenance isolation'));
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('Cannot establish maintenance isolation'));
    });
  });
  if (listening)
    throw new AppError(
      409,
      'STOP_APPLICATION',
      'Pare o aplicativo antes da recuperação. Mantenha apenas o banco local em execução.',
    );
  const connection = createDatabase(config.DATABASE_URL);
  try {
    if (!connection.client) throw new Error('No database client');
    await recoverOwner(connection.client, await privateInput(), randomUUID());
    process.stdout.write(
      'Senha do proprietário alterada. Acessos anteriores revogados e recuperação registrada na auditoria.\n',
    );
  } finally {
    await connection.close();
  }
}
main().catch((error: unknown) => {
  process.stderr.write(
    error instanceof AppError
      ? `${error.message}\n`
      : 'A recuperação não foi concluída. Confira a conexão, os dados e o guia de manutenção.\n',
  );
  process.exitCode = 1;
});
