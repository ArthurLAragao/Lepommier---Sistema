import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import { freshDatabase } from './database.js';
import { AuthService, securityLock, type Principal } from '../src/auth/service.js';
import { RegistryService } from '../src/registry/service.js';
import { CustomerImports } from '../src/registry/imports.js';
import { customerQuerySchema, customerCreateSchema } from '@pommier/shared';

const password = randomBytes(24).toString('base64url');
const secret = randomBytes(32).toString('base64url');
const origin = 'http://127.0.0.1:3333';
const baseHeaders = {
  host: '127.0.0.1:3333',
  origin,
  'content-type': 'application/json',
  'x-pommier-csrf': '1',
};
let app: FastifyInstance;
let db: Awaited<ReturnType<typeof freshDatabase>>;
let cookie: string;
let now = new Date();
type Reply = Awaited<ReturnType<FastifyInstance['inject']>>;
async function request(
  method: InjectOptions['method'],
  url: string,
  payload?: unknown,
  session = cookie,
): Promise<Reply> {
  return app.inject({
    method: method ?? 'GET',
    url,
    headers: { ...baseHeaders, ...(session ? { cookie: session } : {}) },
    ...(payload !== undefined ? { payload } : {}),
  } as InjectOptions);
}
async function createCustomer(data: Record<string, unknown>, session = cookie) {
  const response = await request('POST', '/api/customers', data, session);
  expect(response.statusCode, response.json().error?.code).toBe(201);
  return response.json().customer as {
    id: string;
    version: number;
    name: string;
    registration: string;
  };
}
async function createAccount(login: string, role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'PRODUCTION') {
  const created = await request('POST', '/api/users', {
    loginIdentifier: login,
    displayName: 'Synthetic Registry Role',
    role,
    password,
  });
  expect(created.statusCode).toBe(201);
  const response = await request(
    'POST',
    '/api/auth/login',
    { loginIdentifier: login, password },
    '',
  );
  expect(response.statusCode).toBe(200);
  return {
    user: created.json().user as { id: string; version: number },
    cookie: String(response.headers['set-cookie']).split(';')[0]!,
  };
}
async function preview(
  csv: string,
  mapping: Record<string, string> = { name: 'nome', phone: 'telefone' },
) {
  const r = await request('POST', '/api/customer-imports/preview', {
    csv,
    delimiter: ';',
    mapping,
  });
  expect(r.statusCode, r.json().error?.code).toBe(200);
  return r.json() as {
    id: string;
    reviewToken: string;
    rows: Array<{ row: number; errors: string[]; duplicates: Array<{ type: string }> }>;
  };
}
async function cancel(job: { id: string }) {
  expect((await request('POST', `/api/customer-imports/${job.id}/cancel`, {})).statusCode).toBe(
    200,
  );
}
let manager: Awaited<ReturnType<typeof createAccount>>;
let cashier: Awaited<ReturnType<typeof createAccount>>;
let production: Awaited<ReturnType<typeof createAccount>>;
let category: { id: string; name: string; active: boolean; version: number };
const productBody = (code = 'TEST-PRODUCT') => ({
  code,
  name: 'Synthetic Product',
  categoryId: category.id,
  origin: 'PRODUCED',
  sellingPriceCents: 1250,
  estimatedCostCents: 450,
  active: true,
});
beforeAll(async () => {
  db = await freshDatabase();
  app = await buildApp({
    database: db.connection,
    origin,
    installationSecret: secret,
    clock: () => now,
  });
  expect(
    (
      await request(
        'POST',
        '/api/auth/setup',
        {
          loginIdentifier: 'registry-owner',
          displayName: 'Synthetic Registry Owner',
          password,
          installationSecret: secret,
        },
        '',
      )
    ).statusCode,
  ).toBe(200);
  const response = await request(
    'POST',
    '/api/auth/login',
    { loginIdentifier: 'registry-owner', password },
    '',
  );
  cookie = String(response.headers['set-cookie']).split(';')[0]!;
  manager = await createAccount('registry-manager', 'MANAGER');
  cashier = await createAccount('registry-cashier', 'CASHIER');
  production = await createAccount('registry-production', 'PRODUCTION');
}, 60000);
afterAll(async () => {
  if (app) await app.close();
});

