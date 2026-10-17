import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiErrorSchema, systemStatusSchema } from '@pommier/shared';
import { buildApp } from './app.js';
import { AppError } from './errors.js';
import { parseConfig } from './config.js';
import type { FastifyInstance } from 'fastify';
import type { DatabaseProbe } from './database.js';
import { fileURLToPath } from 'node:url';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function create(status: 'ready' | 'unavailable' | 'not_configured' = 'not_configured') {
  const probe: DatabaseProbe = {
    check: async () => ({ status, checkedAt: '2026-10-18T02:30:00.000Z' }),
    close: async () => {},
  };
  const app = await buildApp({
    database: probe,
    clock: () => new Date('2026-10-18T02:30:00.000Z'),
  });
  apps.push(app);
  return app;
}

describe('foundation API contracts (no database behavior claimed)', () => {
  it('serves the production entrypoint while keeping unknown API paths out of SPA fallback', async () => {
    const app = await buildApp({
      database: {
        check: async () => ({ status: 'not_configured', checkedAt: new Date().toISOString() }),
        close: async () => {},
      },
      webRoot: fileURLToPath(new URL('../test/fixtures/web', import.meta.url)),
    });
    apps.push(app);
    const index = await app.inject({ url: '/', headers: { accept: 'text/html' } });
    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toContain('text/html');
    expect(index.body).toContain('foundation-static-fixture');
    expect(
      (await app.inject({ url: '/api/missing', headers: { accept: 'text/html' } })).statusCode,
    ).toBe(404);
    expect((await app.inject('/missing.js')).statusCode).toBe(404);
  });
  it('separates HTTP liveness from unavailable database readiness', async () => {
    const app = await create('unavailable');
    expect((await app.inject('/api/health/live')).statusCode).toBe(200);
    const response = await app.inject('/api/health/ready');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'not_ready',
      database: { status: 'unavailable' },
    });
  });
  it('reports readiness only when the probe is ready', async () => {
    const response = await (await create('ready')).inject('/api/health/ready');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ready' });
  });
  it('returns validated metadata with Fortaleza day and no invented operational totals', async () => {
    const response = await (await create()).inject('/api/system/status');
    const payload = systemStatusSchema.parse(response.json());
    expect(payload.businessDate).toBe('2026-10-17');
    expect(payload.operational).toBe(false);
    expect(payload.database.status).toBe('not_configured');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
  it('generates safe unique correlation IDs, ignoring untrusted incoming IDs', async () => {
    const app = await create();
    const first = await app.inject({
      url: '/api/not-built',
      headers: { 'x-request-id': 'attacker-input' },
    });
    const second = await app.inject('/api/not-built');
    const payload = apiErrorSchema.parse(first.json());
    expect(first.statusCode).toBe(404);
    expect(payload.error.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(payload.error.requestId).toBe(first.headers['x-request-id']);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });
  it('hides internal exception messages and stack traces', async () => {
    const app = await create();
    app.get('/api/test-failure', async () => {
      throw new Error('postgresql://secret:password@private-host');
    });
    const response = await app.inject('/api/test-failure');
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toMatch(/password|postgresql|private-host|stack/);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('INTERNAL_ERROR');
  });
  it('returns understandable field validation errors', async () => {
    const app = await create();
    app.post('/api/test-validation', async (request) =>
      z.object({ quantity: z.number().int().positive() }).parse(request.body),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/test-validation',
      payload: { quantity: 1.5 },
    });
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.fields?.quantity).toEqual([
      'Confira o valor informado.',
    ]);
  });
  it('returns controlled domain errors and rejects malformed JSON', async () => {
    const app = await create();
    app.post('/api/test-domain', async () => {
      throw new AppError(409, 'STOCK_CONFLICT', 'O estoque mudou. Confira as quantidades.');
    });
    const conflict = await app.inject({ method: 'POST', url: '/api/test-domain', payload: {} });
    expect(conflict.statusCode).toBe(409);
    expect(apiErrorSchema.parse(conflict.json()).error.code).toBe('STOCK_CONFLICT');
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/test-domain',
      headers: { 'content-type': 'application/json' },
      payload: '{bad',
    });
    expect(malformed.statusCode).toBe(400);
    expect(apiErrorSchema.parse(malformed.json()).error.code).toBe('INVALID_REQUEST');
  });
  it('never exposes a future operational endpoint as functional', async () => {
    const response = await (
      await create()
    ).inject({ method: 'POST', url: '/api/sales', payload: {} });
    expect(response.statusCode).toBe(404);
  });
  it('closes the database resource on graceful shutdown', async () => {
    let closed = false;
    const app = await buildApp({
      database: {
        check: async () => ({ status: 'ready', checkedAt: new Date().toISOString() }),
        close: async () => {
          closed = true;
        },
      },
    });
    await app.ready();
    await app.close();
    expect(closed).toBe(true);
  });
});

describe('runtime configuration', () => {
  it('binds loopback and rejects accidental public binding', () => {
    expect(parseConfig({}).HOST).toBe('127.0.0.1');
    expect(() => parseConfig({ HOST: '0.0.0.0' })).toThrow();
    expect(() => parseConfig({ DATABASE_URL: 'file:local.db' })).toThrow();
    expect(() => parseConfig({ PORT: '' })).toThrow();
  });
});
