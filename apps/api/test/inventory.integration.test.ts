import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import { AuthService, securityLock, type Principal } from '../src/auth/service.js';
import { InventoryService } from '../src/inventory/service.js';
import { freshDatabase } from './database.js';
import {
  openingInput,
  reserveInput,
  reservationAction,
  stockQuery,
  MAX_BATCH_UNITS,
} from '@pommier/shared';
const BASE = new Date('2026-10-17T18:00:00Z');
let now = new Date(BASE);
const password = randomBytes(24).toString('base64url');
const secret = randomBytes(32).toString('base64url');
const origin = 'http://127.0.0.1:3333';
const headers = {
  host: '127.0.0.1:3333',
  origin,
  'content-type': 'application/json',
  'x-pommier-csrf': '1',
};
let db: Awaited<ReturnType<typeof freshDatabase>>;
let app: FastifyInstance;
let cookie: string;
let service: InventoryService;
let auth: AuthService;
let principal: Principal;
let manager: { cookie: string; id: string };
let cashier: { cookie: string; id: string };
let production: { cookie: string; id: string };
let categoryId: string;
let serial = 0;
type Reply = Awaited<ReturnType<FastifyInstance['inject']>>;
async function req(
  method: InjectOptions['method'],
  url: string,
  payload?: unknown,
  session = cookie,
): Promise<Reply> {
  return app.inject({
    method: method ?? 'GET',
    url,
    headers: { ...headers, ...(session ? { cookie: session } : {}) },
    ...(payload === undefined ? {} : { payload }),
  } as InjectOptions);
}
async function command(url: string, payload: unknown, key = randomUUID(), session = cookie) {
  return req('POST', url, { key, payload }, session);
}
function okay(response: Reply, status = 200) {
  expect(response.statusCode, response.json().error?.code).toBe(status);
  return response.json() as {
    targetId: string;
    batchId: string;
    operationId: string;
    state: string;
  };
}
async function account(login: string, role: 'MANAGER' | 'CASHIER' | 'PRODUCTION') {
  const created = await req('POST', '/api/users', {
    loginIdentifier: login,
    displayName: 'Synthetic inventory role',
    role,
    password,
  });
  expect(created.statusCode).toBe(201);
  const loginResponse = await req(
    'POST',
    '/api/auth/login',
    { loginIdentifier: login, password },
    '',
  );
  expect(loginResponse.statusCode).toBe(200);
  return {
    cookie: String(loginResponse.headers['set-cookie']).split(';')[0]!,
    id: created.json().user.id as string,
  };
}
async function product(originType: 'PRODUCED' | 'PURCHASED' | 'BOTH' = 'BOTH') {
  const n = ++serial;
  const fields = {
    code: `INV-${n}`,
    name: `Synthetic inventory ${n}`,
    categoryId,
    origin: originType,
    sellingPriceCents: 1250,
    estimatedCostCents: 400,
  };
  const response = await req('POST', '/api/products', fields);
  expect(response.statusCode).toBe(201);
  return response.json().product as {
    id: string;
    version: number;
    code: string;
    name: string;
    origin: 'PRODUCED' | 'PURCHASED' | 'BOTH';
    categoryId: string;
    sellingPriceCents: number;
    estimatedCostCents: number;
  };
}
function batchInput(expiry: string | null = '2026-10-20') {
  return {
    reference: `SYN-${randomUUID()}`,
    expiresAt: expiry,
    ...(expiry === null ? { expiryUnknownReason: 'NOT_PROVIDED' as const } : {}),
  };
}
async function opening(productId: string, quantity = 10, expiry: string | null = '2026-10-20') {
  const payload = {
    productId,
    quantity,
    batch: batchInput(expiry),
    reason: 'INITIAL_COUNT' as const,
  };
  const result = okay(await command('/api/inventory/opening', payload));
  return { payload, result };
}
async function detail(batchId: string, session = cookie) {
  const r = await req('GET', `/api/inventory/batches/${batchId}`, undefined, session);
  expect(r.statusCode).toBe(200);
  return r.json().batch as {
    id: string;
    version: number;
    physical: string;
    reserved: string;
    available: string;
    blocked: string;
    expiredReserved: string;
    consistent: boolean;
  };
}
async function reserve(
  productId: string,
  quantity: number,
  through = '2026-10-17',
  key = randomUUID(),
) {
  const input = reserveInput.parse({
    productId,
    quantity,
    sourceNamespace: 'INTERNAL',
    sourceReference: randomUUID(),
    eligibilityThrough: through,
  });
  return { input, result: await service.reserve(principal, key, input, randomUUID()), key };
}
async function plan(productId: string, quantity = 10) {
  return okay(
    await command('/api/production', {
      productId,
      plannedQuantity: quantity,
      plannedDate: '2026-10-17',
    }),
  );
}
async function started(productId: string, quantity = 10) {
  const p = await plan(productId, quantity);
  okay(await command(`/api/production/${p.targetId}/transition`, { version: 1, action: 'START' }));
  return p.targetId;
}
async function closeReservation(
  r: Awaited<ReturnType<typeof reserve>>,
  action: 'RELEASE' | 'CONSUME',
  key = randomUUID(),
) {
  return service.reservationChange(
    principal,
    key,
    action,
    reservationAction.parse({
      reservationId: r.result.targetId,
      sourceReference: r.input.sourceReference,
    }),
    randomUUID(),
  );
}
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
      await req(
        'POST',
        '/api/auth/setup',
        {
          loginIdentifier: 'inventory-owner',
          displayName: 'Synthetic Inventory Owner',
          password,
          installationSecret: secret,
        },
        '',
      )
    ).statusCode,
  ).toBe(200);
  const login = await req(
    'POST',
    '/api/auth/login',
    { loginIdentifier: 'inventory-owner', password },
    '',
  );
  expect(login.statusCode).toBe(200);
  cookie = String(login.headers['set-cookie']).split(';')[0]!;
  manager = await account('inventory-manager', 'MANAGER');
  cashier = await account('inventory-cashier', 'CASHIER');
  production = await account('inventory-production', 'PRODUCTION');
  const category = await req('POST', '/api/categories', { name: 'Synthetic Inventory Category' });
  expect(category.statusCode).toBe(201);
  categoryId = category.json().category.id;
  auth = new AuthService(db.client, () => now, secret);
  const session = await auth.session(cookie.split('=')[1]);
  principal = { userId: session.userId, sessionId: session.id };
  service = new InventoryService(auth, () => now);
}, 60000);
beforeEach(() => {
  now = new Date(BASE);
});
afterAll(async () => {
  await app?.close();
});
describe('Phase 4 real PostgreSQL', () => {
  it('creates a traceable opening batch/movement and server-recorded time', async () => {
    const p = await product();
    const o = await opening(p.id, 7);
    const b = await db.client.batch.findUniqueOrThrow({ where: { id: o.result.batchId } });
    expect(b.physical).toBe(7n);
    expect(b.recordedAt).toEqual(BASE);
    expect(b.number).toBeGreaterThan(0);
    expect(
      await db.client.inventoryMovement.count({ where: { batchId: b.id, type: 'OPENING' } }),
    ).toBe(1);
    expect(
      (
        await req('POST', '/api/inventory/opening', {
          key: randomUUID(),
          payload: { ...o.payload, effectiveAt: '2000-01-01' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('replays opening with the same key without duplicate stock or batch', async () => {
    const p = await product();
    const payload = { productId: p.id, quantity: 9, batch: batchInput(), reason: 'INITIAL_COUNT' };
    const key = randomUUID();
    const a = okay(await command('/api/inventory/opening', payload, key));
    const b = okay(await command('/api/inventory/opening', payload, key));
    expect(b).toEqual(a);
    expect((await detail(a.batchId)).physical).toBe('9');
  });
  it('plans/starts production without receiving finished stock', async () => {
    const p = await product('PRODUCED');
    const id = await started(p.id);
    expect(await db.client.batch.count({ where: { productId: p.id } })).toBe(0);
    expect((await db.client.productionRecord.findUniqueOrThrow({ where: { id } })).status).toBe(
      'IN_PROGRESS',
    );
  });
  it('completes actual quantity with batch, audit and shortfall instead of planned quantity', async () => {
    const p = await product('PRODUCED');
    const id = await started(p.id, 10);
    const result = okay(
      await command(`/api/production/${id}/complete`, {
        version: 2,
        actualQuantity: 6,
        batch: batchInput(),
      }),
    );
    expect((await detail(result.batchId)).physical).toBe('6');
    expect(
      await db.client.inventoryMovement.count({ where: { productId: p.id, type: 'WASTE' } }),
    ).toBe(0);
    const event = await db.client.auditEvent.findFirstOrThrow({
      where: { eventType: 'PRODUCTION_COMPLETED', targetId: id },
    });
    expect(event.metadata).toMatchObject({ quantity: 6, shortfall: 4 });
  });
  it('allows production employees to plan/start/complete and waste their permitted produced batches', async () => {
    const p = await product('PRODUCED');
    const planned = okay(
      await command(
        '/api/production',
        { productId: p.id, plannedQuantity: 4, plannedDate: '2026-10-17' },
        randomUUID(),
        production.cookie,
      ),
    );
    okay(
      await command(
        `/api/production/${planned.targetId}/transition`,
        { version: 1, action: 'START' },
        randomUUID(),
        production.cookie,
      ),
    );
    const completed = okay(
      await command(
        `/api/production/${planned.targetId}/complete`,
        { version: 2, actualQuantity: 3, batch: batchInput() },
        randomUUID(),
        production.cookie,
      ),
    );
    const b = await detail(completed.batchId, production.cookie);
    okay(
      await command(
        '/api/inventory/waste',
        {
          productId: p.id,
          batchId: b.id,
          version: b.version,
          quantity: 1,
          reason: 'PRODUCTION_FAILURE',
        },
        randomUUID(),
        production.cookie,
      ),
    );
    expect((await detail(b.id, production.cookie)).physical).toBe('2');
  });
  it('makes concurrent identical completion retries add stock once', async () => {
    const p = await product();
    const id = await started(p.id);
    const key = randomUUID();
    const input = { version: 2, actualQuantity: 8, batch: batchInput() };
    const [a, b] = await Promise.all([
      command(`/api/production/${id}/complete`, input, key),
      command(`/api/production/${id}/complete`, input, key),
    ]);
    expect(okay(a)).toEqual(okay(b));
    expect(await db.client.inventoryMovement.count({ where: { productId: p.id } })).toBe(1);
    const distinct = await product();
    const secondId = await started(distinct.id);
    const secondPayload = { version: 2, actualQuantity: 2, batch: batchInput() };
    const outcomes = await Promise.all([
      command(`/api/production/${secondId}/complete`, secondPayload),
      command(`/api/production/${secondId}/complete`, secondPayload),
    ]);
    expect(outcomes.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await db.client.inventoryMovement.count({ where: { productId: distinct.id } })).toBe(1);
  });
  it('rolls back completion/batch/ledger/operation when a final audit write fails', async () => {
    const p = await product();
    const id = await started(p.id);
    const key = randomUUID();
    await db.client.$executeRawUnsafe(
      `CREATE FUNCTION inventory_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='PRODUCTION_COMPLETED' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$`,
    );
    await db.client.$executeRawUnsafe(
      `CREATE TRIGGER inventory_test_failure BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION inventory_test_fail()`,
    );
    try {
      expect(
        (
          await command(
            `/api/production/${id}/complete`,
            { version: 2, actualQuantity: 4, batch: batchInput() },
            key,
          )
        ).statusCode,
      ).toBe(500);
    } finally {
      await db.client.$executeRawUnsafe(`DROP TRIGGER inventory_test_failure ON "AuditEvent"`);
      await db.client.$executeRawUnsafe('DROP FUNCTION inventory_test_fail()');
    }
    expect(await db.client.batch.count({ where: { productId: p.id } })).toBe(0);
    expect(await db.client.inventoryOperation.count({ where: { key } })).toBe(0);
    expect((await db.client.productionRecord.findUniqueOrThrow({ where: { id } })).status).toBe(
      'IN_PROGRESS',
    );
  });
  it('enforces produced/purchased origin on planning and receipt paths', async () => {
    const purchased = await product('PURCHASED');
    const produced = await product('PRODUCED');
    expect(
      (
        await command('/api/production', {
          productId: purchased.id,
          plannedQuantity: 2,
          plannedDate: '2026-10-17',
        })
      ).json().error.code,
    ).toBe('PRODUCT_ORIGIN');
    expect(
      (
        await command('/api/inventory/receipts', {
          productId: produced.id,
          quantity: 2,
          batch: batchInput(),
          supplierReference: 'Synthetic supplier',
        })
      ).json().error.code,
    ).toBe('PRODUCT_ORIGIN');
  });
  it('receives purchased finished units atomically and idempotently under concurrency', async () => {
    const p = await product('PURCHASED');
    const key = randomUUID();
    const payload = {
      productId: p.id,
      quantity: 12,
      batch: batchInput(),
      supplierReference: 'Synthetic supplier',
      supplierBatch: 'not globally unique',
    };
    const [a, b] = await Promise.all([
      command('/api/inventory/receipts', payload, key),
      command('/api/inventory/receipts', payload, key),
    ]);
    expect(okay(a)).toEqual(okay(b));
    expect(await db.client.purchasedProductReceipt.count({ where: { productId: p.id } })).toBe(1);
    expect((await detail(a.json().batchId)).physical).toBe('12');
  });
  it('stores optional historical receipt cost without changing catalog estimated cost', async () => {
    const p = await product();
    const r = okay(
      await command('/api/inventory/receipts', {
        productId: p.id,
        quantity: 3,
        batch: batchInput(),
        supplierReference: 'Synthetic supplier',
        unitCostCents: 567,
      }),
    );
    expect(
      (await db.client.product.findUniqueOrThrow({ where: { id: p.id } })).estimatedCostCents,
    ).toBe(400);
    expect(
      (await db.client.purchasedProductReceipt.findUniqueOrThrow({ where: { id: r.targetId } }))
        .unitCostCents,
    ).toBe(567);
  });
  it('reconciles ledger to physical projection and allocation sums', async () => {
    const p = await product();
    await opening(p.id, 8);
    const report = await req('GET', `/api/inventory/products/${p.id}/reconciliation`);
    expect(report.json()).toMatchObject({ consistent: true, findings: [] });
  });
  it('reserves without changing physical quantity', async () => {
    const p = await product();
    const o = await opening(p.id, 10);
    await reserve(p.id, 4);
    expect(await detail(o.result.batchId)).toMatchObject({
      physical: '10',
      reserved: '4',
      available: '6',
    });
  });
  it('allocates FEFO across several batches using deterministic tie-breakers', async () => {
    const p = await product();
    const later = await opening(p.id, 4, '2026-10-20');
    const early = await opening(p.id, 3, '2026-10-18');
    const r = await reserve(p.id, 5);
    const allocations = await db.client.reservationAllocation.findMany({
      where: { reservationId: r.result.targetId },
    });
    expect(allocations.find((a) => a.batchId === early.result.batchId)?.allocated).toBe(3);
    expect(allocations.find((a) => a.batchId === later.result.batchId)?.allocated).toBe(2);
  });
  it('places explicitly unknown-expiry batches after dated stock', async () => {
    const p = await product();
    const unknown = await opening(p.id, 5, null);
    const dated = await opening(p.id, 2, '2026-10-19');
    await reserve(p.id, 3);
    expect((await detail(dated.result.batchId)).reserved).toBe('2');
    expect((await detail(unknown.result.batchId)).reserved).toBe('1');
  });
  it('blocks expired units from allocation while retaining physical stock without automatic waste', async () => {
    const p = await product();
    const o = await opening(p.id, 9, '2026-10-16');
    expect(await detail(o.result.batchId)).toMatchObject({
      physical: '9',
      blocked: '9',
      available: '0',
    });
    await expect(reserve(p.id, 1)).rejects.toMatchObject({ code: 'INSUFFICIENT_SELLABLE_STOCK' });
    expect(await db.client.inventoryMovement.count({ where: { productId: p.id } })).toBe(1);
  });
  it('uses Fortaleza midnight rather than UTC/browser date and keeps expiry day sellable', async () => {
    const p = await product();
    const o = await opening(p.id, 2, '2026-10-17');
    now = new Date('2026-10-18T02:59:59Z');
    expect((await detail(o.result.batchId)).available).toBe('2');
    now = new Date('2026-10-18T03:00:00Z');
    expect((await detail(o.result.batchId)).blocked).toBe('2');
  });
  it('allows only one allocation competing for the final units', async () => {
    const p = await product();
    const o = await opening(p.id, 1);
    const results = await Promise.allSettled([reserve(p.id, 1), reserve(p.id, 1)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await detail(o.result.batchId)).toMatchObject({
      physical: '1',
      reserved: '1',
      available: '0',
    });
  });
  it('releases idempotently without changing physical stock or double-release', async () => {
    const p = await product();
    const o = await opening(p.id, 6);
    const r = await reserve(p.id, 4);
    const key = randomUUID();
    expect(await closeReservation(r, 'RELEASE', key)).toEqual(
      await closeReservation(r, 'RELEASE', key),
    );
    await closeReservation(r, 'RELEASE');
    expect(await detail(o.result.batchId)).toMatchObject({
      physical: '6',
      reserved: '0',
      available: '6',
    });
  });
  it('consumes atomically and idempotently without exceeding allocation', async () => {
    const p = await product();
    const o = await opening(p.id, 6);
    const r = await reserve(p.id, 4);
    const key = randomUUID();
    expect(await closeReservation(r, 'CONSUME', key)).toEqual(
      await closeReservation(r, 'CONSUME', key),
    );
    await closeReservation(r, 'CONSUME');
    expect(await detail(o.result.batchId)).toMatchObject({ physical: '2', reserved: '0' });
    expect(
      await db.client.inventoryMovement.count({
        where: { batchId: o.result.batchId, type: 'CONSUMPTION' },
      }),
    ).toBe(1);
  });
  it('serializes release-versus-consumption without negative or double stock', async () => {
    const p = await product();
    const o = await opening(p.id, 4);
    const r = await reserve(p.id, 4);
    const results = await Promise.allSettled([
      closeReservation(r, 'RELEASE'),
      closeReservation(r, 'CONSUME'),
    ]);
    expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
    const b = await detail(o.result.batchId);
    expect(['0', '4']).toContain(b.physical);
    expect(b.reserved).toBe('0');
    expect(b.consistent).toBe(true);
  });
  it('retains expired reservations as exceptions and refuses consumption until explicit release', async () => {
    const p = await product();
    const o = await opening(p.id, 4, '2026-10-17');
    const r = await reserve(p.id, 3);
    now = new Date('2026-10-18T03:00:00Z');
    await expect(closeReservation(r, 'CONSUME')).rejects.toMatchObject({
      code: 'RESERVED_BATCH_EXPIRED',
    });
    expect(await detail(o.result.batchId)).toMatchObject({
      physical: '4',
      reserved: '3',
      blocked: '4',
      expiredReserved: '3',
    });
    await closeReservation(r, 'RELEASE');
    expect((await detail(o.result.batchId)).reserved).toBe('0');
  });
  it('excludes known expirations before future eligibility-through date', async () => {
    const p = await product();
    await opening(p.id, 4, '2026-10-18');
    await expect(reserve(p.id, 1, '2026-10-19')).rejects.toMatchObject({
      code: 'INSUFFICIENT_SELLABLE_STOCK',
    });
  });
  it('refuses excess/reserved waste but permits explicit disposal of expired unreserved stock', async () => {
    const p = await product();
    const o = await opening(p.id, 4);
    await reserve(p.id, 3);
    let b = await detail(o.result.batchId);
    expect(
      (
        await command('/api/inventory/waste', {
          productId: p.id,
          batchId: b.id,
          version: b.version,
          quantity: 2,
          reason: 'DAMAGED',
        })
      ).json().error.code,
    ).toBe('INSUFFICIENT_UNRESERVED_STOCK');
    const e = await opening(p.id, 2, '2026-10-16');
    b = await detail(e.result.batchId);
    okay(
      await command('/api/inventory/waste', {
        productId: p.id,
        batchId: b.id,
        version: b.version,
        quantity: 2,
        reason: 'EXPIRED',
      }),
    );
    expect((await detail(b.id)).physical).toBe('0');
  });
  it('preserves invariants in a waste-versus-allocation race', async () => {
    const p = await product();
    const o = await opening(p.id, 5);
    const b = await detail(o.result.batchId);
    const [w, r] = await Promise.all([
      command('/api/inventory/waste', {
        productId: p.id,
        batchId: b.id,
        version: b.version,
        quantity: 5,
        reason: 'DAMAGED',
      }),
      reserve(p.id, 5).then(
        () => true,
        () => false,
      ),
    ]);
    expect(Number(w.statusCode === 200) + Number(r)).toBe(1);
    expect((await detail(b.id)).consistent).toBe(true);
  });
  it('rejects negative adjustment through reserved quantities', async () => {
    const p = await product();
    const o = await opening(p.id, 5);
    await reserve(p.id, 4);
    const b = await detail(o.result.batchId);
    expect(
      (
        await command('/api/inventory/adjustments', {
          productId: p.id,
          batchId: b.id,
          version: b.version,
          direction: 'OUT',
          quantity: 2,
          reason: 'COUNT_DIFFERENCE',
        })
      ).json().error.code,
    ).toBe('INSUFFICIENT_UNRESERVED_STOCK');
  });
  it('prevents lost adjustments versus allocation and stale versions', async () => {
    const p = await product();
    const o = await opening(p.id, 5);
    const b = await detail(o.result.batchId);
    const [a, r] = await Promise.all([
      command('/api/inventory/adjustments', {
        productId: p.id,
        batchId: b.id,
        version: b.version,
        direction: 'OUT',
        quantity: 3,
        reason: 'COUNT_DIFFERENCE',
      }),
      reserve(p.id, 4).then(
        () => true,
        () => false,
      ),
    ]);
    expect(Number(a.statusCode === 200) + Number(r)).toBe(1);
    expect((await detail(b.id)).consistent).toBe(true);
  });
  it('omits receipt cost for production and all detailed stock for cashier', async () => {
    const p = await product();
    const r = okay(
      await command('/api/inventory/receipts', {
        productId: p.id,
        quantity: 2,
        batch: batchInput(),
        supplierReference: 'Synthetic supplier',
        unitCostCents: 12345,
      }),
    );
    const owner = await req('GET', `/api/inventory/batches/${r.batchId}`);
    expect(owner.json().receipt.unitCostCents).toBe(12345);
    const prod = await req(
      'GET',
      `/api/inventory/batches/${r.batchId}`,
      undefined,
      production.cookie,
    );
    expect(prod.json().receipt).not.toHaveProperty('unitCostCents');
    expect(
      (await req('GET', `/api/inventory/batches/${r.batchId}`, undefined, cashier.cookie))
        .statusCode,
    ).toBe(403);
    const list = await req(
      'GET',
      `/api/inventory?q=${encodeURIComponent(p.code)}`,
      undefined,
      cashier.cookie,
    );
    expect(list.json().items[0]).not.toHaveProperty('physical');
    expect(list.json().items[0]).not.toHaveProperty('reserved');
  });
  it('enforces mutation and production waste scopes on the backend', async () => {
    const p = await product();
    const o = await opening(p.id, 2);
    expect(
      (await command('/api/inventory/opening', o.payload, randomUUID(), cashier.cookie)).statusCode,
    ).toBe(403);
    expect(
      (await command('/api/inventory/opening', o.payload, randomUUID(), production.cookie))
        .statusCode,
    ).toBe(403);
    const b = await detail(o.result.batchId);
    expect(
      (
        await command(
          '/api/inventory/waste',
          { productId: p.id, batchId: b.id, version: b.version, quantity: 1, reason: 'DAMAGED' },
          randomUUID(),
          production.cookie,
        )
      ).json().error.code,
    ).toBe('WASTE_SCOPE');
    for (const path of ['/api/inventory/reservations', '/api/inventory/consume'])
      expect((await req('POST', path, {})).statusCode).toBe(404);
  });
  it('preserves exact Origin/Host and CSRF on every new mutation', async () => {
    const paths = [
      '/api/inventory/opening',
      '/api/inventory/receipts',
      '/api/inventory/waste',
      '/api/inventory/adjustments',
      '/api/production',
      `/api/production/${randomUUID()}/transition`,
      `/api/production/${randomUUID()}/complete`,
    ];
    for (const url of paths) {
      for (const mode of ['csrf', 'origin', 'host'] as const) {
        const safeHeaders: Record<string, string> = { ...headers, cookie };
        if (mode === 'csrf') delete safeHeaders['x-pommier-csrf'];
        if (mode === 'origin') safeHeaders.origin = 'http://localhost:3333';
        if (mode === 'host') safeHeaders.host = 'localhost:3333';
        const r = await app.inject({ method: 'POST', url, headers: safeHeaders, payload: {} });
        expect(r.statusCode).toBe(403);
      }
    }
  });
  it('transactionally reauthorizes a revoked actor before receiving stock', async () => {
    const p = await product();
    const target = await account('inventory-revoked', 'MANAGER');
    const session = await auth.session(target.cookie.split('=')[1]);
    const revoked = { userId: session.userId, sessionId: session.id };
    let locked!: () => void;
    let release!: () => void;
    const lockedPromise = new Promise<void>((r) => {
      locked = r;
    });
    const releasePromise = new Promise<void>((r) => {
      release = r;
    });
    const transaction = db.client.$transaction(async (tx) => {
      await securityLock(tx);
      await tx.user.update({ where: { id: target.id }, data: { active: false } });
      locked();
      await releasePromise;
    });
    await lockedPromise;
    const write = service.opening(
      revoked,
      randomUUID(),
      openingInput.parse({
        productId: p.id,
        quantity: 1,
        batch: batchInput(),
        reason: 'INITIAL_COUNT',
      }),
      randomUUID(),
    );
    release();
    await transaction;
    await expect(write).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(await db.client.batch.count({ where: { productId: p.id } })).toBe(0);
  });
  it('rejects reused key with a changed canonical stock payload and protects lookup ownership', async () => {
    const p = await product();
    const key = randomUUID();
    const payload = { productId: p.id, quantity: 1, batch: batchInput(), reason: 'INITIAL_COUNT' };
    okay(await command('/api/inventory/opening', payload, key));
    expect(
      (await command('/api/inventory/opening', { ...payload, quantity: 2 }, key)).json().error.code,
    ).toBe('IDEMPOTENCY_MISMATCH');
    expect((await req('GET', `/api/inventory/operations/${key}`)).json().found).toBe(true);
    expect(
      (await req('GET', `/api/inventory/operations/${key}`, undefined, manager.cookie)).json()
        .found,
    ).toBe(false);
  });
  it('rolls back an insufficient multi-product allocation including earlier successful lines', async () => {
    const p = await product();
    const q = await product();
    const o = await opening(p.id, 5);
    const key = randomUUID();
    await expect(
      service.reserveMany(
        principal,
        key,
        randomUUID(),
        [
          { productId: p.id, quantity: 2, eligibilityThrough: '2026-10-17' },
          { productId: q.id, quantity: 1, eligibilityThrough: '2026-10-17' },
        ],
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_SELLABLE_STOCK' });
    expect((await detail(o.result.batchId)).reserved).toBe('0');
    expect(await db.client.inventoryOperation.count({ where: { key } })).toBe(0);
  });
  it('rejects invalid direct SQL bounds, mismatched batch/product and missing atomic results', async () => {
    const p = await product();
    const o = await opening(p.id, 3);
    const q = await product();
    const otherBatch = await opening(q.id, 3);
    const reservation = await reserve(p.id, 1);
    // Isolate the composite foreign key from quantity/pending-operation failures.
    await expect(
      db.client.reservationAllocation.create({
        data: {
          productId: p.id,
          batchId: otherBatch.result.batchId,
          reservationId: reservation.result.targetId,
          allocated: 1,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    // All references are valid here; the receipt's own quantity CHECK must reject zero.
    await expect(
      db.client.purchasedProductReceipt.create({
        data: {
          productId: p.id,
          batchId: o.result.batchId,
          actorId: principal.userId,
          quantity: 0,
          supplierReference: 'Synthetic direct check',
          recordedAt: now,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.client.inventoryMovement.create({
        data: {
          productId: q.id,
          batchId: o.result.batchId,
          operationId: o.result.operationId,
          actorId: principal.userId,
          type: 'WASTE',
          quantity: -1,
          reason: 'INVALID',
          createdAt: now,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.client.batch.create({
        data: {
          productId: p.id,
          reference: 'Invalid unknown',
          referenceKey: 'invalid unknown',
          source: 'OPENING',
          recordedAt: now,
          actorId: principal.userId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.client.inventoryOperation.create({
        data: {
          actorId: principal.userId,
          key: randomUUID(),
          kind: 'WASTE',
          requestDigest: 'a'.repeat(64),
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.client.reservationAllocation.create({
        data: {
          productId: p.id,
          batchId: o.result.batchId,
          reservationId: randomUUID(),
          allocated: 1,
          consumed: 2,
        },
      }),
    ).rejects.toThrow();
  });
  it('enforces append-only ledger, immutable batch expiry and completed history', async () => {
    const p = await product();
    const id = await started(p.id);
    const c = okay(
      await command(`/api/production/${id}/complete`, {
        version: 2,
        actualQuantity: 1,
        batch: batchInput(),
      }),
    );
    const movement = await db.client.inventoryMovement.findFirstOrThrow({
      where: { batchId: c.batchId },
    });
    await expect(
      db.client.inventoryMovement.update({ where: { id: movement.id }, data: { quantity: 2 } }),
    ).rejects.toThrow();
    await expect(
      db.client.inventoryMovement.delete({ where: { id: movement.id } }),
    ).rejects.toThrow();
    await expect(
      db.client.batch.update({
        where: { id: c.batchId },
        data: { expiresAt: new Date('2026-10-21') },
      }),
    ).rejects.toThrow();
    await expect(
      db.client.productionRecord.update({ where: { id }, data: { actualQuantity: 9 } }),
    ).rejects.toThrow();
  });
  it('detects privileged test-only projection drift and blocks writes without repairing it', async () => {
    const p = await product();
    const o = await opening(p.id, 5);
    await db.client.$executeRawUnsafe(
      'ALTER TABLE "Batch" DISABLE TRIGGER "Batch_projection_consistency"',
    );
    try {
      await db.client.batch.update({
        where: { id: o.result.batchId },
        data: { physical: 6n, version: { increment: 1 } },
      });
    } finally {
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "Batch" ENABLE TRIGGER "Batch_projection_consistency"',
      );
    }
    const report = await req('GET', `/api/inventory/products/${p.id}/reconciliation`);
    expect(report.json()).toMatchObject({
      consistent: false,
      findings: [{ code: 'PHYSICAL_DRIFT', expected: '5', actual: '6' }],
    });
    const b = await detail(o.result.batchId);
    expect(b.consistent).toBe(false);
    expect(
      (
        await command('/api/inventory/waste', {
          productId: p.id,
          batchId: b.id,
          version: b.version,
          quantity: 1,
          reason: 'DAMAGED',
        })
      ).json().error.code,
    ).toBe('STOCK_RECONCILIATION_REQUIRED');
    expect((await db.client.batch.findUniqueOrThrow({ where: { id: b.id } })).physical).toBe(6n);
  });
  it('orders product deactivation/origin changes against completion without partial stock', async () => {
    for (const change of [{ active: false }, { origin: 'PURCHASED' as const }]) {
      const p = await product('PRODUCED');
      const id = await started(p.id);
      const [completion, edit] = await Promise.all([
        command(`/api/production/${id}/complete`, {
          version: 2,
          actualQuantity: 2,
          batch: batchInput(),
        }),
        req('PATCH', `/api/products/${p.id}`, {
          code: p.code,
          name: p.name,
          categoryId,
          origin: p.origin,
          active: true,
          sellingPriceCents: 1250,
          version: 1,
          reason: 'CATALOG_CORRECTION',
          ...change,
        }),
      ]);
      expect(edit.statusCode).toBe(200);
      expect([200, 409]).toContain(completion.statusCode);
      expect(await db.client.batch.count({ where: { productId: p.id } })).toBe(
        completion.statusCode === 200 ? 1 : 0,
      );
    }
  });
  it('upgrades Phase 3 data without changing identity, closure, catalog or customer privacy state', async () => {
    const upgrade = await freshDatabase('registry');
    try {
      const old = upgrade.registryLegacy!;
      expect(
        (await upgrade.client.customer.findUniqueOrThrow({ where: { id: old.customerId } }))
          .marketingState,
      ).toBe('OPTED_OUT');
      expect(
        (
          await upgrade.client.marketingPreferenceEvent.findUniqueOrThrow({
            where: { id: old.marketingId },
          })
        ).evidence,
      ).toBe('Synthetic retained reference');
      expect(
        await upgrade.client.product.findUniqueOrThrow({ where: { id: old.productId } }),
      ).toMatchObject({ sellingPriceCents: 1399, estimatedCostCents: 500, active: false });
      expect(
        (await upgrade.client.category.findUniqueOrThrow({ where: { id: old.categoryId } })).active,
      ).toBe(false);
      expect(
        (await upgrade.client.user.findUniqueOrThrow({ where: { id: upgrade.legacy!.userId } }))
          .passwordHash,
      ).toBe(upgrade.legacy!.passwordHash);
      expect(
        (await upgrade.client.installationState.findUniqueOrThrow({ where: { id: 1 } }))
          .initializedAt,
      ).toEqual(upgrade.legacy!.initializedAt);
      expect(await upgrade.client.session.count()).toBe(1);
      expect(await upgrade.client.batch.count()).toBe(0);
    } finally {
      await upgrade.connection.close();
    }
  }, 60000);
  it('enforces command bounds and aggregates beyond int32 using exact decimal strings', async () => {
    const [numeric] = await db.client.$queryRaw<
      Array<{ total: string; aboveSafe: string }>
    >`SELECT SUM(n)::text AS total, (9007199254740993::numeric+100000)::text AS "aboveSafe" FROM (VALUES (2147483647::bigint),(2147483647::bigint)) values_to_sum(n)`;
    expect(numeric).toEqual({ total: '4294967294', aboveSafe: '9007199254840993' });
    const p = await product();
    for (const quantity of [0, -1, 1.5, 100001])
      expect(
        (
          await command('/api/inventory/opening', {
            productId: p.id,
            quantity,
            batch: batchInput(),
            reason: 'INITIAL_COUNT',
          })
        ).statusCode,
      ).toBe(400);
    const o = await opening(p.id, 100000);
    await db.client.$executeRawUnsafe(
      'ALTER TABLE "Batch" DISABLE TRIGGER "Batch_projection_consistency"',
    );
    try {
      await expect(
        db.client.batch.update({
          where: { id: o.result.batchId },
          data: { physical: MAX_BATCH_UNITS + 1n, version: { increment: 1 } },
        }),
      ).rejects.toThrow();
    } finally {
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "Batch" ENABLE TRIGGER "Batch_projection_consistency"',
      );
    }
    const summary = await service.list(principal, stockQuery.parse({ q: p.code }));
    expect(summary.items[0]?.physical).toBe('100000');
    expect(typeof summary.items[0]?.physical).toBe('string');
  });
  it('cancels pre-finished failure without subtracting nonexistent stock or double-counting shortfall', async () => {
    const p = await product();
    const id = await started(p.id, 10);
    okay(
      await command(`/api/production/${id}/transition`, {
        version: 2,
        action: 'CANCEL',
        reason: 'FAILED_BEFORE_FINISH',
      }),
    );
    expect(await db.client.inventoryMovement.count({ where: { productId: p.id } })).toBe(0);
    expect(
      (
        await command(`/api/production/${id}/complete`, {
          version: 3,
          actualQuantity: 1,
          batch: batchInput(),
        })
      ).statusCode,
    ).toBe(409);
  });
  it('creates explicit positive adjustment batches and compensates completed production without rewriting it', async () => {
    const p = await product();
    const id = await started(p.id);
    const c = okay(
      await command(`/api/production/${id}/complete`, {
        version: 2,
        actualQuantity: 6,
        batch: batchInput(),
      }),
    );
    const original = await db.client.inventoryMovement.findFirstOrThrow({
      where: { batchId: c.batchId },
    });
    const b = await detail(c.batchId);
    okay(
      await command('/api/inventory/adjustments', {
        productId: p.id,
        batchId: b.id,
        version: b.version,
        direction: 'OUT',
        quantity: 2,
        reason: 'PRODUCTION_CORRECTION',
        correctsMovementId: original.id,
      }),
    );
    expect(
      (await db.client.productionRecord.findUniqueOrThrow({ where: { id } })).actualQuantity,
    ).toBe(6);
    expect((await detail(b.id)).physical).toBe('4');
    const a = okay(
      await command('/api/inventory/adjustments', {
        productId: p.id,
        newBatch: batchInput(),
        direction: 'IN',
        quantity: 2,
        reason: 'COUNT_DIFFERENCE',
      }),
    );
    expect((await detail(a.batchId)).physical).toBe('2');
  });
  it('does not preserve supplier/operational notes or raw request payloads in audit/operation results', async () => {
    const p = await product();
    const privateText = 'Synthetic supplier/private note sentinel';
    const r = okay(
      await command('/api/inventory/receipts', {
        productId: p.id,
        quantity: 1,
        batch: { ...batchInput(), notes: privateText },
        supplierReference: privateText,
        notes: privateText,
      }),
    );
    const events = await db.client.auditEvent.findMany({ where: { targetId: r.targetId } });
    expect(JSON.stringify(events)).not.toContain(privateText);
    const op = await db.client.inventoryOperation.findUniqueOrThrow({
      where: { id: r.operationId },
    });
    expect(JSON.stringify(op.result)).not.toContain(privateText);
    expect(op).not.toHaveProperty('payload');
  });
});