describe('Phase 3 against isolated real PostgreSQL', () => {
  it('creates a customer with only the required name and defaults marketing to UNKNOWN', async () => {
    const customer = await createCustomer({ name: '  Nome mínimo sintético  ' });
    const stored = await db.client.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(stored.name).toBe('Nome mínimo sintético');
    expect(stored.marketingState).toBe('UNKNOWN');
    expect(stored.phone).toBeNull();
    expect(stored.registrationNumber).toBeGreaterThan(0);
    expect((await request('POST', '/api/customers', { name: '' })).statusCode).toBe(400);
  });
  it('allocates immutable unique registration numbers concurrently without using phone/CPF', async () => {
    const results = await Promise.all([
      createCustomer({ name: 'Concorrente Alfa' }),
      createCustomer({ name: 'Concorrente Beta' }),
    ]);
    expect(new Set(results.map((c) => c.registration)).size).toBe(2);
    await expect(
      db.client.customer.update({
        where: { id: results[0]!.id },
        data: { registrationNumber: 987654 },
      }),
    ).rejects.toThrow();
  });
  it('reviews shared phones but does not force phone uniqueness or merge households', async () => {
    await createCustomer({ name: 'Casa Sintética Alfa', phone: '(85) 99999-0001' });
    const fields = { name: 'Casa Sintética Beta', phone: '+5585999990001' };
    const review = await request('POST', '/api/customers/review', fields);
    expect(review.json().matches.some((m: { type: string }) => m.type === 'PHONE')).toBe(true);
    expect((await request('POST', '/api/customers', fields)).json().error.code).toBe(
      'DUPLICATE_REVIEW_REQUIRED',
    );
    await createCustomer({ ...fields, duplicateOverrideReason: 'SHARED_CONTACT' });
    expect(await db.client.customer.count({ where: { phone: '+5585999990001' } })).toBe(2);
  });
  it('treats valid duplicate CPF as a non-overridable review conflict', async () => {
    await createCustomer({ name: 'CPF Sintético Alfa', cpf: '529.982.247-25' });
    const conflict = await request('POST', '/api/customers', {
      name: 'CPF Sintético Beta',
      cpf: '52998224725',
      duplicateOverrideReason: 'CONFIRMED_DISTINCT',
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('CPF_CONFLICT');
    expect(conflict.body).not.toContain('52998224725');
  });
  it('rejects invalid CPF, ambiguous phones and impossible/incomplete/future birth dates', async () => {
    for (const fields of [
      { cpf: '11111111111' },
      { phone: '999990001' },
      { birthday: '1981-02-29' },
      { birthday: '29/02' },
      { birthday: '2099-01-01' },
    ])
      expect(
        (await request('POST', '/api/customers', { name: 'Validação sintética', ...fields }))
          .statusCode,
      ).toBe(400);
    const customer = await createCustomer({ name: 'Nascimento sintético', birthday: '1980-02-29' });
    const detail = await request('GET', `/api/customers/${customer.id}`);
    expect(detail.json().customer.birthday).toBe('1980-02-29');
  });
  it('searches and paginates with stable allowed sorting and role-scoped counts', async () => {
    await db.client.customer.createMany({
      data: Array.from({ length: 24 }, (_, n) => ({
        name: `Pagination Synthetic ${String(n).padStart(2, '0')}`,
        nameKey: `pagination synthetic ${String(n).padStart(2, '0')}`,
      })),
    });
    const first = await request('GET', '/api/customers?q=pagination&sort=registration&page=1');
    const second = await request('GET', '/api/customers?q=pagination&sort=registration&page=2');
    expect(first.json().items).toHaveLength(20);
    expect(second.json().items).toHaveLength(4);
    expect(first.json().total).toBe(24);
    expect(first.json().items[19].registrationNumber).toBeLessThan(
      second.json().items[0].registrationNumber,
    );
    expect(
      (await request('GET', '/api/customers?sort=cpf', undefined, cashier.cookie)).statusCode,
    ).toBe(400);
    expect(
      (await request('GET', '/api/customers?state=all', undefined, cashier.cookie)).statusCode,
    ).toBe(403);
  });
  it('returns role-specific list/detail projections and rejects restricted field writes', async () => {
    const customer = await createCustomer({
      name: 'Private Synthetic',
      phone: '85999990002',
      email: 'private@example.test',
      birthday: '1990-01-01',
      cpf: '11144477735',
      address: 'Synthetic reference',
      notes: 'Synthetic private note',
    });
    const owner = await request('GET', `/api/customers/${customer.id}`);
    expect(owner.json().customer.cpf).toBe('11144477735');
    const managed = await request(
      'GET',
      `/api/customers/${customer.id}`,
      undefined,
      manager.cookie,
    );
    expect(managed.json().customer.email).toBe('private@example.test');
    expect(managed.body).not.toMatch(/11144477735|Synthetic private note|"cpf"|"notes"/);
    const limited = await request(
      'GET',
      `/api/customers/${customer.id}`,
      undefined,
      cashier.cookie,
    );
    for (const key of ['email', 'birthday', 'cpf', 'address', 'notes', 'marketingState'])
      expect(limited.json().customer).not.toHaveProperty(key);
    const list = await request('GET', '/api/customers?q=private', undefined, cashier.cookie);
    expect(list.body).not.toMatch(
      /private@example.test|11144477735|Synthetic reference|Synthetic private note/,
    );
    expect(
      (
        await request(
          'POST',
          '/api/customers',
          { name: 'Forbidden private', cpf: '52998224725' },
          manager.cookie,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          'PATCH',
          `/api/customers/${customer.id}`,
          { name: customer.name, version: customer.version, email: 'override@example.test' },
          cashier.cookie,
        )
      ).statusCode,
    ).toBe(403);
    await createCustomer(
      { name: 'Cashier allowed creation', phone: '85999990003' },
      cashier.cookie,
    );
  });
  it('denies PRODUCTION all customer paths and denies bulk/privacy actions to other roles', async () => {
    const target = await createCustomer({ name: 'Access target synthetic' });
    for (const path of ['/api/customers', `/api/customers/${target.id}`])
      expect((await request('GET', path, undefined, production.cookie)).statusCode).toBe(403);
    for (const session of [manager.cookie, cashier.cookie, production.cookie]) {
      for (const path of [
        '/api/customers/export',
        '/api/customer-imports/inspect',
        '/api/customer-imports/preview',
        `/api/customer-imports/${target.id}/confirm`,
        `/api/customers/${target.id}/anonymize`,
        `/api/customers/${target.id}/marketing`,
      ])
        expect((await request('POST', path, {}, session)).statusCode).toBe(403);
      expect(
        (await request('GET', '/api/customer-imports/template', undefined, session)).statusCode,
      ).toBe(403);
    }
  });
  it('rejects concurrent stale customer edits and deactivation/edit conflicts', async () => {
    const customer = await createCustomer({ name: 'Concurrent edit synthetic' });
    const replies = await Promise.all(
      ['One', 'Two'].map((name) =>
        request('PATCH', `/api/customers/${customer.id}`, {
          name: `Concurrent ${name}`,
          version: customer.version,
        }),
      ),
    );
    expect(replies.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const latest = await db.client.customer.findUniqueOrThrow({ where: { id: customer.id } });
    const race = await Promise.all([
      request('PATCH', `/api/customers/${customer.id}`, {
        name: 'Concurrent final',
        version: latest.version,
      }),
      request('POST', `/api/customers/${customer.id}/status`, {
        version: latest.version,
        active: false,
        reason: 'RECORD_REVIEW',
      }),
    ]);
    expect(race.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });
  it('deactivates/reactivates without deleting references or changing marketing', async () => {
    const customer = await createCustomer({ name: 'Status synthetic' });
    const disabled = await request('POST', `/api/customers/${customer.id}/status`, {
      version: 1,
      active: false,
      reason: 'CUSTOMER_REQUEST',
    });
    expect(disabled.statusCode).toBe(200);
    expect(
      (await request('GET', `/api/customers/${customer.id}`, undefined, cashier.cookie)).statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', `/api/customers/${customer.id}/status`, {
          version: 2,
          active: true,
          reason: 'RECORD_REVIEW',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await db.client.customer.findUniqueOrThrow({ where: { id: customer.id } })).marketingState,
    ).toBe('UNKNOWN');
    expect((await request('DELETE', `/api/customers/${customer.id}`, {})).statusCode).toBe(404);
  });
  it('records preference history with actor/source/time but never infers opt-in', async () => {
    const customer = await createCustomer({ name: 'Marketing synthetic', phone: '85999990004' });
    expect(
      (await db.client.customer.findUniqueOrThrow({ where: { id: customer.id } })).marketingState,
    ).toBe('UNKNOWN');
    for (const [version, state] of [
      [1, 'OPTED_IN'],
      [2, 'OPTED_OUT'],
    ] as const)
      expect(
        (
          await request('POST', `/api/customers/${customer.id}/marketing`, {
            version,
            state,
            source: 'IN_PERSON',
            reason: 'CUSTOMER_REQUEST',
            evidence: 'Synthetic reference only',
          })
        ).statusCode,
      ).toBe(200);
    const detail = (await request('GET', `/api/customers/${customer.id}`)).json();
    expect(detail.marketingHistory).toHaveLength(2);
    expect(detail.customer.marketingState).toBe('OPTED_OUT');
    expect(
      detail.marketingHistory.every(
        (e: { actorId: string; source: string }) => e.actorId && e.source === 'IN_PERSON',
      ),
    ).toBe(true);
  });
  it('anonymizes intended PII, redacts preference evidence and invalidates previews without audit snapshots', async () => {
    const name = 'Erase Synthetic Personal';
    const email = 'erase-person@example.test';
    const customer = await createCustomer({
      name,
      email,
      phone: '85999990005',
      birthday: '1988-08-08',
      address: 'Erase personal reference',
      notes: 'Erase private text',
    });
    await request('POST', `/api/customers/${customer.id}/marketing`, {
      version: 1,
      state: 'OPTED_IN',
      source: 'CUSTOMER_REQUEST',
      reason: 'CUSTOMER_REQUEST',
      evidence: name,
    });
    const job = await preview(`nome;telefone\n${name};85999990005`);
    expect(
      (
        await request('POST', `/api/customers/${customer.id}/anonymize`, {
          version: 2,
          confirmation: 'WRONG',
          reason: 'CUSTOMER_REQUEST',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('POST', `/api/customers/${customer.id}/anonymize`, {
          version: 2,
          confirmation: customer.registration,
          reason: 'CUSTOMER_REQUEST',
        })
      ).statusCode,
    ).toBe(200);
    const stored = await db.client.customer.findUniqueOrThrow({ where: { id: customer.id } });
    for (const key of ['phone', 'email', 'birthday', 'cpf', 'address', 'notes'] as const)
      expect(stored[key]).toBeNull();
    expect(stored.name).toBe('Cliente anonimizado');
    expect(stored.marketingState).toBe('OPTED_OUT');
    expect(stored.active).toBe(false);
    expect((await request('GET', `/api/customer-imports/${job.id}`)).json().status).toBe(
      'CANCELLED',
    );
    const history = await db.client.marketingPreferenceEvent.findMany({
      where: { customerId: customer.id },
    });
    expect(history.every((e) => e.evidence === null)).toBe(true);
    const audit = JSON.stringify(await db.client.auditEvent.findMany());
    for (const pii of [name, email, 'Erase personal reference', 'Erase private text'])
      expect(audit).not.toContain(pii);
    expect(JSON.stringify(await db.client.importJob.findMany())).not.toContain(name);
    expect(
      (
        await request('POST', `/api/customers/${customer.id}/status`, {
          version: 3,
          active: true,
          reason: 'RECORD_REVIEW',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request('POST', '/api/customers/export', {
          state: 'all',
          q: '',
          sort: 'name',
          page: 1,
        })
      ).json().csv,
    ).not.toContain(customer.registration);
  });
  it('creates/updates/deactivates categories, keeps references and rejects stale versions', async () => {
    const made = await request('POST', '/api/categories', { name: 'Categoria Sintética' });
    expect(made.statusCode).toBe(201);
    category = made.json().category;
    expect(
      (await request('POST', '/api/categories', { name: 'categoria sintetica' })).statusCode,
    ).toBe(409);
    expect(
      (
        await request('PATCH', `/api/categories/${category.id}`, {
          name: 'Categoria Sintética',
          active: false,
          version: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request('PATCH', `/api/categories/${category.id}`, {
          name: 'Stale',
          active: true,
          version: 1,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request('PATCH', `/api/categories/${category.id}`, {
          name: 'Categoria Sintética',
          active: true,
          version: 2,
        })
      ).statusCode,
    ).toBe(200);
    category.version = 3;
    expect(
      (await request('POST', '/api/categories', { name: 'Manager category' }, manager.cookie))
        .statusCode,
    ).toBe(201);
  });
  it('creates, reprices and deactivates products with audited integer prices/costs', async () => {
    const created = await request('POST', '/api/products', productBody());
    expect(created.statusCode).toBe(201);
    const product = created.json().product;
    const edited = await request('PATCH', `/api/products/${product.id}`, {
      ...productBody(),
      sellingPriceCents: 1400,
      estimatedCostCents: 500,
      active: false,
      version: 1,
      reason: 'PRICE_REVIEW',
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().product.sellingPriceCents).toBe(1400);
    expect(
      (
        await request('PATCH', `/api/products/${product.id}`, {
          ...productBody(),
          version: 1,
          reason: 'PRICE_REVIEW',
        })
      ).statusCode,
    ).toBe(409);
    const events = await db.client.auditEvent.findMany({
      where: { targetId: product.id, eventType: 'PRODUCT_PRICE_CHANGED' },
    });
    expect(events).toHaveLength(2);
    expect(events[1]?.actorId).toBeTruthy();
    expect(
      (await request('GET', `/api/products/${product.id}`, undefined, cashier.cookie)).statusCode,
    ).toBe(404);
  });
  it('protects unique product codes under concurrent creation', async () => {
    const results = await Promise.all([
      request('POST', '/api/products', productBody('RACE-CODE')),
      request('POST', '/api/products', productBody('RACE-CODE')),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await db.client.product.count({ where: { code: 'RACE-CODE' } })).toBe(1);
  });
  it('rejects malformed money, unknown categories/origins and unconfirmed zero price', async () => {
    for (const fields of [
      { sellingPriceCents: -1 },
      { sellingPriceCents: 1.5 },
      { sellingPriceCents: 0 },
      { estimatedCostCents: -1 },
      { origin: 'WEIGHTED' },
      { sellingPriceCents: '12,50' },
      { stockQuantity: 2 },
    ])
      expect(
        (await request('POST', '/api/products', { ...productBody('INVALID'), ...fields }))
          .statusCode,
      ).toBe(400);
    expect(
      (
        await request('POST', '/api/products', {
          ...productBody('MISSING-CAT'),
          categoryId: '60502b58-c9b2-47f0-91d4-127c250ad6df',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request('POST', '/api/products', {
          ...productBody('ZERO-CONFIRMED'),
          sellingPriceCents: 0,
          allowZeroPrice: true,
        })
      ).statusCode,
    ).toBe(201);
  });
  it('omits estimated costs for cashier/production in both product lists and details', async () => {
    const created = await request('POST', '/api/products', {
      ...productBody('PRIVATE-COST'),
      estimatedCostCents: 54321,
    });
    const id = created.json().product.id;
    for (const session of [cashier.cookie, production.cookie])
      for (const path of ['/api/products?q=PRIVATE-COST', `/api/products/${id}`]) {
        const reply = await request('GET', path, undefined, session);
        expect(reply.statusCode).toBe(200);
        expect(reply.body).not.toMatch(/estimatedCostCents|54321/);
      }
    expect(
      (await request('POST', '/api/products', productBody('ESCALATED'), cashier.cookie)).statusCode,
    ).toBe(403);
    expect(
      (await request('POST', '/api/categories', { name: 'Forbidden' }, production.cookie))
        .statusCode,
    ).toBe(403);
    expect(
      (await request('GET', `/api/products/${id}`, undefined, manager.cookie)).json().product
        .estimatedCostCents,
    ).toBe(54321);
  });
  it('does not cascade category deactivation or allow destructive category/product/customer APIs', async () => {
    expect(
      (
        await request('PATCH', `/api/categories/${category.id}`, {
          name: category.name,
          active: false,
          version: 3,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request('GET', '/api/products?q=PRIVATE-COST', undefined, cashier.cookie)).json()
        .items,
    ).toHaveLength(1);
    expect(
      (await request('POST', '/api/products', productBody('INACTIVE-CATEGORY'))).statusCode,
    ).toBe(409);
    await expect(db.client.category.delete({ where: { id: category.id } })).rejects.toThrow();
    expect((await request('DELETE', `/api/categories/${category.id}`, {})).statusCode).toBe(404);
    expect(
      (
        await request('PATCH', `/api/categories/${category.id}`, {
          name: category.name,
          active: true,
          version: 4,
        })
      ).statusCode,
    ).toBe(200);
  });
  it('filters catalog by category/origin/status and whitelists search/sort', async () => {
    const query = `/api/products?categoryId=${category.id}&origin=PRODUCED&state=active&sort=price`;
    const result = await request('GET', query);
    expect(result.statusCode).toBe(200);
    expect(result.json().items.length).toBeGreaterThan(0);
    expect(
      (await request('GET', '/api/products?sort=estimatedCostCents', undefined, cashier.cookie))
        .statusCode,
    ).toBe(400);
    expect(
      (await request('GET', '/api/products?q=%27%3BDROP%20TABLE%20%22User%22%3B--')).statusCode,
    ).toBe(200);
    expect(await db.client.user.count()).toBe(4);
    expect((await request('GET', '/api/customers?sort=name%3BDELETE')).statusCode).toBe(400);
    expect((await request('GET', '/api/customers?q=%27%20OR%201%3D1--')).json().total).toBe(0);
  });
  it('downloads a header-only template and rejects malformed CSV before creating jobs', async () => {
    const template = await request('GET', '/api/customer-imports/template');
    expect(template.statusCode).toBe(200);
    expect(template.json().csv).toContain('"name";"phone"');
    const before = await db.client.importJob.count();
    expect(
      (
        await request('POST', '/api/customer-imports/preview', {
          csv: 'nome;nome\nA;B',
          delimiter: ';',
          mapping: { name: 'nome' },
        })
      ).statusCode,
    ).toBe(400);
    expect(await db.client.importJob.count()).toBe(before);
  });
  it('reviews row errors and duplicates inside CSV without creating or silently opting-in', async () => {
    const job = await preview(
      'nome;telefone;cpf;nascimento;marketing\nImport Sintético A;85999990101;123;29/02;SIM\nImport Sintético B;85999990102;;;SIM\nImport Sintético C;85999990102;;;SIM',
      { name: 'nome', phone: 'telefone', cpf: 'cpf', birthday: 'nascimento' },
    );
    expect(job.rows[0]?.errors.length).toBeGreaterThan(0);
    expect(job.rows[2]?.duplicates.some((d) => d.type === 'PHONE')).toBe(true);
    expect(
      await db.client.customer.count({ where: { name: { startsWith: 'Import Sintético' } } }),
    ).toBe(0);
    await cancel(job);
  });
  it('reviews matches against existing profiles and requires explicit shared-contact decisions', async () => {
    const job = await preview('nome;telefone\nImport Shared Synthetic;85999990001');
    expect(job.rows[0]?.duplicates.some((d) => d.type === 'PHONE')).toBe(true);
    const input = { reviewToken: job.reviewToken, choices: [{ row: 1, action: 'CREATE' }] };
    const failed = await request('POST', `/api/customer-imports/${job.id}/confirm`, input);
    expect(failed.json().error.code).toBe('IMPORT_DUPLICATE_REVIEW');
    const committed = await request('POST', `/api/customer-imports/${job.id}/confirm`, {
      ...input,
      choices: [{ row: 1, action: 'CREATE', reason: 'SHARED_CONTACT' }],
    });
    expect(committed.statusCode).toBe(200);
    expect(committed.json().created).toBe(1);
    expect(
      (await db.client.customer.findFirstOrThrow({ where: { name: 'Import Shared Synthetic' } }))
        .marketingState,
    ).toBe('UNKNOWN');
  });
  it('commits atomically, skips invalid rows explicitly and makes concurrent confirmation retries idempotent', async () => {
    const job = await preview(
      'nome;telefone\nAtomic Synthetic One;85999990103\nAtomic Synthetic Bad;invalid',
    );
    const invalid = {
      reviewToken: job.reviewToken,
      choices: [
        { row: 1, action: 'CREATE' },
        { row: 2, action: 'CREATE' },
      ],
    };
    expect(
      (await request('POST', `/api/customer-imports/${job.id}/confirm`, invalid)).statusCode,
    ).toBe(409);
    expect(await db.client.customer.count({ where: { name: 'Atomic Synthetic One' } })).toBe(0);
    const input = {
      reviewToken: job.reviewToken,
      choices: [
        { row: 1, action: 'CREATE' },
        { row: 2, action: 'SKIP' },
      ],
    };
    const responses = await Promise.all([
      request('POST', `/api/customer-imports/${job.id}/confirm`, input),
      request('POST', `/api/customer-imports/${job.id}/confirm`, input),
    ]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(responses[0]?.json()).toEqual(responses[1]?.json());
    expect(await db.client.customer.count({ where: { name: 'Atomic Synthetic One' } })).toBe(1);
    expect(
      (
        await request('POST', `/api/customer-imports/${job.id}/confirm`, {
          ...input,
          choices: [
            { row: 1, action: 'SKIP' },
            { row: 2, action: 'SKIP' },
          ],
        })
      ).statusCode,
    ).toBe(409);
  });
  it('revalidates database duplicate changes since preview and rejects client-supplied validated rows', async () => {
    const job = await preview('nome;telefone\nPreview Drift Synthetic;85999990104');
    await createCustomer({ name: 'Changed since preview', phone: '85999990104' });
    const input = { reviewToken: job.reviewToken, choices: [{ row: 1, action: 'CREATE' }] };
    const response = await request('POST', `/api/customer-imports/${job.id}/confirm`, input);
    expect(response.json().error.code).toBe('IMPORT_REVIEW_STALE');
    expect(await db.client.customer.count({ where: { name: 'Preview Drift Synthetic' } })).toBe(0);
    expect(
      (
        await request('POST', `/api/customer-imports/${job.id}/confirm`, {
          ...input,
          validatedRows: [{ name: 'Injected' }],
        })
      ).statusCode,
    ).toBe(400);
  });
  it('prevents duplicate CPF creation within import without auto-merging or overriding', async () => {
    const job = await preview('nome;cpf\nCPF Import One;12345678909\nCPF Import Two;12345678909', {
      name: 'nome',
      cpf: 'cpf',
    });
    expect(job.rows[1]?.duplicates.some((d) => d.type === 'CPF')).toBe(true);
    expect(
      (
        await request('POST', `/api/customer-imports/${job.id}/confirm`, {
          reviewToken: job.reviewToken,
          choices: [
            { row: 1, action: 'CREATE' },
            { row: 2, action: 'CREATE', reason: 'CONFIRMED_DISTINCT' },
          ],
        })
      ).statusCode,
    ).toBe(409);
    expect(await db.client.customer.count({ where: { cpf: '12345678909' } })).toBe(0);
    await cancel(job);
  });
  it('exports explicitly scoped minimal columns, escaped text/formulas and no private fields/raw audit payloads', async () => {
    const customer = await createCustomer({
      name: '=SYNTHETIC("texto")',
      email: 'formula@example.test',
      notes: 'Do not export synthetic note',
    });
    const result = await request('POST', '/api/customers/export', {
      q: '=SYNTHETIC',
      state: 'active',
      sort: 'name',
      page: 1,
    });
    expect(result.statusCode).toBe(200);
    const csv = result.json().csv as string;
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain(`"'=SYNTHETIC(""texto"")"`);
    expect(csv).not.toContain('Do not export synthetic note');
    expect(csv).not.toMatch(/passwordHash|tokenDigest|installationSecret/);
    const events = await db.client.auditEvent.findMany({
      where: { eventType: { in: ['CUSTOMER_EXPORTED', 'CUSTOMER_IMPORTED'] } },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain('formula@example.test');
    expect(JSON.stringify(events)).not.toContain(customer.name);
  });
  it('requires the existing Origin/CSRF protections on every new mutation', async () => {
    for (const path of [
      '/api/customers',
      '/api/categories',
      '/api/products',
      '/api/customers/export',
      '/api/customer-imports/preview',
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: path,
        headers: { host: '127.0.0.1:3333', origin, cookie, 'content-type': 'application/json' },
        payload: {},
      });
      expect(response.statusCode).toBe(403);
    }
  });
  it('denies an authorized-at-start customer write after account revocation wins the DB lock', async () => {
    const auth = new AuthService(db.client, () => now, secret);
    const session = await auth.session(manager.cookie.split('=')[1]);
    const principal: Principal = { userId: session.userId, sessionId: session.id };
    const registry = new RegistryService(auth, () => now);
    let pending: Promise<unknown> | undefined;
    await db.client.$transaction(async (tx) => {
      await securityLock(tx);
      pending = registry.createCustomer(
        principal,
        customerCreateSchema.parse({ name: 'Revoked write synthetic' }),
        'revocation-test',
      );
      await tx.user.update({
        where: { id: session.userId },
        data: { active: false, version: { increment: 1 } },
      });
      await tx.session.updateMany({ where: { userId: session.userId }, data: { revokedAt: now } });
    });
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(await db.client.customer.count({ where: { name: 'Revoked write synthetic' } })).toBe(0);
  });
  it('revocation before import authorization prevents commit even with a valid preview token', async () => {
    const second = await createAccount('registry-import-owner', 'OWNER');
    const auth = new AuthService(db.client, () => now, secret);
    const session = await auth.session(second.cookie.split('=')[1]);
    const principal = { userId: session.userId, sessionId: session.id };
    const imports = new CustomerImports(new RegistryService(auth, () => now));
    const job = await imports.preview(
      principal,
      { csv: 'nome\nRevoked import synthetic', delimiter: ';', mapping: { name: 'nome' } },
      'preview-revoke',
    );
    let pending: Promise<unknown> | undefined;
    await db.client.$transaction(async (tx) => {
      await securityLock(tx);
      pending = imports.confirm(
        principal,
        job.id,
        { reviewToken: job.reviewToken, choices: [{ row: 1, action: 'CREATE' }] },
        'confirm-revoke',
      );
      await tx.user.update({
        where: { id: session.userId },
        data: { role: 'PRODUCTION', version: { increment: 1 } },
      });
      await tx.session.updateMany({ where: { userId: session.userId }, data: { revokedAt: now } });
    });
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(await db.client.customer.count({ where: { name: 'Revoked import synthetic' } })).toBe(0);
  });
  it('rejects invalid direct SQL data and preserves identity/foundation data during upgrade', async () => {
    await expect(
      db.client.customer.create({
        data: { name: 'Bad CPF', nameKey: 'bad cpf', cpf: '11111111111' },
      }),
    ).rejects.toThrow();
    await expect(
      db.client.product.create({
        data: {
          code: 'lowercase',
          name: 'Bad code',
          nameKey: 'bad code',
          categoryId: category.id,
          origin: 'PRODUCED',
          sellingPriceCents: 10,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.client.product.create({
        data: {
          code: 'BAD-MONEY',
          name: 'Bad money',
          nameKey: 'bad money',
          categoryId: category.id,
          origin: 'PRODUCED',
          sellingPriceCents: -1,
        },
      }),
    ).rejects.toThrow();
    const upgrade = await freshDatabase('identity');
    try {
      const legacy = upgrade.legacy!;
      expect(
        (
          await upgrade.client.storeSettings.findUniqueOrThrow({ where: { id: 1 } })
        ).createdAt.toISOString(),
      ).toBe('2001-01-01T00:00:00.000Z');
      expect(
        (await upgrade.client.user.findUniqueOrThrow({ where: { id: legacy.userId } }))
          .passwordHash,
      ).toBe(legacy.passwordHash);
      expect(
        (await upgrade.client.installationState.findUniqueOrThrow({ where: { id: 1 } }))
          .initializedAt,
      ).toEqual(legacy.initializedAt);
      expect(
        await upgrade.client.session.count({ where: { tokenDigest: legacy.sessionDigest } }),
      ).toBe(1);
      expect(await upgrade.client.auditEvent.count()).toBe(1);
      expect(await upgrade.client.customer.count()).toBe(0);
    } finally {
      await upgrade.connection.close();
    }
  }, 60000);
  it('expires memory-only previews with controlled time and treats a process restart as a new review', async () => {
    const auth = new AuthService(db.client, () => now, secret);
    const session = await auth.session(cookie.split('=')[1]);
    const principal = { userId: session.userId, sessionId: session.id };
    const imports = new CustomerImports(new RegistryService(auth, () => now));
    const job = await imports.preview(
      principal,
      { csv: 'nome\nExpiry synthetic', delimiter: ';', mapping: { name: 'nome' } },
      'preview-expiry',
    );
    now = new Date(now.getTime() + 900001);
    await expect(
      imports.confirm(
        principal,
        job.id,
        { reviewToken: job.reviewToken, choices: [{ row: 1, action: 'CREATE' }] },
        'expired',
      ),
    ).rejects.toMatchObject({ code: 'IMPORT_PREVIEW_EXPIRED' });
    const next = await imports.preview(
      principal,
      { csv: 'nome\nRestart synthetic', delimiter: ';', mapping: { name: 'nome' } },
      'preview-restart',
    );
    const restarted = new CustomerImports(new RegistryService(auth, () => now));
    await expect(
      restarted.confirm(
        principal,
        next.id,
        { reviewToken: next.reviewToken, choices: [{ row: 1, action: 'CREATE' }] },
        'restart',
      ),
    ).rejects.toMatchObject({ code: 'IMPORT_PREVIEW_EXPIRED' });
    await imports.cleanup();
    expect(
      await db.client.customer.count({
        where: { name: { in: ['Expiry synthetic', 'Restart synthetic'] } },
      }),
    ).toBe(0);
    expect(
      await auth.withPermission(principal, 'customers.read', (tx) =>
        tx.customer.count({ where: {} }),
      ),
    ).toBeGreaterThan(0);
    expect(customerQuerySchema.parse({}).state).toBe('active');
  });
});
