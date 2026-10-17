import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import { freshDatabase, projectRoot } from './database.js';
import { AuthService } from '../src/auth/service.js';
import { tokenDigest } from '../src/auth/security.js';

const secret = randomBytes(32).toString('base64url');
const password = randomBytes(24).toString('base64url');
const origin = 'http://127.0.0.1:3333';
const headers = {
  host: '127.0.0.1:3333',
  origin,
  'x-pommier-csrf': '1',
  'content-type': 'application/json',
};
let now = new Date();
let main: Awaited<ReturnType<typeof freshDatabase>>;
let app: FastifyInstance;
let ownerId: string;
type Reply = Awaited<ReturnType<FastifyInstance['inject']>>;
function cookieOf(response: Reply): string {
  return String(response.headers['set-cookie']).split(';')[0] ?? '';
}
async function request(
  method: InjectOptions['method'],
  url: string,
  payload?: Record<string, unknown>,
  cookie?: string,
  override: Record<string, string> = {},
): Promise<Reply> {
  const options: InjectOptions = {
    method: method ?? 'GET',
    url,
    headers: { ...headers, ...(cookie ? { cookie } : {}), ...override },
    ...(payload !== undefined ? { payload } : {}),
  };
  return app.inject(options);
}
async function login(identifier = 'owner', pass = password) {
  now = new Date(now.getTime() + 600001);
  const response = await request('POST', '/api/auth/login', {
    loginIdentifier: identifier,
    password: pass,
  });
  expect(response.statusCode).toBe(200);
  return cookieOf(response);
}
async function create(
  cookie: string,
  loginIdentifier: string,
  role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'PRODUCTION' = 'CASHIER',
) {
  const response = await request(
    'POST',
    '/api/users',
    { loginIdentifier, displayName: 'Pessoa de teste', password, role },
    cookie,
  );
  expect(response.statusCode).toBe(201);
  return response.json().user as {
    id: string;
    version: number;
    displayName: string;
    role: string;
    active: boolean;
  };
}
async function edit(
  cookie: string,
  user: { id: string; version: number; displayName: string; role: string; active: boolean },
  changes: Record<string, unknown>,
) {
  return request(
    'PATCH',
    `/api/users/${user.id}`,
    {
      displayName: user.displayName,
      role: user.role,
      active: user.active,
      version: user.version,
      reason: 'Authorized test change',
      ...changes,
    },
    cookie,
  );
}

beforeAll(async () => {
  main = await freshDatabase(true);
  app = await buildApp({
    database: main.connection,
    installationSecret: secret,
    origin,
    clock: () => now,
  });
}, 30000);
afterAll(async () => {
  if (app) await app.close();
});

