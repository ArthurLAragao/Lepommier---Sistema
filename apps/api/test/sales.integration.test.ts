import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { pickupLocalOf, orderDetailSchema, type OrderDetail } from '@pommier/shared';
import { buildApp } from '../src/app.js';
import { AuthService, securityLock } from '../src/auth/service.js';
import { SalesService } from '../src/sales/service.js';
import { freshDatabase } from './database.js';
const BASE = new Date('2026-10-17T18:00:00Z');
let now = new Date(BASE);
const password = randomBytes(24).toString('base64url');
const secret = randomBytes(32).toString('base64url');
const headers = {
  host: '127.0.0.1:3333',
  origin: 'http://127.0.0.1:3333',
  'content-type': 'application/json',
  'x-pommier-csrf': '1',
};
let db: Awaited<ReturnType<typeof freshDatabase>>;
let app: FastifyInstance;
let cookie = '';
let categoryId = '';
let serial = 0;
let cashier: { id: string; cookie: string };
let manager: { id: string; cookie: string };
let production: { id: string; cookie: string };
type Reply = Awaited<ReturnType<FastifyInstance['inject']>>;
async function req(
  method: InjectOptions['method'],
  url: string,
  payload?: unknown,
  session = cookie,
) {
  return app.inject({
    method: method ?? 'GET',
    url,
    headers: { ...headers, ...(session ? { cookie: session } : {}) },
    ...(payload === undefined ? {} : { payload }),
  } as InjectOptions);
}
const cmd = (url: string, payload: unknown, key = randomUUID(), session = cookie) =>
  req('POST', url, { key, payload }, session);
