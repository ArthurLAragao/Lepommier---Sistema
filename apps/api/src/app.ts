import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import cookie from '@fastify/cookie';
import { AuthService } from './auth/service.js';
import { registerAuthRoutes } from './auth/routes.js';
import {
  APP_VERSION,
  BUSINESS_TIMEZONE,
  businessDateOf,
  systemStatusSchema,
} from '@pommier/shared';
import { installErrorHandler } from './errors.js';
import type { DatabaseProbe } from './database.js';

export interface AppOptions {
  database: DatabaseProbe;
  logger?: boolean;
  webRoot?: string;
  clock?: () => Date;
  origin?: string;
  apiHost?: string;
  installationSecret?: string;
}

export async function buildApp(options: AppOptions) {
  const clock = options.clock ?? (() => new Date());
  const app = Fastify({
    logger: options.logger
      ? {
          level: 'info',
          redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
          serializers: {
            req: (req: { method: string; id: string }) => ({
              method: req.method,
              requestId: req.id,
            }),
          },
        }
      : false,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    bodyLimit: 1024 * 1024,
    trustProxy: false,
    requestTimeout: 10000,
  });
  installErrorHandler(app);
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    strictTransportSecurity: false, // Loopback HTTP. Enable HSTS only after an intentional HTTPS/LAN deployment.
  });
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    if (request.url.startsWith('/api')) reply.header('cache-control', 'no-store');
  });
  app.addHook('onClose', async () => {
    await options.database.close();
  });

  const auth = options.database.client
    ? new AuthService(options.database.client, clock, options.installationSecret)
    : undefined;
  await app.register(
    async (authApp) =>
      registerAuthRoutes(authApp, {
        ...(auth ? { service: auth } : {}),
        origin: options.origin ?? 'http://127.0.0.1:3333',
        apiHost: options.apiHost ?? '127.0.0.1:3333',
      }),
    { prefix: '/api' },
  );
  if (auth) {
    const cleanup = () => {
      void auth
        .cleanup()
        .catch(() =>
          app.log.warn(
            { event: 'session_cleanup_failed' },
            'Não foi possível limpar os acessos expirados.',
          ),
        );
    };
    app.addHook('onReady', async () => {
      cleanup();
    });
    const timer = setInterval(cleanup, 3_600_000);
    timer.unref();
    app.addHook('onClose', async () => {
      clearInterval(timer);
    });
  }

  app.get('/api/health/live', async () => ({ status: 'ok', version: APP_VERSION }));
  app.get('/api/health/ready', async (_request, reply) => {
    const database = await options.database.check();
    return reply
      .status(database.status === 'ready' ? 200 : 503)
      .send({ status: database.status === 'ready' ? 'ready' : 'not_ready', database });
  });
  app.get('/api/system/status', async () => {
    const database = await options.database.check();
    const now = clock();
    return systemStatusSchema.parse({
      version: APP_VERSION,
      phase: 2,
      businessTimezone: BUSINESS_TIMEZONE,
      businessDate: businessDateOf(now),
      timestamp: now.toISOString(),
      database,
      operational: false,
    });
  });

  if (options.webRoot) {
    await app.register(fastifyStatic, { root: options.webRoot, index: false });
    app.get('/', (_request, reply) => reply.sendFile('index.html'));
  }
  app.setNotFoundHandler((request, reply) => {
    if (
      options.webRoot &&
      request.method === 'GET' &&
      !request.url.startsWith('/api') &&
      request.headers.accept?.includes('text/html') &&
      !request.url.split('?')[0]?.split('/').at(-1)?.includes('.')
    ) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Esta página ou operação não está disponível.',
        requestId: request.id,
      },
    });
  });
  return app;
}
