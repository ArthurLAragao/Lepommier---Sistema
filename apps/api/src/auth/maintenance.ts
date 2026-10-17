import { AppError } from '../errors.js';
import { passwordSchema, loginIdentifierSchema } from '@pommier/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { audit, securityLock } from './service.js';
import { PasswordHasher } from './password.js';

export function localMaintenanceTarget(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(
      400,
      'LOCAL_DATABASE_REQUIRED',
      'Confira a conexão PostgreSQL local, sem parâmetros de redirecionamento.',
    );
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    [...url.searchParams].some(([key, value]) => key !== 'schema' || value !== 'public')
  )
    throw new AppError(
      400,
      'LOCAL_DATABASE_REQUIRED',
      'Use PostgreSQL local; somente schema=public é permitido na consulta da conexão.',
    );
  return url;
}

export function devFixtureTarget(environment: NodeJS.ProcessEnv): string {
  if (
    environment.NODE_ENV !== 'development' ||
    environment.ALLOW_DEV_FIXTURES !== 'I_UNDERSTAND_THIS_IS_DISPOSABLE'
  )
    throw new AppError(
      400,
      'FIXTURE_REFUSED',
      'Fixtures exigem ambiente de desenvolvimento e confirmação explícita.',
    );
  const raw = environment.DEV_FIXTURE_DATABASE_URL;
  if (!raw)
    throw new AppError(
      400,
      'FIXTURE_REFUSED',
      'Configure um banco local separado com nome terminado em _dev.',
    );
  const url = localMaintenanceTarget(raw);
  const operational = environment.DATABASE_URL
    ? localMaintenanceTarget(environment.DATABASE_URL)
    : null;
  if (
    !url.pathname.endsWith('_dev') ||
    (operational &&
      decodeURIComponent(url.pathname) === decodeURIComponent(operational.pathname) &&
      (url.port || '5432') === (operational.port || '5432'))
  )
    throw new AppError(
      400,
      'FIXTURE_REFUSED',
      'O banco de fixtures deve ser local, separado e terminado em _dev.',
    );
  return raw;
}

/** Privileged offline maintenance, never exposed through a public HTTP route. */
export async function recoverOwner(
  db: PrismaClient,
  input: { loginIdentifier: string; password: string; reason: string },
  correlationId: string,
) {
  const identifier = loginIdentifierSchema.parse(input.loginIdentifier);
  const password = passwordSchema.parse(input.password);
  if (input.reason.trim().length < 5 || input.reason.length > 200)
    throw new AppError(400, 'RECOVERY_REASON', 'Informe um motivo de 5 a 200 caracteres.');
  const passwordHash = await new PasswordHasher().hash(password);
  await db.$transaction(async (tx) => {
    await securityLock(tx);
    const state = await tx.installationState.findUniqueOrThrow({ where: { id: 1 } });
    if (!state.initializedAt)
      throw new AppError(
        409,
        'SETUP_REQUIRED',
        'Conclua a instalação inicial antes da recuperação.',
      );
    const owner = await tx.user.findUnique({ where: { loginIdentifier: identifier } });
    if (!owner?.active || owner.role !== 'OWNER')
      throw new AppError(
        409,
        'ACTIVE_OWNER_REQUIRED',
        'A recuperação local exige uma conta de proprietário ativa.',
      );
    const now = new Date();
    await tx.user.update({
      where: { id: owner.id },
      data: { passwordHash, version: { increment: 1 } },
    });
    await tx.session.updateMany({
      where: { userId: owner.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await audit(tx, 'OWNER_RECOVERED', correlationId, null, owner.id, now, {
      reason: input.reason,
      method: 'offline_local_cli',
    });
  });
}