function okay(r: Reply) {
  expect(r.statusCode, r.json().error?.code).toBe(200);
  return r.json() as { targetId: string; operationId: string; batchId: string };
}
async function account(login: string, role: 'MANAGER' | 'CASHIER' | 'PRODUCTION') {
  const a = await req('POST', '/api/users', {
    loginIdentifier: login,
    displayName: 'Synthetic sales employee',
    role,
    password,
  });
  expect(a.statusCode).toBe(201);
  const r = await req('POST', '/api/auth/login', { loginIdentifier: login, password }, '');
  expect(r.statusCode).toBe(200);
  return { id: a.json().user.id as string, cookie: String(r.headers['set-cookie']).split(';')[0]! };
}
async function cash() {
  if (!(await db.client.cashSession.count({ where: { closedAt: null } })))
    okay(await cmd('/api/cash-sessions', { openingFloatCents: '10000' }));
}
async function closeCashFixture() {
  const s = await db.client.cashSession.findFirst({
    where: { closedAt: null },
    select: { id: true, activityVersion: true },
  });
  if (!s) return;
  const view = await req('GET', `/api/cash/sessions/${s.id}`);
  expect(view.statusCode).toBe(200);
  okay(
    await cmd('/api/cash/close', {
      sessionId: s.id,
      activityVersion: s.activityVersion,
      countedCents: view.json().totals.expectedCents,
      confirmed: true,
    }),
  );
}
async function customer(extra: Record<string, unknown> = {}) {
  const r = await req('POST', '/api/customers', {
    name: `Synthetic sales customer ${++serial}`,
    ...extra,
  });
  expect(r.statusCode).toBe(201);
  return r.json().customer as { id: string; version: number; registration: string };
}
async function product(stock = 5, price = 1000, expiry: string | null = '2099-01-01') {
  const n = ++serial;
  const r = await req('POST', '/api/products', {
    code: `SALE-${n}`,
    name: `Synthetic sale product ${n}`,
    categoryId,
    origin: 'BOTH',
    sellingPriceCents: price,
    estimatedCostCents: 333,
    ...(price === 0 ? { allowZeroPrice: true } : {}),
  });
  expect(r.statusCode, r.json().error?.code).toBe(201);
  const p = r.json().product as {
    id: string;
    version: number;
    sellingPriceCents: number;
    name: string;
    code: string;
  };
  if (stock)
    okay(
      await cmd('/api/inventory/opening', {
        productId: p.id,
        quantity: stock,
        reason: 'INITIAL_COUNT',
        batch: {
          reference: `SYNTHETIC-${n}`,
          expiresAt: expiry,
          ...(expiry === null ? { expiryUnknownReason: 'NOT_PROVIDED' } : {}),
        },
      }),
    );
  return p;
}
const line = (p: Awaited<ReturnType<typeof product>>, quantity = 1) => ({
  productId: p.id,
  quantity,
  productVersion: p.version,
  unitPriceCents: p.sellingPriceCents,
});
async function detail(id: string, session = cookie): Promise<OrderDetail> {
  const r = await req('GET', `/api/orders/${id}`, undefined, session);
  expect(r.statusCode, r.json().error?.code).toBe(200);
  return orderDetailSchema.parse(r.json()).order;
}
async function counter(
  p: Awaited<ReturnType<typeof product>>,
  quantity = 1,
  extra: Record<string, unknown> = {},
  method = 'CASH',
  key = randomUUID(),
  session = cookie,
) {
  const amount = String(p.sellingPriceCents * quantity);
  return cmd(
    '/api/sales/checkout',
    {
      draft: { source: 'COUNTER', lines: [line(p, quantity)], ...extra },
      payment: {
        amountCents: amount,
        method,
        manuallyConfirmed: true,
        ...(method === 'CASH' ? { tenderedCents: String(Number(amount) + 200) } : {}),
      },
    },
    key,
    session,
  );
}
async function draft(
  p: Awaited<ReturnType<typeof product>>,
  quantity = 1,
  extra: Record<string, unknown> = {},
) {
  const c = extra.customerId ? null : await customer();
  const payload = {
    source: 'WHATSAPP',
    customerId: c?.id,
    pickupLocal: pickupLocalOf(new Date(now.getTime() + 3600000)),
    lines: [line(p, quantity)],
    ...extra,
  };
  return { id: okay(await cmd('/api/orders', payload)).targetId, payload };
}
async function confirm(id: string) {
  const o = await detail(id);
  return cmd(`/api/orders/${id}/confirm`, { version: o.version, expectedTotalCents: o.totalCents });
}
async function ready(id: string) {
  okay(await confirm(id));
  for (const to of ['PREPARING', 'READY'])
    okay(await cmd(`/api/orders/${id}/progress`, { version: (await detail(id)).version, to }));
}
async function pay(id: string, method = 'PIX', key = randomUUID()) {
  const o = await detail(id);
  return cmd(
    `/api/orders/${id}/payment`,
    {
      version: o.version,
      payment: {
        amountCents: o.totalCents,
        method,
        manuallyConfirmed: true,
        ...(method === 'CASH' ? { tenderedCents: String(BigInt(o.totalCents) + 200n) } : {}),
      },
    },
    key,
  );
}
async function handover(id: string, key = randomUUID()) {
  return cmd(`/api/orders/${id}/handover`, { version: (await detail(id)).version }, key);
}
async function cancel(id: string, confirmed = false, key = randomUUID(), session = cookie) {
  return cmd(
    `/api/orders/${id}/cancel`,
    {
      version: (await detail(id)).version,
      reason: 'CUSTOMER_REQUEST',
      ...(confirmed ? { externalRefundConfirmed: true } : {}),
    },
    key,
    session,
  );
}
async function refund(id: string, key = randomUUID()) {
  return cmd(
    `/api/orders/${id}/refund`,
    { version: (await detail(id)).version, reason: 'QUALITY_ISSUE', externalRefundConfirmed: true },
    key,
  );
}
async function balances(p: string) {
  const rows = await db.client.batch.findMany({
    where: { productId: p },
    select: { physical: true, reserved: true },
  });
  return rows.reduce(
    (n, r) => ({ physical: n.physical + r.physical, reserved: n.reserved + r.reserved }),
    { physical: 0n, reserved: 0n },
  );
}
beforeAll(async () => {
  db = await freshDatabase();
  app = await buildApp({
    database: db.connection,
    origin: headers.origin,
    installationSecret: secret,
    clock: () => now,
  });
  expect(
    (
      await req(
        'POST',
        '/api/auth/setup',
        {
          loginIdentifier: 'sales-owner',
          displayName: 'Synthetic sales owner',
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
    { loginIdentifier: 'sales-owner', password },
    '',
  );
  cookie = String(login.headers['set-cookie']).split(';')[0]!;
  cashier = await account('sales-cashier', 'CASHIER');
  manager = await account('sales-manager', 'MANAGER');
  production = await account('sales-production', 'PRODUCTION');
  const c = await req('POST', '/api/categories', { name: 'Synthetic sales category' });
  expect(c.statusCode).toBe(201);
  categoryId = c.json().category.id;
  await cash();
}, 60000);
beforeEach(async () => {
  now = new Date(BASE);
  await cash();
});
afterAll(async () => {
  await app?.close();
});
describe('Phase 5 real PostgreSQL', () => {
  it('1 anonymously checks out with one order/payment/consumption and immutable snapshots', async () => {
    const p = await product();
    const id = okay(await counter(p)).targetId;
    const o = await detail(id);
    expect(o).toMatchObject({
      status: 'FULFILLED',
      customer: null,
      totalCents: '1000',
      paymentState: 'PAID',
    });
    expect(o.items[0]).toMatchObject({
      productCode: p.code,
      productName: p.name,
      unitPriceCents: 1000,
      quantity: 1,
    });
    expect(await balances(p.id)).toEqual({ physical: 4n, reserved: 0n });
  });
  it('2 connects a counter sale to an active customer without PII snapshots', async () => {
    const c = await customer();
    const p = await product();
    const id = okay(await counter(p, 1, { customerId: c.id })).targetId;
    expect((await detail(id)).customer?.id).toBe(c.id);
    expect((await req('GET', `/api/customers/${c.id}/order-history`)).json()).toMatchObject({
      fulfilledTotalCents: '1000',
      paymentsReceivedCents: '1000',
      refundsCents: '0',
    });
  });
  it('3 requires review when catalog price/version changes after cart/draft creation', async () => {
    const p = await product();
    const d = await draft(p);
    await db.client.product.update({
      where: { id: p.id },
      data: { sellingPriceCents: 1200, version: { increment: 1 } },
    });
    expect((await counter(p)).json().error.code).toBe('PRICE_REVIEW_REQUIRED');
    expect((await confirm(d.id)).json().error.code).toBe('PRICE_REVIEW_REQUIRED');
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 0n });
  });
  it('4 rejects cashier discount and rechecks discount authority on confirmation', async () => {
    const p = await product();
    const r = await counter(
      p,
      1,
      { discountCents: '100', discountReason: 'COURTESY' },
      'CASH',
      randomUUID(),
      cashier.cookie,
    );
    expect(r.statusCode).toBe(403);
    const d = await draft(p, 1, { discountCents: '100', discountReason: 'COURTESY' });
    expect(
      (
        await cmd(
          `/api/orders/${d.id}/confirm`,
          { version: 1, expectedTotalCents: '900' },
          randomUUID(),
          cashier.cookie,
        )
      ).statusCode,
    ).toBe(403);
  });
  it('5 rolls back checkout including payment, reservations, ledger, events and result after final audit failure', async () => {
    const p = await product();
    const count = await db.client.order.count();
    const key = randomUUID();
    await db.client.$executeRawUnsafe(
      `CREATE FUNCTION sales_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='ORDER_FULFILLED' THEN RAISE EXCEPTION 'synthetic final audit failure'; END IF; RETURN NEW; END $$`,
    );
    await db.client.$executeRawUnsafe(
      'CREATE TRIGGER sales_failure BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION sales_fail()',
    );
    try {
      expect((await counter(p, 1, {}, 'CASH', key)).statusCode).toBe(500);
    } finally {
      await db.client.$executeRawUnsafe('DROP TRIGGER sales_failure ON "AuditEvent"');
      await db.client.$executeRawUnsafe('DROP FUNCTION sales_fail()');
    }
    expect(await db.client.order.count()).toBe(count);
    expect(await db.client.inventoryOperation.count({ where: { key } })).toBe(0);
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 0n });
  });
  it('6 serializes competing checkouts for final stock', async () => {
    const p = await product(1);
    const r = await Promise.all([counter(p), counter(p)]);
    expect(r.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    expect(await db.client.orderItem.count({ where: { productId: p.id } })).toBe(1);
    expect(await balances(p.id)).toEqual({ physical: 0n, reserved: 0n });
  });
  it('7 retries concurrent checkout with the same key exactly once', async () => {
    const p = await product();
    const key = randomUUID();
    const r = await Promise.all([counter(p, 1, {}, 'PIX', key), counter(p, 1, {}, 'PIX', key)]);
    expect(okay(r[0]!)).toEqual(okay(r[1]!));
    expect(await db.client.payment.count({ where: { orderId: r[0]!.json().targetId } })).toBe(1);
    expect(await balances(p.id)).toEqual({ physical: 4n, reserved: 0n });
  });
  it('8 rolls back multi-product checkout if any item is insufficient', async () => {
    const p = await product();
    const q = await product(0);
    const r = await cmd('/api/sales/checkout', {
      draft: { source: 'COUNTER', lines: [line(p), line(q)] },
      payment: { amountCents: '2000', method: 'PIX', manuallyConfirmed: true },
    });
    expect(r.json().error.code).toBe('INSUFFICIENT_SELLABLE_STOCK');
    expect(await db.client.orderItem.count({ where: { productId: p.id } })).toBe(0);
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 0n });
    const id = okay(
      await cmd('/api/orders', { source: 'COUNTER', lines: [line(p), line(q)] }),
    ).targetId;
    expect((await confirm(id)).json().error.code).toBe('INSUFFICIENT_SELLABLE_STOCK');
    expect((await detail(id)).status).toBe('DRAFT');
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 0n });
  });
  it('9 reserves only batches suitable through the WhatsApp pickup business date', async () => {
    const p = await product(5, 1000, '2026-10-17');
    const tomorrow = pickupLocalOf(new Date(BASE.getTime() + 86400000));
    const d = await draft(p, 1, { pickupLocal: tomorrow });
    expect((await confirm(d.id)).json().error.code).toBe('INSUFFICIENT_SELLABLE_STOCK');
    expect((await detail(d.id)).status).toBe('DRAFT');
  });
  it('10 blocks paid pickup after allocated batch expiry without silently replacing it', async () => {
    const p = await product(5, 1000, '2026-10-17');
    const d = await draft(p);
    await ready(d.id);
    okay(await pay(d.id));
    await db.client.session.updateMany({ data: { expiresAt: new Date('2099-01-01') } });
    now = new Date('2026-10-18T03:00:00Z');
    expect((await handover(d.id)).json().error.code).toBe('RESERVED_BATCH_EXPIRED');
    expect((await detail(d.id)).reservationIssues[0]?.code).toBe('EXPIRED');
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 1n });
  });
  it('11 resolves expired allocation explicitly by paid cancellation/refund then recreation', async () => {
    const p = await product(5, 1000, '2026-10-17');
    const d = await draft(p);
    await ready(d.id);
    okay(await pay(d.id));
    now = new Date('2026-10-18T03:00:00Z');
    okay(await cancel(d.id, true));
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 0n });
    okay(
      await cmd('/api/inventory/opening', {
        productId: p.id,
        quantity: 2,
        reason: 'INITIAL_COUNT',
        batch: { reference: `FRESH-${++serial}`, expiresAt: '2099-01-01' },
      }),
    );
    const replacement = await draft(p);
    okay(await confirm(replacement.id));
    expect((await detail(d.id)).paymentState).toBe('REFUNDED');
    expect((await detail(replacement.id)).status).toBe('CONFIRMED');
  });
  it('12 rejects unpaid handover without consuming stock', async () => {
    const p = await product();
    const d = await draft(p);
    await ready(d.id);
    expect((await handover(d.id)).json().error.code).toBe('PAYMENT_REQUIRED');
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 1n });
  });
  it('13 accepts payment before pickup without reducing physical stock', async () => {
    const p = await product();
    const d = await draft(p);
    okay(await confirm(d.id));
    okay(await pay(d.id));
    expect((await detail(d.id)).paymentState).toBe('PAID');
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 1n });
  });
  it('14 records full payment at ready pickup then consumes the owned reservation', async () => {
    const p = await product();
    const d = await draft(p);
    await ready(d.id);
    okay(await pay(d.id, 'CREDIT_CARD'));
    okay(await handover(d.id));
    expect((await detail(d.id)).status).toBe('FULFILLED');
    expect(await balances(p.id)).toEqual({ physical: 4n, reserved: 0n });
  });
  it('15 stores one payment across concurrent different keys and same-key retries', async () => {
    const p = await product();
    const d = await draft(p);
    okay(await confirm(d.id));
    const version = (await detail(d.id)).version;
    const payload = {
      version,
      payment: { amountCents: '1000', method: 'PIX', manuallyConfirmed: true },
    };
    const key = randomUUID();
    const r = await Promise.all([
      cmd(`/api/orders/${d.id}/payment`, payload, key),
      cmd(`/api/orders/${d.id}/payment`, payload),
    ]);
    expect(r.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    const success = r.find((x) => x.statusCode === 200)!;
    if (r[0]!.statusCode === 200)
      expect(okay(await cmd(`/api/orders/${d.id}/payment`, payload, key))).toEqual(okay(success));
    expect(await db.client.payment.count({ where: { orderId: d.id } })).toBe(1);
  });
  it('16 preserves payment-versus-cancellation atomicity', async () => {
    const p = await product();
    const d = await draft(p);
    okay(await confirm(d.id));
    const version = (await detail(d.id)).version;
    const r = await Promise.all([
      cmd(`/api/orders/${d.id}/payment`, {
        version,
        payment: { amountCents: '1000', method: 'PIX', manuallyConfirmed: true },
      }),
      cmd(`/api/orders/${d.id}/cancel`, { version, reason: 'CUSTOMER_REQUEST' }),
    ]);
    expect(r.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    const o = await detail(d.id);
    expect(o.status === 'CANCELLED' ? o.paymentState === 'UNPAID' : o.paymentState === 'PAID').toBe(
      true,
    );
  });
  it('17 allows only one handover or paid cancellation in a race', async () => {
    const p = await product();
    const d = await draft(p);
    await ready(d.id);
    okay(await pay(d.id));
    const version = (await detail(d.id)).version;
    const r = await Promise.all([
      cmd(`/api/orders/${d.id}/handover`, { version }),
      cmd(`/api/orders/${d.id}/cancel`, {
        version,
        reason: 'CUSTOMER_REQUEST',
        externalRefundConfirmed: true,
      }),
    ]);
    expect(r.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    const o = await detail(d.id);
    expect(await balances(p.id)).toEqual({
      physical: o.status === 'FULFILLED' ? 4n : 5n,
      reserved: 0n,
    });
  });
  it('18 double handover consumes only once', async () => {
    const p = await product();
    const d = await draft(p);
    await ready(d.id);
    okay(await pay(d.id));
    const payload = { version: (await detail(d.id)).version };
    const key = randomUUID();
    const r = await Promise.all([
      cmd(`/api/orders/${d.id}/handover`, payload, key),
      cmd(`/api/orders/${d.id}/handover`, payload, key),
    ]);
    expect(okay(r[0]!)).toEqual(okay(r[1]!));
    expect(await balances(p.id)).toEqual({ physical: 4n, reserved: 0n });
  });
  it('19 unpaid cancellation releases once and preserves the original order', async () => {
    const p = await product();
    const d = await draft(p);
    okay(await confirm(d.id));
    const payload = { version: (await detail(d.id)).version, reason: 'ENTRY_ERROR' };
    const key = randomUUID();
    okay(await cmd(`/api/orders/${d.id}/cancel`, payload, key));
    okay(await cmd(`/api/orders/${d.id}/cancel`, payload, key));
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 0n });
    expect((await detail(d.id)).status).toBe('CANCELLED');
  });
  it('20 paid cancellation atomically records full original-method refund and releases', async () => {
    const p = await product();
    const d = await draft(p);
    okay(await confirm(d.id));
    okay(await pay(d.id, 'DEBIT_CARD'));
    expect((await cancel(d.id, false)).statusCode).toBe(400);
    expect((await cancel(d.id, true, randomUUID(), manager.cookie)).statusCode).toBe(403);
    await db.client.$executeRawUnsafe(
      `CREATE FUNCTION sales_cancel_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='ORDER_CANCELLED' THEN RAISE EXCEPTION 'synthetic cancellation audit failure'; END IF; RETURN NEW; END $$`,
    );
    await db.client.$executeRawUnsafe(
      'CREATE TRIGGER sales_cancel_failure BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION sales_cancel_fail()',
    );
    try {
      expect((await cancel(d.id, true)).statusCode).toBe(500);
    } finally {
      await db.client.$executeRawUnsafe('DROP TRIGGER sales_cancel_failure ON "AuditEvent"');
      await db.client.$executeRawUnsafe('DROP FUNCTION sales_cancel_fail()');
    }
    expect((await detail(d.id)).paymentState).toBe('PAID');
    expect(await db.client.refund.count({ where: { orderId: d.id } })).toBe(0);
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 1n });
    okay(await cancel(d.id, true));
    const o = await detail(d.id);
    expect(o).toMatchObject({
      status: 'CANCELLED',
      paymentState: 'REFUNDED',
      refund: { amountCents: '1000', method: 'DEBIT_CARD' },
    });
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 0n });
  });
  it('21 fulfilled refund retains handover and never restocks food', async () => {
    const p = await product();
    const id = okay(await counter(p, 1, {}, 'CREDIT_CARD')).targetId;
    const before = (await detail(id)).fulfilledAt;
    okay(await refund(id));
    expect(await balances(p.id)).toEqual({ physical: 4n, reserved: 0n });
    expect(await detail(id)).toMatchObject({
      status: 'FULFILLED',
      fulfilledAt: before,
      paymentState: 'REFUNDED',
      refund: { method: 'CREDIT_CARD' },
    });
  });
  it('22 concurrent refunds create one full immutable refund', async () => {
    const p = await product();
    const id = okay(await counter(p)).targetId;
    const payload = {
      version: (await detail(id)).version,
      reason: 'QUALITY_ISSUE',
      externalRefundConfirmed: true,
    };
    const r = await Promise.all([
      cmd(`/api/orders/${id}/refund`, payload),
      cmd(`/api/orders/${id}/refund`, payload),
    ]);
    expect(r.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    expect(await db.client.refund.count({ where: { orderId: id } })).toBe(1);
  });
  it('23 missing active cash session blocks payment, checkout and refund without auto-opening', async () => {
    const p = await product();
    const id = okay(await counter(p)).targetId;
    const d = await draft(p);
    okay(await confirm(d.id));
    await closeCashFixture();
    expect((await pay(d.id)).json().error.code).toBe('CASH_SESSION_REQUIRED');
    expect((await refund(id)).json().error.code).toBe('CASH_SESSION_REQUIRED');
    expect((await counter(p)).json().error.code).toBe('CASH_SESSION_REQUIRED');
    expect(await db.client.cashSession.count({ where: { closedAt: null } })).toBe(0);
  });
  it('24 concurrent explicit opening leaves one active session and retries safely', async () => {
    await closeCashFixture();
    const input = { openingFloatCents: '12345' };
    const key = randomUUID();
    const r = await Promise.all([
      cmd('/api/cash-sessions', input, key),
      cmd('/api/cash-sessions', input),
    ]);
    expect(r.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    if (r[0]!.statusCode === 200)
      expect(okay(await cmd('/api/cash-sessions', input, key))).toEqual(okay(r[0]!));
    expect(await db.client.cashSession.count({ where: { closedAt: null } })).toBe(1);
    expect((await cmd('/api/cash-sessions', input, randomUUID(), cashier.cookie)).statusCode).toBe(
      403,
    );
  });
  it('25 cash tender/change uses the sale amount and rejects insufficient tender', async () => {
    const p = await product();
    const id = okay(await counter(p)).targetId;
    expect((await detail(id)).payment).toMatchObject({
      amountCents: '1000',
      tenderedCents: '1200',
      changeCents: '200',
    });
    const r = await cmd('/api/sales/checkout', {
      draft: { source: 'COUNTER', lines: [line(p)] },
      payment: {
        amountCents: '1000',
        method: 'CASH',
        tenderedCents: '999',
        manuallyConfirmed: true,
      },
    });
    expect(r.json().error.code).toBe('CASH_TENDER');
  });
  it('26 Pix/cards have no physical tender/change and are distinguishable from cash receipts', async () => {
    const p = await product(10);
    const ids = [];
    for (const method of ['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD'])
      ids.push(okay(await counter(p, 1, {}, method)).targetId);
    const payments = await db.client.payment.findMany({
      where: { orderId: { in: ids } },
      select: { method: true, amountCents: true, tenderedCents: true, changeCents: true },
    });
    expect(
      payments.filter((p) => p.method === 'CASH').reduce((n, p) => n + p.amountCents, 0n),
    ).toBe(1000n);
    expect(
      payments
        .filter((p) => p.method !== 'CASH')
        .every((p) => p.tenderedCents === null && p.changeCents === null),
    ).toBe(true);
  });
  it('27 denies production every order/payment/customer-history path and omits private/customer cost fields', async () => {
    const c = await customer({
      cpf: '11144477735',
      notes: 'PRIVATE-CUSTOMER-SALES-MARKER',
      email: 'synthetic-sales@example.test',
    });
    const p = await product();
    const id = okay(await counter(p, 1, { customerId: c.id })).targetId;
    for (const path of [
      '/api/orders',
      `/api/orders/${id}`,
      '/api/sales/catalog',
      '/api/cash-sessions/current',
      `/api/customers/${c.id}/order-history`,
    ])
      expect((await req('GET', path, undefined, production.cookie)).statusCode).toBe(403);
    const o = await detail(id, cashier.cookie);
    const json = JSON.stringify(o);
    expect(json).not.toContain('11144477735');
    expect(json).not.toContain('PRIVATE-CUSTOMER');
    expect(json).not.toContain('estimatedCostCents');
    expect(
      (await req('GET', '/api/cash-sessions/current', undefined, cashier.cookie)).json().session,
    ).not.toHaveProperty('openingFloatCents');
    expect(
      (await req('GET', '/api/sales/catalog', undefined, cashier.cookie)).json().items[0],
    ).not.toHaveProperty('estimatedCostCents');
  });
  it('28 rechecks a stale principal after revocation under the security lock', async () => {
    const target = await account('sales-revoked', 'CASHIER');
    const auth = new AuthService(db.client, () => now, secret);
    const session = await auth.session(target.cookie.split('=')[1]);
    const principal = { userId: session.userId, sessionId: session.id };
    const p = await product();
    let unlock!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((r) => (unlock = r));
    const acquired = new Promise<void>((r) => (entered = r));
    const revocation = db.client.$transaction(
      async (tx) => {
        await securityLock(tx);
        await tx.user.update({
          where: { id: target.id },
          data: { active: false, version: { increment: 1 } },
        });
        await tx.session.updateMany({ where: { userId: target.id }, data: { revokedAt: now } });
        entered();
        await gate;
      },
      { timeout: 10000 },
    );
    await acquired;
    const service = new SalesService(auth, () => now);
    const action = service.checkout(
      principal,
      randomUUID(),
      {
        draft: { source: 'COUNTER', lines: [line(p)], discountCents: '0' },
        payment: { method: 'PIX', amountCents: '1000', manuallyConfirmed: true },
      },
      randomUUID(),
    );
    const rejected = expect(action).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    unlock();
    await revocation;
    await rejected;
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 0n });
  });
  it('29 applies exact Host/Origin and CSRF to every new mutation', async () => {
    for (const path of [
      '/api/sales/checkout',
      '/api/orders',
      '/api/cash-sessions',
      ...['edit', 'confirm', 'progress', 'payment', 'handover', 'cancel', 'refund'].map(
        (p) => `/api/orders/${randomUUID()}/${p}`,
      ),
    ]) {
      for (const change of [
        { origin: undefined },
        { origin: 'http://localhost:3333' },
        { 'x-pommier-csrf': undefined },
        { host: 'evil.invalid' },
      ]) {
        const r = await app.inject({
          method: 'POST',
          url: path,
          headers: Object.fromEntries(
            Object.entries({ ...headers, cookie, ...change }).filter(
              ([, value]) => value !== undefined,
            ),
          ),
          payload: { key: randomUUID(), payload: {} },
        });
        expect([400, 403]).toContain(r.statusCode);
        expect(r.json().error.requestId).toBeTruthy();
      }
    }
  });
  it('30 rejects stale draft edits and freezes confirmed items/prices', async () => {
    const p = await product();
    const d = await draft(p);
    const payload = { version: 1, draft: { ...d.payload, notes: 'Synthetic revised draft' } };
    const r = await Promise.all([
      cmd(`/api/orders/${d.id}/edit`, payload),
      cmd(`/api/orders/${d.id}/edit`, payload),
    ]);
    expect(r.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    okay(await confirm(d.id));
    expect(
      (
        await cmd(`/api/orders/${d.id}/edit`, { ...payload, version: (await detail(d.id)).version })
      ).json().error.code,
    ).toBe('ORDER_FROZEN');
    await db.client.product.update({
      where: { id: p.id },
      data: { sellingPriceCents: 1500, version: { increment: 1 } },
    });
    expect((await detail(d.id)).items[0]?.unitPriceCents).toBe(1000);
  });
  it('31 anonymization removes collection text while preserving orders/financial history without PII resurrection', async () => {
    const c = await customer();
    const p = await product();
    const marker = 'SYNTHETIC-COLLECTION-PRIVATE';
    const d = await draft(p, 1, {
      customerId: c.id,
      pickupPerson: marker,
      collectionNote: marker,
      notes: marker,
    });
    await ready(d.id);
    okay(await pay(d.id));
    okay(await handover(d.id));
    expect(
      (
        await req('POST', `/api/customers/${c.id}/anonymize`, {
          version: c.version,
          confirmation: c.registration,
          reason: 'DATA_MINIMIZATION',
        })
      ).statusCode,
    ).toBe(200);
    const o = await detail(d.id);
    expect(o).toMatchObject({
      status: 'FULFILLED',
      pickupPerson: null,
      collectionNote: null,
      notes: null,
      customer: { name: 'Cliente anonimizado' },
    });
    expect(
      (await req('GET', `/api/customers/${c.id}/order-history`)).json().fulfilledTotalCents,
    ).toBe('1000');
    expect((await counter(p, 1, { customerId: c.id })).json().error.code).toBe(
      'CUSTOMER_UNAVAILABLE',
    );
    expect(
      JSON.stringify(await db.client.auditEvent.findMany({ where: { targetId: d.id } })),
    ).not.toContain(marker);
    expect(
      JSON.stringify(
        await db.client.inventoryOperation.findMany({ where: { kind: 'ORDER_CREATE' } }),
      ),
    ).not.toContain(marker);
    await expect(
      db.client.order.update({
        where: { id: d.id },
        data: { notes: marker, version: { increment: 1 } },
      }),
    ).rejects.toThrow();
  });
  it('32 orders product deactivation versus confirmation atomically', async () => {
    const p = await product();
    const d = await draft(p);
    const auth = new AuthService(db.client, () => now, secret);
    let release!: () => void;
    let acquired!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const locked = new Promise<void>((r) => (acquired = r));
    const change = db.client.$transaction(
      async (tx) => {
        await securityLock(tx);
        await tx.product.update({
          where: { id: p.id },
          data: { active: false, version: { increment: 1 } },
        });
        acquired();
        await gate;
      },
      { timeout: 10000 },
    );
    await locked;
    const action = confirm(d.id);
    release();
    await change;
    expect((await action).json().error.code).toBe('PRODUCT_UNAVAILABLE');
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 0n });
    void auth;
  });
  it('33 enforces restrictive ownership, financial totals and immutable financial records in SQL', async () => {
    const p = await product();
    const d = await draft(p);
    const other = await draft(p, 2);
    okay(await confirm(d.id));
    const item = (await detail(other.id)).items[0]!;
    await expect(
      db.client.inventoryReservation.create({
        data: {
          productId: p.id,
          quantity: 1,
          sourceNamespace: 'ORDER',
          sourceReference: item.id,
          orderItemId: item.id,
          eligibilityThrough: new Date('2099-01-01'),
          actorId: (
            await db.client.user.findUniqueOrThrow({ where: { loginIdentifier: 'sales-owner' } })
          ).id,
          createdAt: now,
        },
        select: { id: true },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const session = await db.client.cashSession.findFirstOrThrow({ where: { closedAt: null } });
    const owner = await db.client.user.findUniqueOrThrow({
      where: { loginIdentifier: 'sales-owner' },
    });
    await expect(
      db.client.$transaction(async (tx) => {
        const op = await tx.inventoryOperation.create({
          data: {
            actorId: owner.id,
            key: randomUUID(),
            kind: 'ORDER_PAY',
            requestDigest: 'a'.repeat(64),
            createdAt: now,
          },
          select: { id: true },
        });
        await tx.payment.create({
          data: {
            orderId: d.id,
            amountCents: 1n,
            method: 'PIX',
            manuallyConfirmed: true,
            actorId: owner.id,
            recordedAt: now,
            cashSessionId: session.id,
            operationId: op.id,
          },
          select: { id: true },
        });
        await tx.inventoryOperation.update({
          where: { id: op.id },
          data: { result: { operationId: op.id, targetId: d.id }, completedAt: now },
          select: { id: true },
        });
      }),
    ).rejects.toThrow();
    expect((await detail(d.id)).paymentState).toBe('UNPAID');
    okay(await pay(d.id));
    const o = await detail(d.id);
    await expect(
      db.client.payment.update({ where: { id: o.payment!.id }, data: { amountCents: 1n } }),
    ).rejects.toThrow();
    await expect(db.client.order.delete({ where: { id: d.id } })).rejects.toThrow();
    await expect(db.client.orderItem.delete({ where: { id: o.items[0]!.id } })).rejects.toThrow();
    const fulfilled = okay(await counter(p, 1, {}, 'PIX')).targetId;
    const original = (await detail(fulfilled)).payment!;
    await expect(
      db.client.$transaction(async (tx) => {
        const op = await tx.inventoryOperation.create({
          data: {
            actorId: owner.id,
            key: randomUUID(),
            kind: 'ORDER_REFUND',
            requestDigest: 'a'.repeat(64),
            createdAt: now,
          },
          select: { id: true },
        });
        await tx.refund.create({
          data: {
            orderId: fulfilled,
            paymentId: original.id,
            amountCents: BigInt(original.amountCents),
            method: 'CASH',
            reason: 'QUALITY_ISSUE',
            externalRefundConfirmed: true,
            actorId: owner.id,
            recordedAt: now,
            cashSessionId: session.id,
            operationId: op.id,
          },
          select: { id: true },
        });
        await tx.inventoryOperation.update({
          where: { id: op.id },
          data: { result: { operationId: op.id, targetId: fulfilled }, completedAt: now },
          select: { id: true },
        });
      }),
    ).rejects.toThrow();
    expect((await detail(fulfilled)).paymentState).toBe('PAID');
  });
  it('34-35 upgrades the four-migration baseline preserving real INTERNAL reservation ownership, ledger and all registry/identity markers', async () => {
    const legacy = await freshDatabase('inventory');
    try {
      const before = legacy.inventoryLegacy!;
      const r = await legacy.client.inventoryReservation.findUniqueOrThrow({
        where: { id: before.reservationId },
      });
      expect(r).toMatchObject({
        sourceNamespace: 'INTERNAL',
        orderItemId: null,
        quantity: 2,
        status: 'ACTIVE',
      });
      expect(
        await legacy.client.batch.findUniqueOrThrow({ where: { id: before.batchId } }),
      ).toMatchObject({ physical: 4n, reserved: 2n });
      expect(
        (
          await legacy.client.inventoryMovement.findUniqueOrThrow({
            where: { id: before.movementId },
          })
        ).reservationId,
      ).toBeNull();
      expect(await legacy.client.order.count()).toBe(0);
      expect(await legacy.client.cashSession.count()).toBe(0);
      expect(
        (await legacy.client.user.findUniqueOrThrow({ where: { id: legacy.legacy!.userId } }))
          .passwordHash,
      ).toBe(legacy.legacy!.passwordHash);
      expect(
        (await legacy.client.installationState.findUniqueOrThrow({ where: { id: 1 } }))
          .initializedAt,
      ).toEqual(legacy.legacy!.initializedAt);
      expect(
        (
          await legacy.client.customer.findUniqueOrThrow({
            where: { id: legacy.registryLegacy!.customerId },
          })
        ).marketingState,
      ).toBe('OPTED_OUT');
    } finally {
      await legacy.connection.close();
    }
  }, 60000);
  it('36 validates Fortaleza pickup minutes, rejects past/invalid scheduling, and filters by local day', async () => {
    const p = await product();
    const c = await customer();
    for (const pickupLocal of ['2026-10-17T14:59', '2026-02-30T12:00'])
      expect(
        (
          await cmd('/api/orders', {
            source: 'WHATSAPP',
            customerId: c.id,
            pickupLocal,
            lines: [line(p)],
          })
        ).statusCode,
      ).toBe(400);
    const d = await draft(p, 1, { pickupLocal: '2026-10-17T23:59' });
    expect((await detail(d.id)).pickupAt).toBe('2026-10-18T02:59:00.000Z');
    expect(
      (await req('GET', '/api/orders?pickupFrom=2026-10-17&pickupTo=2026-10-17'))
        .json()
        .items.some((o: { id: string }) => o.id === d.id),
    ).toBe(true);
  });
  it('37 rejects idempotency payload reuse and preserves the original result', async () => {
    const p = await product();
    const key = randomUUID();
    const r = okay(await counter(p, 1, {}, 'PIX', key));
    expect((await counter(p, 2, {}, 'PIX', key)).json().error.code).toBe('IDEMPOTENCY_MISMATCH');
    expect((await req('GET', `/api/sales/operations/${key}`)).json().result.targetId).toBe(
      r.targetId,
    );
  });
  it('38 resolves an uncertain result through actor-scoped permission-checked lookup', async () => {
    const p = await product();
    const key = randomUUID();
    const r = okay(await counter(p, 1, {}, 'PIX', key));
    expect((await req('GET', `/api/sales/operations/${key}`)).json()).toMatchObject({
      found: true,
      result: { targetId: r.targetId },
    });
    expect(
      (await req('GET', `/api/sales/operations/${key}`, undefined, cashier.cookie)).json().found,
    ).toBe(false);
    expect(
      (await req('GET', `/api/sales/operations/${key}`, undefined, production.cookie)).statusCode,
    ).toBe(403);
  });
  it('39 refuses zero-total completion without a fictitious payment', async () => {
    const p = await product(5, 0);
    const r = await counter(p);
    expect(r.json().error.code).toBe('ZERO_TOTAL_UNSUPPORTED');
    expect(await db.client.orderItem.count({ where: { productId: p.id } })).toBe(0);
    const d = await draft(p);
    expect((await confirm(d.id)).json().error.code).toBe('ZERO_TOTAL_UNSUPPORTED');
    expect(await db.client.payment.count({ where: { orderId: d.id } })).toBe(0);
  });
  it('40 reconciles inventory after sale/cancellation/refund and uses the current session for an older refund', async () => {
    const p = await product(10);
    const id = okay(await counter(p, 2, {}, 'PIX')).targetId;
    const original = (await detail(id)).payment!.cashSessionId;
    await closeCashFixture();
    await cash();
    okay(await refund(id));
    expect((await detail(id)).refund!.cashSessionId).not.toBe(original);
    const d = await draft(p, 2);
    okay(await confirm(d.id));
    okay(await cancel(d.id));
    expect(await balances(p.id)).toEqual({ physical: 8n, reserved: 0n });
    const r = await req('GET', `/api/inventory/products/${p.id}/reconciliation`);
    expect(r.json()).toMatchObject({ consistent: true, findings: [] });
  });
  it('41 allocates authorized discounts exactly and rejects an incorrect full-payment amount before committing', async () => {
    const p = await product();
    const q = await product(5, 500);
    const input = {
      draft: {
        source: 'COUNTER',
        lines: [line(p, 2), line(q)],
        discountCents: '101',
        discountReason: 'PROMOTION',
      },
      payment: { amountCents: '2398', method: 'PIX', manuallyConfirmed: true },
    };
    expect(
      (await cmd('/api/sales/checkout', input, randomUUID(), manager.cookie)).json().error.code,
    ).toBe('PAYMENT_AMOUNT');
    expect(await balances(p.id)).toEqual({ physical: 5n, reserved: 0n });
    const id = okay(
      await cmd(
        '/api/sales/checkout',
        { ...input, payment: { ...input.payment, amountCents: '2399' } },
        randomUUID(),
        manager.cookie,
      ),
    ).targetId;
    const order = await detail(id);
    expect(order).toMatchObject({
      subtotalCents: '2500',
      discountCents: '101',
      totalCents: '2399',
      payment: { amountCents: '2399' },
    });
    expect(order.items.reduce((n, i) => n + BigInt(i.discountCents), 0n)).toBe(101n);
    expect(order.items.every((i) => BigInt(i.totalCents) >= 0n)).toBe(true);
  });
});
