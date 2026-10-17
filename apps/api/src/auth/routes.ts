import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  hasPermission,
  loginSchema,
  setupSchema,
  createAccountSchema,
  editAccountSchema,
  changePasswordSchema,
  resetPasswordSchema,
  type Permission,
} from '@pommier/shared';
import { AuthService } from './service.js';
import { isLoopback, protectRequest } from './security.js';
import { AppError } from '../errors.js';

export interface AuthRoutesOptions {
  service?: AuthService;
  origin: string;
  apiHost: string;
}
const COOKIE = 'pommier_session';
export async function requireAccess(
  auth: AuthService | undefined,
  request: FastifyRequest,
  permission: Permission = 'profile.self',
) {
  if (!auth)
    throw new AppError(
      503,
      'IDENTITY_UNAVAILABLE',
      'Configure e inicie o banco local antes de acessar.',
    );
  const session = await auth.session(request.cookies[COOKIE]);
  const principal = { userId: session.userId, sessionId: session.id };
  if (!hasPermission(session.user.role, permission)) {
    await auth.denied(principal, permission, request.id);
    throw new AppError(
      403,
      'FORBIDDEN',
      'Seu perfil não permite esta operação. Procure o responsável pela loja.',
    );
  }
  return { auth, session, principal };
}
export async function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions) {
  const cookie = {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: new URL(options.origin).protocol === 'https:',
  };
  const service = () => {
    if (!options.service)
      throw new AppError(
        503,
        'IDENTITY_UNAVAILABLE',
        'Configure e inicie o banco local antes de acessar. Procure o responsável pela instalação.',
      );
    return options.service;
  };
  app.addHook('onRequest', async (request) => {
    protectRequest(request, options.origin, options.apiHost);
  });
  async function authorize(request: FastifyRequest, permission: Permission = 'profile.self') {
    return requireAccess(service(), request, permission);
  }
  const clear = (reply: FastifyReply) => reply.clearCookie(COOKIE, cookie);
  const idOf = (request: FastifyRequest) => z.object({ id: z.uuid() }).parse(request.params).id;

  app.get('/auth/state', async () => service().state());
  app.post('/auth/setup', { bodyLimit: 16384 }, async (request) => {
    if (!isLoopback(request.ip))
      throw new AppError(
        403,
        'SETUP_LOCAL_ONLY',
        'A instalação inicial precisa ser feita diretamente no computador da loja.',
      );
    const input = setupSchema.parse(request.body);
    const auth = service();
    await auth.throttle(request.ip, 'setup');
    await auth.setup(input, request.id);
    return { initialized: true };
  });
  app.post('/auth/login', { bodyLimit: 16384 }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const auth = service();
    await auth.throttle(request.ip, input.loginIdentifier);
    const result = await auth.login(
      input.loginIdentifier,
      input.password,
      request.cookies[COOKIE],
      request.id,
    );
    reply.setCookie(COOKIE, result.token, { ...cookie, expires: result.expiresAt });
    return { authenticated: true };
  });
  app.get('/auth/me', async (request) => {
    const { session } = await authorize(request);
    return { user: session.user, expiresAt: session.expiresAt };
  });
  app.post('/auth/logout', async (request, reply) => {
    const { auth, principal } = await authorize(request);
    await auth.logout(principal, request.id);
    clear(reply);
    return { loggedOut: true };
  });
  app.post('/auth/password', { bodyLimit: 16384 }, async (request, reply) => {
    const { auth, principal } = await authorize(request);
    await auth.changePassword(principal, changePasswordSchema.parse(request.body), request.id);
    clear(reply);
    return { changed: true, loginRequired: true };
  });
  app.get('/users', async (request) => {
    const { auth, principal } = await authorize(request, 'accounts.manage');
    const query = z
      .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
      .parse(request.query);
    return auth.list(principal, query.page);
  });
  app.post('/users', { bodyLimit: 16384 }, async (request, reply) => {
    const { auth, principal } = await authorize(request, 'accounts.manage');
    return reply
      .code(201)
      .send(await auth.create(principal, createAccountSchema.parse(request.body), request.id));
  });
  app.patch('/users/:id', { bodyLimit: 16384 }, async (request) => {
    const { auth, principal } = await authorize(request, 'accounts.manage');
    return auth.edit(principal, idOf(request), editAccountSchema.parse(request.body), request.id);
  });
  app.post('/users/:id/password', { bodyLimit: 16384 }, async (request) => {
    const { auth, principal } = await authorize(request, 'accounts.manage');
    await auth.resetPassword(
      principal,
      idOf(request),
      resetPasswordSchema.parse(request.body),
      request.id,
    );
    return { changed: true };
  });
  app.get('/security/events', async (request) => {
    const { auth, principal } = await authorize(request, 'security.review');
    return auth.events(principal);
  });
}