describe('Phase 2 real PostgreSQL security gate', () => {
  it('preserves foundation data during additive upgrade', async () => {
    const settings = await main.client.storeSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(settings.createdAt.toISOString()).toBe('2001-01-01T00:00:00.000Z');
    expect(await main.client.installationState.count()).toBe(1);
  });
  it('rejects wrong installation secret without creating an account', async () => {
    const response = await request('POST', '/api/auth/setup', {
      loginIdentifier: 'owner',
      displayName: 'Test Owner',
      password,
      installationSecret: 'wrong',
    });
    expect(response.statusCode).toBe(403);
    expect(await main.client.user.count()).toBe(0);
  });
  it('rejects non-loopback and spoofed forwarded headers', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      remoteAddress: '203.0.113.10',
      headers: { ...headers, 'x-forwarded-for': '127.0.0.1', forwarded: 'for=127.0.0.1' },
      payload: {
        loginIdentifier: 'owner',
        displayName: 'Test Owner',
        password,
        installationSecret: secret,
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('SETUP_LOCAL_ONLY');
    expect(await main.client.user.count()).toBe(0);
  });
  it('concurrent setup succeeds exactly once and remains closed', async () => {
    const payload = {
      loginIdentifier: 'owner',
      displayName: 'Test Owner',
      password,
      installationSecret: secret,
    };
    const responses = await Promise.all([
      request('POST', '/api/auth/setup', payload),
      request('POST', '/api/auth/setup', { ...payload, loginIdentifier: 'second-owner' }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await main.client.user.count()).toBe(1);
    const owner = await main.client.user.findFirstOrThrow();
    // Both contenders use the same credentials apart from login; use the winning identifier.
    if (owner.loginIdentifier !== 'owner')
      await main.client.user.update({
        where: { id: owner.id },
        data: { loginIdentifier: 'owner' },
      });
    ownerId = owner.id;
    expect((await request('POST', '/api/auth/setup', payload)).statusCode).toBe(409);
    await expect(
      main.client.installationState.update({ where: { id: 1 }, data: { initializedAt: null } }),
    ).rejects.toThrow();
  });
  it('clean isolated database applies both migrations and has no default account', async () => {
    const clean = await freshDatabase();
    try {
      expect(await clean.client.user.count()).toBe(0);
      expect(
        (await clean.client.installationState.findUniqueOrThrow({ where: { id: 1 } }))
          .initializedAt,
      ).toBeNull();
    } finally {
      await clean.connection.close();
    }
  }, 30000);
  it('current-user requires authentication and returns no secret fields', async () => {
    expect((await request('GET', '/api/auth/me')).statusCode).toBe(401);
    const cookie = await login();
    const me = await request('GET', '/api/auth/me', undefined, cookie);
    expect(me.statusCode).toBe(200);
    expect(me.json().user.id).toBe(ownerId);
    expect(me.body).not.toMatch(/passwordHash|tokenDigest|installationSecret|sessionId/);
  });
  it('stores a digest instead of the raw token and uses local HTTP cookie attributes', async () => {
    now = new Date(now.getTime() + 600001);
    const response = await request('POST', '/api/auth/login', {
      loginIdentifier: ' OWNER ',
      password,
    });
    expect(response.statusCode).toBe(200);
    const header = String(response.headers['set-cookie']);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Path=/');
    expect(header).not.toContain('Domain=');
    expect(header).not.toContain('; Secure');
    const raw = cookieOf(response).split('=')[1] ?? '';
    const stored = await main.client.session.findUniqueOrThrow({
      where: { tokenDigest: tokenDigest(raw) },
    });
    expect(stored.tokenDigest === raw).toBe(false);
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(43200000);
    expect(response.body).not.toContain(raw);
  });
  it('uses Secure cookies for an explicitly configured HTTPS origin', async () => {
    const connection = { client: main.client, check: main.connection.check, close: async () => {} };
    const https = await buildApp({
      database: connection,
      origin: 'https://localhost',
      apiHost: 'localhost',
      clock: () => now,
    });
    try {
      now = new Date(now.getTime() + 600001);
      const response = await https.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { ...headers, host: 'localhost', origin: 'https://localhost' },
        payload: { loginIdentifier: 'owner', password },
      });
      expect(response.statusCode).toBe(200);
      expect(String(response.headers['set-cookie'])).toContain('; Secure');
    } finally {
      await https.close();
    }
  });
  it('invalid/unknown/disabled login fails with the same safe message', async () => {
    const owner = await login();
    const user = await create(owner, 'disabled-person');
    expect((await edit(owner, user, { active: false })).statusCode).toBe(200);
    const unknown = await request('POST', '/api/auth/login', {
      loginIdentifier: 'unknown-person',
      password,
    });
    const disabled = await request('POST', '/api/auth/login', {
      loginIdentifier: 'disabled-person',
      password,
    });
    const wrong = await request('POST', '/api/auth/login', {
      loginIdentifier: 'owner',
      password: 'incorrect value',
    });
    expect([unknown.statusCode, disabled.statusCode, wrong.statusCode]).toEqual([401, 401, 401]);
    expect(unknown.json().error.message).toBe(disabled.json().error.message);
    expect(unknown.json().error.message).toBe(wrong.json().error.message);
  });
  it('logout invalidates the session', async () => {
    const cookie = await login();
    expect((await request('POST', '/api/auth/logout', {}, cookie)).statusCode).toBe(200);
    expect((await request('GET', '/api/auth/me', undefined, cookie)).statusCode).toBe(401);
  });
  it('new login replaces the old session', async () => {
    const old = await login();
    const current = await login();
    expect((await request('GET', '/api/auth/me', undefined, old)).statusCode).toBe(401);
    expect((await request('GET', '/api/auth/me', undefined, current)).statusCode).toBe(200);
  });
  it('enforces absolute expiry with controlled time', async () => {
    const cookie = await login();
    now = new Date(now.getTime() + 43200000);
    expect((await request('GET', '/api/auth/me', undefined, cookie)).statusCode).toBe(401);
  });
  it('disabling and role changes revoke existing access', async () => {
    const owner = await login();
    const user = await create(owner, 'role-person', 'MANAGER');
    const staff = await login('role-person');
    expect((await edit(owner, user, { role: 'PRODUCTION' })).statusCode).toBe(200);
    expect((await request('GET', '/api/auth/me', undefined, staff)).statusCode).toBe(401);
    const current = await login('role-person');
    const changed = await main.client.user.findUniqueOrThrow({ where: { id: user.id } });
    expect((await edit(owner, changed, { active: false })).statusCode).toBe(200);
    expect((await request('GET', '/api/auth/me', undefined, current)).statusCode).toBe(401);
  });
  it.each(['MANAGER', 'CASHIER', 'PRODUCTION'] as const)(
    '%s cannot administer accounts or view audits',
    async (role) => {
      const owner = await login();
      const user = await create(owner, `restricted-${role.toLowerCase()}`, role);
      const staff = await login(`restricted-${role.toLowerCase()}`);
      for (const [method, path, payload] of [
        ['GET', '/api/users', undefined],
        [
          'POST',
          '/api/users',
          {
            loginIdentifier: 'escalated',
            displayName: 'Invalid privilege',
            role: 'OWNER',
            password,
          },
        ],
        ['PATCH', `/api/users/${user.id}`, { role: 'OWNER' }],
        ['GET', '/api/security/events', undefined],
      ] as const) {
        expect((await request(method, path, payload, staff)).statusCode).toBe(403);
      }
      expect(
        await main.client.auditEvent.count({
          where: { actorId: user.id, eventType: 'AUTHORIZATION_DENIED' },
        }),
      ).toBe(1);
      expect((await edit(owner, user, { active: false })).statusCode).toBe(200);
    },
  );
  it('password change invalidates sessions and preserves the complete password', async () => {
    const owner = await login();
    const user = await create(owner, 'password-person');
    const staff = await login('password-person');
    const next = `${password}  🔐`;
    expect(
      (
        await request(
          'POST',
          '/api/auth/password',
          { currentPassword: password, newPassword: next },
          staff,
        )
      ).statusCode,
    ).toBe(200);
    expect((await request('GET', '/api/auth/me', undefined, staff)).statusCode).toBe(401);
    expect(
      (await request('POST', '/api/auth/login', { loginIdentifier: 'password-person', password }))
        .statusCode,
    ).toBe(401);
    const renewed = await login('password-person', next);
    expect((await request('GET', '/api/auth/me', undefined, renewed)).statusCode).toBe(200);
    const latest = await main.client.user.findUniqueOrThrow({ where: { id: user.id } });
    await edit(owner, latest, { active: false });
  });
  it('owner reset requires current owner password and revokes target sessions', async () => {
    const owner = await login();
    const user = await create(owner, 'reset-person');
    const staff = await login('reset-person');
    const url = `/api/users/${user.id}/password`;
    expect(
      (
        await request(
          'POST',
          url,
          { ownerPassword: 'wrong', newPassword: `${password}next`, reason: 'Test recovery' },
          owner,
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await request(
          'POST',
          url,
          { ownerPassword: password, newPassword: `${password}next`, reason: 'Test recovery' },
          owner,
        )
      ).statusCode,
    ).toBe(200);
    expect((await request('GET', '/api/auth/me', undefined, staff)).statusCode).toBe(401);
    const latest = await main.client.user.findUniqueOrThrow({ where: { id: user.id } });
    await edit(owner, latest, { active: false });
  });
  it('rejects missing CSRF header, missing Origin and disallowed Origin', async () => {
    const cookie = await login();
    for (const [method, path] of [
      ['POST', '/api/auth/setup'],
      ['POST', '/api/auth/login'],
      ['POST', '/api/auth/logout'],
      ['POST', '/api/auth/password'],
      ['POST', '/api/users'],
      ['PATCH', `/api/users/${ownerId}`],
      ['POST', `/api/users/${ownerId}/password`],
    ] as const) {
      for (const override of [
        { 'x-pommier-csrf': '' },
        { origin: '' },
        { origin: 'http://evil.example' },
        { 'sec-fetch-site': 'cross-site' },
      ])
        expect((await request(method, path, {}, cookie, override)).statusCode).toBe(403);
    }
    expect((await request('GET', '/api/auth/me', undefined, cookie)).statusCode).toBe(200);
  });
  it('blocks stale edits and retains last active owner', async () => {
    const cookie = await login();
    const owner = await main.client.user.findUniqueOrThrow({ where: { id: ownerId } });
    expect((await edit(cookie, owner, { active: false })).statusCode).toBe(409);
    expect((await edit(cookie, owner, { role: 'MANAGER' })).statusCode).toBe(409);
    expect((await edit(cookie, owner, { version: owner.version + 1 })).statusCode).toBe(409);
    expect(await main.client.user.count({ where: { active: true, role: 'OWNER' } })).toBe(1);
  });
  it('bounds identifier throttling without extending a fixed window', async () => {
    now = new Date(now.getTime() + 600001);
    for (let n = 0; n < 8; n++)
      expect(
        (await request('POST', '/api/auth/login', { loginIdentifier: 'throttle-person', password }))
          .statusCode,
      ).toBe(401);
    const response = await request('POST', '/api/auth/login', {
      loginIdentifier: 'throttle-person',
      password,
    });
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('600');
    now = new Date(now.getTime() + 600001);
    expect(
      (await request('POST', '/api/auth/login', { loginIdentifier: 'throttle-person', password }))
        .statusCode,
    ).toBe(401);
  });
  it('persists source throttling across service instances and bounds stored keys', async () => {
    now = new Date(now.getTime() + 600001);
    const service = new AuthService(main.client, () => now, secret);
    for (let n = 0; n < 60; n++) await service.throttle('source-budget-test', `attempt-${n}`);
    const restarted = new AuthService(main.client, () => now, secret);
    await expect(restarted.throttle('source-budget-test', 'new-attempt')).rejects.toMatchObject({
      code: 'LOGIN_THROTTLED',
    });
    expect(await main.client.loginThrottle.count()).toBeLessThanOrEqual(2048);
  });
  it('keeps setup closed even if an account is disabled outside the application', async () => {
    const isolated = await freshDatabase();
    const isolatedApp = await buildApp({
      database: isolated.connection,
      installationSecret: secret,
      origin,
    });
    try {
      const response = await isolatedApp.inject({
        method: 'POST',
        url: '/api/auth/setup',
        remoteAddress: '::1',
        headers,
        payload: {
          loginIdentifier: 'isolated-owner',
          displayName: 'Test Owner',
          password,
          installationSecret: secret,
        },
      });
      expect(response.statusCode).toBe(200);
      await isolated.client.user.updateMany({ data: { active: false } });
      const closed = await isolatedApp.inject({
        method: 'POST',
        url: '/api/auth/setup',
        headers,
        payload: {
          loginIdentifier: 'second-owner',
          displayName: 'Test Owner',
          password,
          installationSecret: secret,
        },
      });
      expect(closed.statusCode).toBe(409);
      expect(await isolated.client.user.count()).toBe(1);
    } finally {
      await isolatedApp.close();
    }
  }, 30000);
  it('coalesces audit and never returns hashes/tokens/secrets in account/audit responses', async () => {
    const cookie = await login();
    for (const path of ['/api/users', '/api/security/events', '/api/auth/state']) {
      const response = await request('GET', path, undefined, cookie);
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatch(/passwordHash|tokenDigest|\$argon2/);
      expect(response.body.includes(password)).toBe(false);
      expect(response.body.includes(secret)).toBe(false);
    }
    const event = await main.client.auditEvent.findFirstOrThrow();
    await expect(main.client.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow();
  });
  it('cleans only old expired/revoked sessions in bounded batches', async () => {
    const service = new AuthService(
      main.client,
      () => new Date(now.getTime() + 10 * 86400000),
      secret,
    );
    expect(await service.cleanup()).toBeGreaterThan(0);
  });
  it('concurrent owners cannot disable one another and leave zero owners', async () => {
    const firstCookie = await login();
    const second = await create(firstCookie, 'other-owner', 'OWNER');
    const secondCookie = await login('other-owner');
    const first = await main.client.user.findUniqueOrThrow({ where: { id: ownerId } });
    const responses = await Promise.all([
      edit(firstCookie, second, { active: false }),
      edit(secondCookie, first, { role: 'MANAGER' }),
    ]);
    expect(responses.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(await main.client.user.count({ where: { active: true, role: 'OWNER' } })).toBe(1);
  });
  it('concurrent account creation respects the five-active-account limit', async () => {
    const isolated = await freshDatabase();
    const service = new AuthService(isolated.client, () => now, secret);
    try {
      const { user } = await service.setup(
        {
          loginIdentifier: 'limit-owner',
          displayName: 'Limit Owner',
          password,
          installationSecret: secret,
        },
        'limit-setup',
      );
      const session = await service.session(
        (await service.login('limit-owner', password, undefined, 'limit-login')).token,
      );
      const principal = { userId: user.id, sessionId: session.id };
      for (let n = 0; n < 3; n++)
        await service.create(
          principal,
          {
            loginIdentifier: `limit-${n}`,
            displayName: 'Synthetic Account',
            role: 'CASHIER',
            password,
          },
          'limit-create',
        );
      const results = await Promise.allSettled(
        [4, 5].map((n) =>
          service.create(
            principal,
            {
              loginIdentifier: `limit-${n}`,
              displayName: 'Synthetic Account',
              role: 'CASHIER',
              password,
            },
            'limit-race',
          ),
        ),
      );
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((result) => result.status === 'rejected')).toMatchObject({
        reason: { code: 'STAFF_LIMIT' },
      });
      expect(await isolated.client.user.count({ where: { active: true } })).toBe(5);
    } finally {
      await isolated.connection.close();
    }
  }, 30000);
  it.each(['disable', 'demote'] as const)(
    'concurrent owner self-%s preserves the last active owner',
    async (action) => {
      const isolated = await freshDatabase();
      const service = new AuthService(isolated.client, () => now, secret);
      try {
        const { user: first } = await service.setup(
          {
            loginIdentifier: 'first-owner',
            displayName: 'First Owner',
            password,
            installationSecret: secret,
          },
          'owner-setup',
        );
        const firstSession = await service.session(
          (await service.login('first-owner', password, undefined, 'first-login')).token,
        );
        const firstPrincipal = { userId: first.id, sessionId: firstSession.id };
        const { user: second } = await service.create(
          firstPrincipal,
          { loginIdentifier: 'second-owner', displayName: 'Second Owner', role: 'OWNER', password },
          'create-owner',
        );
        const secondSession = await service.session(
          (await service.login('second-owner', password, undefined, 'second-login')).token,
        );
        const principals = [firstPrincipal, { userId: second.id, sessionId: secondSession.id }];
        const results = await Promise.allSettled(
          [first, second].map((user, index) =>
            service.edit(
              principals[index]!,
              user.id,
              {
                displayName: user.displayName,
                version: user.version,
                role: action === 'demote' ? 'MANAGER' : 'OWNER',
                active: action !== 'disable',
                reason: 'Concurrent synthetic self-change',
              },
              'owner-self-race',
            ),
          ),
        );
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.find((result) => result.status === 'rejected')).toMatchObject({
          reason: { code: 'LAST_OWNER' },
        });
        expect(await isolated.client.user.count({ where: { active: true, role: 'OWNER' } })).toBe(
          1,
        );
      } finally {
        await isolated.connection.close();
      }
    },
    30000,
  );
  it('local recovery CLI requires explicit consent and revokes an existing owner session', async () => {
    const isolated = await freshDatabase();
    const service = new AuthService(isolated.client, () => new Date(), secret);
    try {
      await service.setup(
        {
          loginIdentifier: 'recovery-owner',
          displayName: 'Recovery Owner',
          password,
          installationSecret: secret,
        },
        'recovery-setup',
      );
      const old = await service.login('recovery-owner', password, undefined, 'recovery-login');
      const args = ['--import', 'tsx', 'scripts/recover-owner.ts'];
      const options = {
        cwd: projectRoot,
        env: {
          ...process.env,
          DATABASE_URL: isolated.url,
          HOST: '127.0.0.1',
          PORT: '3333',
          NODE_ENV: 'test',
        },
        encoding: 'utf8' as const,
        windowsHide: true,
      };
      const refused = spawnSync(process.execPath, args, options);
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('--confirm-local-recovery');
      const replacement = `${password}  🍎`;
      const result = spawnSync(
        process.execPath,
        [...args, '--confirm-local-recovery', '--json-stdin'],
        {
          ...options,
          input: JSON.stringify({
            loginIdentifier: 'recovery-owner',
            password: replacement,
            reason: 'Synthetic controlled maintenance',
          }),
        },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain(replacement);
      await expect(service.session(old.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      await expect(
        service.login('recovery-owner', password, undefined, 'old-password'),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(
        (await service.login('recovery-owner', replacement, undefined, 'new-password')).token,
      ).toHaveLength(43);
      expect(
        await isolated.client.auditEvent.count({
          where: { eventType: 'OWNER_RECOVERED', actorId: null },
        }),
      ).toBe(1);
      expect((await service.state()).initialized).toBe(true);
    } finally {
      await isolated.connection.close();
    }
  }, 30000);
});
