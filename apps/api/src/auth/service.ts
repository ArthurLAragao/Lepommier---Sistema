import { randomBytes } from 'node:crypto';
import { hasPermission, sessionExpiry, type Permission } from '@pommier/shared';
import type { z } from 'zod';
import type {
  createAccountSchema,
  editAccountSchema,
  setupSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '@pommier/shared';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';
import { AppError } from '../errors.js';
import { PasswordHasher } from './password.js';
import { safeAuditMetadata, secretMatches, tokenDigest } from './security.js';

export const accountSelect = {
  id: true,
  loginIdentifier: true,
  displayName: true,
  role: true,
  active: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;
export interface Principal {
  sessionId: string;
  userId: string;
}
export type SecurityEvent =
  | 'SETUP_COMPLETED'
  | 'LOGIN_SUCCEEDED'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'ACCOUNT_CREATED'
  | 'ACCOUNT_UPDATED'
  | 'ROLE_CHANGED'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_REACTIVATED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'OWNER_RECOVERED'
  | 'AUTHORIZATION_DENIED'
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_UPDATED'
  | 'CUSTOMER_STATUS_CHANGED'
  | 'CUSTOMER_ANONYMIZED'
  | 'MARKETING_CHANGED'
  | 'CUSTOMER_IMPORT_PREVIEWED'
  | 'CUSTOMER_IMPORTED'
  | 'CUSTOMER_EXPORTED'
  | 'CATEGORY_CREATED'
  | 'CATEGORY_UPDATED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_PRICE_CHANGED'
  | 'PRODUCT_COST_CHANGED'
  | 'STOCK_OPENED'
  | 'PURCHASED_RECEIVED'
  | 'PRODUCTION_PLANNED'
  | 'PRODUCTION_STARTED'
  | 'PRODUCTION_CANCELLED'
  | 'PRODUCTION_COMPLETED'
  | 'STOCK_WASTED'
  | 'STOCK_ADJUSTED'
  | 'STOCK_RECONCILED'
  | 'STOCK_RESERVED'
  | 'STOCK_RELEASED'
  | 'STOCK_CONSUMED'
  | 'ORDER_CREATED'
  | 'ORDER_EDITED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_PREPARING'
  | 'ORDER_READY'
  | 'PAYMENT_RECORDED'
  | 'ORDER_FULFILLED'
  | 'ORDER_CANCELLED'
  | 'REFUND_RECORDED'
  | 'CASH_OPENED'
  | 'CASH_MOVED'
  | 'CASH_CLOSED'
  | 'CASH_REVIEWED'
  | 'CASH_REVERSED'
  | 'CASH_RECONCILED'
  | 'REPORT_EXPORTED';
type Tx = Prisma.TransactionClient;
export async function securityLock(tx: Tx) {
  await tx.$queryRaw`SELECT "id" FROM "InstallationState" WHERE "id" = 1 FOR UPDATE`;
}
export async function audit(
  tx: Tx,
  eventType: SecurityEvent,
  correlationId: string,
  actorId: string | null,
  targetId: string | null,
  now: Date,
  metadata: Record<string, unknown> = {},
) {
  await tx.auditEvent.create({
    data: {
      eventType,
      correlationId,
      actorId,
      targetId,
      createdAt: now,
      metadata: safeAuditMetadata(metadata),
    },
  });
}
const invalidLogin = () =>
  new AppError(
    401,
    'INVALID_CREDENTIALS',
    'Usuário ou senha não conferem. Verifique e tente novamente.',
  );
const expired = () =>
  new AppError(401, 'SESSION_EXPIRED', 'Seu acesso terminou. Entre novamente para continuar.');

export class AuthService {
  readonly passwords = new PasswordHasher();
  constructor(
    readonly db: PrismaClient,
    private readonly clock: () => Date,
    private readonly installationSecret: string | undefined,
  ) {}
  private transaction<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        await securityLock(tx);
        return operation(tx);
      },
      { maxWait: 10000, timeout: 10000 },
    );
  }
  async withPermission<T>(
    principal: Principal,
    permission: Permission,
    operation: (tx: Tx, actor: { id: string; role: import('@pommier/shared').Role }) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        await securityLock(tx);
        const actor = await this.authorize(tx, principal, permission);
        return operation(tx, actor);
      },
      { maxWait: 10000, timeout: 20000 },
    );
  }
  async state() {
    const state = await this.db.installationState.findUniqueOrThrow({ where: { id: 1 } });
    return {
      initialized: state.initializedAt !== null,
      setupAvailable: state.initializedAt === null && Boolean(this.installationSecret),
    };
  }
  /** Short MVCC reads do not acquire the security singleton or lock sales rows.
   * Authorization is evaluated in the same snapshot; a completed revocation is
   * observed by the next request. Export delivery additionally reauthorizes. */
  async withReadSnapshot<T>(
    principal: Principal,
    permission: Permission,
    operation: (tx: Tx, actor: { id: string; role: import('@pommier/shared').Role }) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '1500ms'`;
        const actor = await this.authorize(tx, principal, permission);
        return operation(tx, actor);
      },
      { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 7000 },
    );
  }
  async setup(input: z.infer<typeof setupSchema>, requestId: string) {
    if ((await this.state()).initialized)
      throw new AppError(
        409,
        'SETUP_CLOSED',
        'A instalação inicial já foi concluída. Use a tela de acesso.',
      );
    if (!this.installationSecret)
      throw new AppError(
        503,
        'SETUP_UNAVAILABLE',
        'O responsável pela instalação precisa gerar a chave local de instalação.',
      );
    if (!secretMatches(input.installationSecret, this.installationSecret))
      throw new AppError(
        403,
        'SETUP_SECRET_INVALID',
        'A chave de instalação não confere. Confira o arquivo local com o responsável.',
      );
    const passwordHash = await this.passwords.hash(input.password);
    return this.transaction(async (tx) => {
      const state = await tx.installationState.findUniqueOrThrow({ where: { id: 1 } });
      if (state.initializedAt)
        throw new AppError(
          409,
          'SETUP_CLOSED',
          'A instalação inicial já foi concluída. Use a tela de acesso.',
        );
      if (await tx.user.count())
        throw new AppError(
          409,
          'SETUP_REVIEW_REQUIRED',
          'Esta instalação precisa de revisão pelo responsável técnico.',
        );
      const now = this.clock();
      const user = await tx.user.create({
        data: {
          loginIdentifier: input.loginIdentifier,
          displayName: input.displayName,
          passwordHash,
          role: 'OWNER',
        },
        select: accountSelect,
      });
      await tx.installationState.update({ where: { id: 1 }, data: { initializedAt: now } });
      await audit(tx, 'SETUP_COMPLETED', requestId, user.id, user.id, now);
      return { user };
    });
  }
  async throttle(source: string, identifier: string) {
    const admitted = await this.transaction(async (tx) => {
      const now = this.clock();
      const cutoff = new Date(now.getTime() - 1_200_000);
      await tx.$executeRaw`DELETE FROM "LoginThrottle" WHERE "key" IN (SELECT "key" FROM "LoginThrottle" WHERE "windowStartedAt" < ${cutoff} LIMIT 128)`;
      for (const [key, limit] of [
        [`source:${tokenDigest(source)}`, 60],
        [`login:${tokenDigest(identifier)}`, 8],
      ] as const) {
        const entry = await tx.loginThrottle.findUnique({ where: { key } });
        const fresh = !entry || now.getTime() - entry.windowStartedAt.getTime() >= 600_000;
        if (!fresh && entry.attempts >= limit) return false;
        if (!entry && (await tx.loginThrottle.count()) >= 2048) return false;
        await tx.loginThrottle.upsert({
          where: { key },
          create: { key, windowStartedAt: now, attempts: 1 },
          update: fresh ? { windowStartedAt: now, attempts: 1 } : { attempts: { increment: 1 } },
        });
      }
      return true;
    });
    if (!admitted)
      throw new AppError(
        429,
        'LOGIN_THROTTLED',
        'Muitas tentativas de acesso. Aguarde até 10 minutos e tente novamente.',
      );
  }
  async login(
    identifier: string,
    password: string,
    previousToken: string | undefined,
    requestId: string,
  ) {
    const user = await this.db.user.findUnique({ where: { loginIdentifier: identifier } });
    const valid = await this.passwords.verify(
      user?.active ? user.passwordHash : undefined,
      password,
    );
    const result = await this.transaction(async (tx) => {
      const current = user ? await tx.user.findUnique({ where: { id: user.id } }) : null;
      const now = this.clock();
      if (!valid || !current?.active || current.passwordHash !== user?.passwordHash) {
        await audit(tx, 'LOGIN_FAILED', requestId, null, user?.id ?? null, now, {
          reason: 'invalid_credentials',
        });
        return null;
      }
      await tx.session.updateMany({
        where: { userId: current.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (previousToken)
        await tx.session.updateMany({
          where: { tokenDigest: tokenDigest(previousToken), revokedAt: null },
          data: { revokedAt: now },
        });
      const token = randomBytes(32).toString('base64url');
      const expiresAt = sessionExpiry(now);
      await tx.session.create({
        data: { tokenDigest: tokenDigest(token), userId: current.id, createdAt: now, expiresAt },
      });
      await audit(tx, 'LOGIN_SUCCEEDED', requestId, current.id, current.id, now);
      return { token, expiresAt };
    });
    if (!result) throw invalidLogin();
    return result;
  }
  async session(token: string | undefined) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw expired();
    const session = await this.db.session.findUnique({
      where: { tokenDigest: tokenDigest(token) },
      include: { user: { select: accountSelect } },
    });
    if (!session || session.revokedAt || session.expiresAt <= this.clock() || !session.user.active)
      throw expired();
    return session;
  }
  private async authorize(tx: Tx, principal: Principal, permission: Permission) {
    const session = await tx.session.findUnique({
      where: { id: principal.sessionId },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== principal.userId ||
      session.revokedAt ||
      session.expiresAt <= this.clock() ||
      !session.user.active
    )
      throw expired();
    if (!hasPermission(session.user.role, permission))
      throw new AppError(
        403,
        'FORBIDDEN',
        'Seu perfil não permite esta operação. Procure o responsável pela loja.',
      );
    return session.user;
  }
  async denied(principal: Principal, permission: Permission, requestId: string) {
    await this.transaction(async (tx) => {
      const now = this.clock();
      const recent = await tx.auditEvent.findFirst({
        where: {
          actorId: principal.userId,
          eventType: 'AUTHORIZATION_DENIED',
          createdAt: { gte: new Date(now.getTime() - 600_000) },
        },
      });
      if (!recent)
        await audit(tx, 'AUTHORIZATION_DENIED', requestId, principal.userId, null, now, {
          permission,
        });
    });
  }
  async logout(principal: Principal, requestId: string) {
    await this.transaction(async (tx) => {
      await this.authorize(tx, principal, 'profile.self');
      const now = this.clock();
      await tx.session.update({ where: { id: principal.sessionId }, data: { revokedAt: now } });
      await audit(tx, 'LOGOUT', requestId, principal.userId, principal.userId, now);
    });
  }
  async list(principal: Principal, page: number) {
    return this.transaction(async (tx) => {
      await this.authorize(tx, principal, 'accounts.manage');
      const users = await tx.user.findMany({
        select: accountSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 20,
        skip: (page - 1) * 20,
      });
      return { users, total: await tx.user.count(), page, pageSize: 20 };
    });
  }
  async create(
    principal: Principal,
    input: z.infer<typeof createAccountSchema>,
    requestId: string,
  ) {
    const passwordHash = await this.passwords.hash(input.password);
    return this.transaction(async (tx) => {
      await this.authorize(tx, principal, 'accounts.manage');
      if ((await tx.user.count({ where: { active: true } })) >= 5)
        throw new AppError(
          409,
          'STAFF_LIMIT',
          'O limite inicial é de cinco contas ativas. Desative uma conta antes de continuar.',
        );
      if (await tx.user.findUnique({ where: { loginIdentifier: input.loginIdentifier } }))
        throw new AppError(
          409,
          'LOGIN_IN_USE',
          'Este nome de usuário já está cadastrado. Escolha outro.',
        );
      const user = await tx.user.create({
        data: {
          loginIdentifier: input.loginIdentifier,
          displayName: input.displayName,
          role: input.role,
          passwordHash,
        },
        select: accountSelect,
      });
      await audit(tx, 'ACCOUNT_CREATED', requestId, principal.userId, user.id, this.clock(), {
        role: input.role,
      });
      return { user };
    });
  }
  async edit(
    principal: Principal,
    id: string,
    input: z.infer<typeof editAccountSchema>,
    requestId: string,
  ) {
    return this.transaction(async (tx) => {
      await this.authorize(tx, principal, 'accounts.manage');
      const previous = await tx.user.findUnique({ where: { id } });
      if (!previous) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Esta conta não foi encontrada.');
      if (previous.version !== input.version)
        throw new AppError(
          409,
          'STALE_ACCOUNT',
          'Esta conta foi alterada por outra pessoa. Atualize a lista e confira.',
        );
      if (
        previous.active &&
        previous.role === 'OWNER' &&
        (!input.active || input.role !== 'OWNER') &&
        (await tx.user.count({ where: { active: true, role: 'OWNER' } })) <= 1
      ) {
        throw new AppError(
          409,
          'LAST_OWNER',
          'Mantenha pelo menos um proprietário ativo antes de alterar esta conta.',
        );
      }
      if (
        !previous.active &&
        input.active &&
        (await tx.user.count({ where: { active: true } })) >= 5
      )
        throw new AppError(
          409,
          'STAFF_LIMIT',
          'O limite inicial é de cinco contas ativas. Desative uma conta antes de continuar.',
        );
      const now = this.clock();
      const user = await tx.user.update({
        where: { id },
        data: {
          displayName: input.displayName,
          role: input.role,
          active: input.active,
          version: { increment: 1 },
        },
        select: accountSelect,
      });
      if (previous.role !== input.role || previous.active !== input.active)
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now },
        });
      await audit(tx, 'ACCOUNT_UPDATED', requestId, principal.userId, id, now, {
        reason: input.reason,
        version: user.version,
      });
      if (previous.role !== input.role)
        await audit(tx, 'ROLE_CHANGED', requestId, principal.userId, id, now, {
          previousRole: previous.role,
          role: input.role,
          reason: input.reason,
        });
      if (previous.active !== input.active)
        await audit(
          tx,
          input.active ? 'ACCOUNT_REACTIVATED' : 'ACCOUNT_DISABLED',
          requestId,
          principal.userId,
          id,
          now,
          { reason: input.reason, active: input.active },
        );
      return { user };
    });
  }
  async changePassword(
    principal: Principal,
    input: z.infer<typeof changePasswordSchema>,
    requestId: string,
  ) {
    const current = await this.db.user.findUniqueOrThrow({ where: { id: principal.userId } });
    if (!(await this.passwords.verify(current.passwordHash, input.currentPassword)))
      throw invalidLogin();
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.transaction(async (tx) => {
      const actor = await this.authorize(tx, principal, 'profile.self');
      if (actor.passwordHash !== current.passwordHash) throw expired();
      const now = this.clock();
      await tx.user.update({
        where: { id: actor.id },
        data: { passwordHash, version: { increment: 1 } },
      });
      await tx.session.updateMany({
        where: { userId: actor.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await audit(tx, 'PASSWORD_CHANGED', requestId, actor.id, actor.id, now);
    });
  }
  async resetPassword(
    principal: Principal,
    id: string,
    input: z.infer<typeof resetPasswordSchema>,
    requestId: string,
  ) {
    const actor = await this.db.user.findUniqueOrThrow({ where: { id: principal.userId } });
    if (!(await this.passwords.verify(actor.passwordHash, input.ownerPassword)))
      throw invalidLogin();
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.transaction(async (tx) => {
      const current = await this.authorize(tx, principal, 'accounts.manage');
      if (current.passwordHash !== actor.passwordHash) throw expired();
      if (id === actor.id)
        throw new AppError(
          400,
          'USE_PASSWORD_CHANGE',
          'Para sua conta, use a opção de alterar a própria senha.',
        );
      if (!(await tx.user.findUnique({ where: { id } })))
        throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Esta conta não foi encontrada.');
      const now = this.clock();
      await tx.user.update({ where: { id }, data: { passwordHash, version: { increment: 1 } } });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
      await audit(tx, 'PASSWORD_RESET', requestId, actor.id, id, now, { reason: input.reason });
    });
  }
  async events(principal: Principal) {
    return this.transaction(async (tx) => {
      await this.authorize(tx, principal, 'security.review');
      return { events: await tx.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) };
    });
  }
  async cleanup() {
    const cutoff = new Date(this.clock().getTime() - 7 * 86_400_000);
    return this.db
      .$executeRaw`DELETE FROM "Session" WHERE "id" IN (SELECT "id" FROM "Session" WHERE "expiresAt" < ${cutoff} OR "revokedAt" < ${cutoff} LIMIT 1000)`;
  }
}
