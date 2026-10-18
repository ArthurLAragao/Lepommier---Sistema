import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { cashDetailDto, pickupLocalOf } from '@pommier/shared';
import { buildApp } from '../src/app.js';
import { securityLock } from '../src/auth/service.js';
import { freshDatabase } from './database.js';
import { seedPhase5Cash } from './cash-upgrade.js';
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
let sid = '';
let categoryId = '';
let serial = 0;
let manager: { id: string; cookie: string };
let cashier: { id: string; cookie: string };
let production: { id: string; cookie: string };
type Reply = Awaited<ReturnType<FastifyInstance['inject']>>;
const req = async (
  method: NonNullable<InjectOptions['method']>,
  url: string,
  payload?: Record<string, unknown>,
  session = cookie,
) =>
  app.inject({
    method,
    url,
    ...(payload !== undefined ? { payload } : {}),
    headers: { ...headers, ...(session ? { cookie: session } : {}) },
  });
const cmd = (path: string, payload: unknown, key = randomUUID(), session = cookie) =>
  req('POST', `/api${path}`, { key, payload }, session);
function ok(r: Reply) {
  expect(r.statusCode, r.statusCode === 200 ? '' : r.body).toBe(200);
  return r.json() as { targetId: string; operationId: string };
}
async function detail(id = sid) {
  const r = await req('GET', `/api/cash/sessions/${id}`);
  expect(r.statusCode).toBe(200);
  return cashDetailDto.parse(r.json());
}
async function open(float = '10000') {
  return ok(await cmd('/cash-sessions', { openingFloatCents: float })).targetId;
}
async function close(id = sid, extra: Record<string, unknown> = {}, key = randomUUID()) {
  const d = await detail(id);
  return cmd(
    '/cash/close',
    {
      sessionId: id,
      activityVersion: d.session.activityVersion,
      countedCents: d.totals.expectedCents,
      confirmed: true,
      ...extra,
    },
    key,
  );
}
const move = (
  kind = 'CASH_ADDITION',
  amountCents = '500',
  extra: Record<string, unknown> = {},
  key = randomUUID(),
  session = cookie,
) =>
  cmd(
    '/cash/movements',
    {
      sessionId: sid,
      kind,
      amountCents,
      reason: 'Synthetic physical drawer movement',
      ...(kind === 'CASH_EXPENSE' ? { category: 'SUPPLIES' } : {}),
      ...extra,
    },
    key,
    session,
  );
async function account(role: 'MANAGER' | 'CASHIER' | 'PRODUCTION') {
  const a = await req('POST', '/api/users', {
    loginIdentifier: `cash-${role.toLowerCase()}`,
    displayName: `Synthetic ${role} cash employee`,
    role,
    password,
  });
  expect(a.statusCode).toBe(201);
  const login = await req(
    'POST',
    '/api/auth/login',
    { loginIdentifier: `cash-${role.toLowerCase()}`, password },
    '',
  );
  expect(login.statusCode).toBe(200);
  return {
    id: a.json().user.id as string,
    cookie: String(login.headers['set-cookie']).split(';')[0]!,
  };
}
async function product(stock = 10) {
  const n = ++serial;
  const r = await req('POST', '/api/products', {
    code: `C6-${n}`,
    name: `Synthetic cash product ${n}`,
    categoryId,
    origin: 'BOTH',
    sellingPriceCents: 1250,
    estimatedCostCents: 333,
  });
  expect(r.statusCode).toBe(201);
  const p = r.json().product as { id: string; version: number };
  if (stock)
    ok(
      await cmd('/inventory/opening', {
        productId: p.id,
        quantity: stock,
        reason: 'INITIAL_COUNT',
        batch: { reference: `C6-SYN-${n}`, expiresAt: '2099-01-01' },
      }),
    );
  return p;
}
const line = (p: { id: string; version: number }) => ({
  productId: p.id,
  productVersion: p.version,
  quantity: 1,
  unitPriceCents: 1250,
});
async function sale(
  method: 'CASH' | 'PIX' | 'DEBIT_CARD' | 'CREDIT_CARD' = 'CASH',
  p?: Awaited<ReturnType<typeof product>>,
) {
  p ??= await product();
  return ok(
    await cmd('/sales/checkout', {
      draft: { source: 'COUNTER', lines: [line(p)] },
      payment: {
        method,
        amountCents: '1250',
        manuallyConfirmed: true,
        ...(method === 'CASH' ? { tenderedCents: '2000' } : {}),
      },
    }),
  ).targetId;
}
async function orderDetail(id: string) {
  const r = await req('GET', `/api/orders/${id}`);
  expect(r.statusCode).toBe(200);
  return r.json().order as {
    id: string;
    version: number;
    payment: { id: string; cashSessionId: string } | null;
    refund: { cashSessionId: string } | null;
    status: string;
  };
}
async function unpaid() {
  const p = await product();
  const id = ok(await cmd('/orders', { source: 'COUNTER', lines: [line(p)] })).targetId;
  ok(
    await cmd(`/orders/${id}/confirm`, {
      version: (await orderDetail(id)).version,
      expectedTotalCents: '1250',
    }),
  );
  return { id, p };
}
async function refund(id: string) {
  return cmd(`/orders/${id}/refund`, {
    version: (await orderDetail(id)).version,
    reason: 'CUSTOMER_REQUEST',
    externalRefundConfirmed: true,
  });
}
beforeAll(async () => {
  db = await freshDatabase();
  app = await buildApp({
    origin: headers.origin,
    database: db.connection,
    clock: () => now,
    installationSecret: secret,
    logger: false,
  });
  await app.ready();
  expect(
    (
      await req(
        'POST',
        '/api/auth/setup',
        {
          loginIdentifier: 'cash-owner',
          displayName: 'Synthetic cash owner',
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
    { loginIdentifier: 'cash-owner', password },
    '',
  );
  expect(login.statusCode).toBe(200);
  cookie = String(login.headers['set-cookie']).split(';')[0]!;
  manager = await account('MANAGER');
  cashier = await account('CASHIER');
  production = await account('PRODUCTION');
  const c = await req('POST', '/api/categories', { name: 'Synthetic cash category' });
  expect(c.statusCode).toBe(201);
  categoryId = c.json().category.id;
}, 30000);
beforeEach(async (ctx) => {
  now = new Date(BASE);
  const current = await db.client.cashSession.findFirst({
    where: { closedAt: null },
    select: { id: true },
  });
  if (current) ok(await close(current.id));
  if (!/^0[23]\./.test(ctx.task.name)) sid = await open();
});
afterAll(async () => {
  await app?.close();
  await db?.connection.close();
});
describe('Phase 6 real PostgreSQL cash gate', () => {
  it('01. preserves Phase 5 open/legacy closed sessions, methods, refund, orders and ownership on upgrade', async () => {
    let before: Awaited<ReturnType<typeof seedPhase5Cash>> | undefined;
    const legacy = await freshDatabase('orders', async (client) => {
      before = await seedPhase5Cash(client);
    });
    try {
      expect(before).toBeDefined();
      const c = await legacy.client.cashSession.findUniqueOrThrow({
        where: { id: before!.currentSessionId },
      });
      expect(c.openingFloatCents).toBe(10000n);
      expect(c.closedAt).toBeNull();
      expect(c.activityVersion).toBe(4);
      const old = await legacy.client.cashSession.findUniqueOrThrow({
        where: { id: before!.oldSessionId },
        include: { closing: true },
      });
      expect(old.legacyClosed).toBe(true);
      expect(old.closing).toBeNull();
      expect(await legacy.client.payment.count()).toBe(4);
      expect(await legacy.client.refund.count()).toBe(1);
      expect(await legacy.client.order.count({ where: { status: 'FULFILLED' } })).toBe(2);
      expect(await legacy.client.order.count({ where: { status: 'CONFIRMED' } })).toBe(2);
      const [totals] = await legacy.client.$queryRaw<
        Array<{ t: { expectedCents: string } }>
      >`SELECT cash_session_totals(${c.id}::uuid) AS t`;
      expect(totals!.t.expectedCents).toBe(String(10000 - before!.unitPrice));
      expect(
        await legacy.client.inventoryReservation.count({ where: { sourceNamespace: 'INTERNAL' } }),
      ).toBe(1);
      expect(
        (await legacy.client.user.findUniqueOrThrow({ where: { id: legacy.legacy!.userId } }))
          .passwordHash,
      ).toBe(legacy.legacy!.passwordHash);
    } finally {
      await legacy.connection.close();
    }
  }, 30000);
  it('02. concurrent opening retains one active session', async () => {
    const r = await Promise.all([
      cmd('/cash-sessions', { openingFloatCents: '10000' }),
      cmd('/cash-sessions', { openingFloatCents: '10000' }),
    ]);
    expect(r.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await db.client.cashSession.count({ where: { closedAt: null } })).toBe(1);
  });
  it('03. opening same-key retry returns one effect', async () => {
    const key = randomUUID();
    const a = ok(await cmd('/cash-sessions', { openingFloatCents: '5000' }, key));
    const b = ok(await cmd('/cash-sessions', { openingFloatCents: '5000' }, key));
    expect(a).toEqual(b);
    expect(await db.client.cashSession.count({ where: { closedAt: null } })).toBe(1);
  });
  it('04. cash sale increases physical expectation by full sale amount', async () => {
    await sale();
    expect((await detail()).totals.expectedCents).toBe('11250');
  });
  it('05. gross tender and change never inflate receipts', async () => {
    const id = await sale();
    const p = await db.client.payment.findUniqueOrThrow({ where: { orderId: id } });
    expect(p.tenderedCents).toBe(2000n);
    expect(p.changeCents).toBe(750n);
    expect((await detail()).totals.methods.CASH.grossCents).toBe('1250');
  });
  it('06. Pix/debit/credit have method summaries without physical cash', async () => {
    for (const method of ['PIX', 'DEBIT_CARD', 'CREDIT_CARD'] as const) await sale(method);
    const d = await detail();
    expect(d.totals.expectedCents).toBe('10000');
    for (const method of ['PIX', 'DEBIT_CARD', 'CREDIT_CARD'] as const)
      expect(d.totals.methods[method].netCents).toBe('1250');
  });
  it('07. full cash refund reduces current-session cash', async () => {
    const id = await sale();
    ok(await refund(id));
    const d = await detail();
    expect(d.totals.expectedCents).toBe('10000');
    expect(d.totals.methods.CASH.refundCents).toBe('1250');
  });
  it('08. older-sale refund belongs to current session and preserves earlier closing', async () => {
    const id = await sale();
    const old = sid;
    ok(await close());
    const before = await db.client.cashClosing.findUniqueOrThrow({ where: { sessionId: old } });
    sid = await open();
    ok(await refund(id));
    expect((await detail()).totals.expectedCents).toBe('8750');
    expect((await orderDetail(id)).refund!.cashSessionId).toBe(sid);
    expect(await db.client.cashClosing.findUnique({ where: { sessionId: old } })).toEqual(before);
    expect((await detail()).totals.methods.CASH.netCents).toBe('-1250');
  });
  it('09. authorized manager addition increases expected cash', async () => {
    ok(await move('CASH_ADDITION', '500', {}, randomUUID(), manager.cookie));
    expect((await detail()).totals.expectedCents).toBe('10500');
  });
  it('10. withdrawal decreases expected cash', async () => {
    ok(await move('CASH_WITHDRAWAL', '500'));
    expect((await detail()).totals.expectedCents).toBe('9500');
  });
  it('11. categorized expense decreases cash without inventory/invoice effect', async () => {
    const count = await db.client.inventoryMovement.count();
    ok(await move('CASH_EXPENSE', '500'));
    expect((await detail()).totals.expectedCents).toBe('9500');
    expect(await db.client.inventoryMovement.count()).toBe(count);
  });
  it('12. zero/negative/fractional/oversized/backdated movements rejected', async () => {
    for (const amount of ['0', '-1', '1.5', '100000000'])
      expect((await move('CASH_ADDITION', amount)).statusCode).toBe(400);
    expect((await move('CASH_ADDITION', '5', { recordedAt: '2001-01-01' })).statusCode).toBe(400);
    expect((await detail()).movements.total).toBe(0);
  });
  it('13. cash outflows cannot invent money or exceed expected balance', async () => {
    expect((await move('CASH_WITHDRAWAL', '10001')).statusCode).toBe(409);
    expect((await move('CASH_EXPENSE', '10001')).statusCode).toBe(409);
    const id = await sale();
    ok(await close());
    sid = await open('0');
    expect((await refund(id)).statusCode).toBe(409);
    expect((await orderDetail(id)).refund).toBeNull();
    ok(await move('CASH_ADDITION', '1250'));
    ok(await refund(id));
    expect((await detail()).totals.expectedCents).toBe('0');
  });
  it('14. movement concurrency/same-key retry has one source effect and lookup', async () => {
    const key = randomUUID();
    const r = await Promise.all([
      move('CASH_ADDITION', '500', {}, key),
      move('CASH_ADDITION', '500', {}, key),
    ]);
    expect(ok(r[0]!)).toEqual(ok(r[1]!));
    expect((await detail()).movements.total).toBe(1);
    const q = await req('GET', `/api/cash/operations/${key}`);
    expect(q.json().found).toBe(true);
    expect(q.json().result.targetId).toBe(r[0]!.json().targetId);
  });
  it('15. posted movement update/delete are prohibited', async () => {
    const m = ok(await move());
    await expect(
      db.client.cashMovement.update({ where: { id: m.targetId }, data: { amountCents: 501n } }),
    ).rejects.toThrow();
    await expect(db.client.cashMovement.delete({ where: { id: m.targetId } })).rejects.toThrow();
  });
  it('16. counted close records exact difference and immutable snapshot', async () => {
    ok(await move());
    ok(await close(sid, { countedCents: '10450', explanation: 'Synthetic count short by fifty' }));
    const d = await detail();
    expect(d.session.closing).toMatchObject({
      expectedCents: '10500',
      countedCents: '10450',
      differenceCents: '-50',
    });
    expect(d.reconciliation.consistent).toBe(true);
    expect(d.session.reviewStatus).toBe('PENDING_REVIEW');
  });
  it('17. nonzero difference requires explanation', async () => {
    expect((await close(sid, { countedCents: '10001' })).statusCode).toBe(400);
    expect(await db.client.cashClosing.count({ where: { sessionId: sid } })).toBe(0);
  });
  it('18. stale counted confirmation rejects activity after displayed summary', async () => {
    const d = await detail();
    ok(await move());
    const r = await cmd('/cash/close', {
      sessionId: sid,
      activityVersion: d.session.activityVersion,
      countedCents: '10000',
      confirmed: true,
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('CASH_STALE');
    ok(await close());
  });
  it('19. concurrent close creates one immutable closing, same-key retry resolves it', async () => {
    const d = await detail();
    const input = {
      sessionId: sid,
      activityVersion: d.session.activityVersion,
      countedCents: d.totals.expectedCents,
      confirmed: true,
    };
    const key = randomUUID();
    const r = await Promise.all([cmd('/cash/close', input, key), cmd('/cash/close', input)]);
    expect(r.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await db.client.cashClosing.count({ where: { sessionId: sid } })).toBe(1);
    if (r[0]!.statusCode === 200)
      expect(ok(await cmd('/cash/close', input, key))).toEqual(r[0]!.json());
  });
  it('20. payment versus close commits before snapshot or fails cleanly', async () => {
    const o = await unpaid();
    const d = await detail();
    const version = (await orderDetail(o.id)).version;
    const r = await Promise.all([
      cmd(`/orders/${o.id}/payment`, {
        version,
        payment: {
          amountCents: '1250',
          method: 'CASH',
          tenderedCents: '2000',
          manuallyConfirmed: true,
        },
      }),
      cmd('/cash/close', {
        sessionId: sid,
        activityVersion: d.session.activityVersion,
        countedCents: d.totals.expectedCents,
        confirmed: true,
      }),
    ]);
    expect(r.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const after = await detail();
    if (after.session.closedAt)
      expect(after.session.closing!.totals.methods.CASH.grossCents).toBe('0');
    else {
      expect(after.totals.methods.CASH.grossCents).toBe('1250');
      ok(await close());
    }
  });
  it('21. immediate checkout versus closing rolls back order/payment/reservations/stock on loss', async () => {
    const p = await product(1);
    const d = await detail();
    const before = await db.client.order.count();
    const r = await Promise.all([
      cmd('/sales/checkout', {
        draft: { source: 'COUNTER', lines: [line(p)] },
        payment: {
          method: 'CASH',
          amountCents: '1250',
          tenderedCents: '2000',
          manuallyConfirmed: true,
        },
      }),
      cmd('/cash/close', {
        sessionId: sid,
        activityVersion: d.session.activityVersion,
        countedCents: d.totals.expectedCents,
        confirmed: true,
      }),
    ]);
    expect(r.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const sold = r[0]!.statusCode === 200;
    expect(await db.client.order.count()).toBe(before + (sold ? 1 : 0));
    expect(await db.client.inventoryReservation.count({ where: { productId: p.id } })).toBe(
      sold ? 1 : 0,
    );
    const batch = await db.client.batch.findFirstOrThrow({ where: { productId: p.id } });
    expect(batch.physical).toBe(sold ? 0n : 1n);
    expect(batch.reserved).toBe(0n);
    expect(
      (await req('GET', `/api/inventory/products/${p.id}/reconciliation`)).json().consistent,
    ).toBe(true);
  });
  it('22. full refund versus close cannot append to a closed session', async () => {
    const id = await sale();
    const d = await detail();
    const r = await Promise.all([
      refund(id),
      cmd('/cash/close', {
        sessionId: sid,
        activityVersion: d.session.activityVersion,
        countedCents: d.totals.expectedCents,
        confirmed: true,
      }),
    ]);
    expect(r.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const after = await detail();
    expect(after.reconciliation.consistent).toBe(true);
    if (after.session.closedAt) expect(after.totals.methods.CASH.refundCents).toBe('0');
    else expect(after.totals.methods.CASH.refundCents).toBe('1250');
  });
  it('23. movement versus close is included or rejected, never omitted', async () => {
    const d = await detail();
    const r = await Promise.all([
      move(),
      cmd('/cash/close', {
        sessionId: sid,
        activityVersion: d.session.activityVersion,
        countedCents: d.totals.expectedCents,
        confirmed: true,
      }),
    ]);
    expect(r.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const after = await detail();
    expect(after.reconciliation.consistent).toBe(true);
    if (after.session.closedAt) expect(after.totals.additionsCents).toBe('0');
    else expect(after.totals.additionsCents).toBe('500');
  });
  it('24. closed session rejects late movements and financial direct writes', async () => {
    const o = await unpaid();
    ok(await close());
    expect((await move()).statusCode).toBe(409);
    await expect(
      db.client.$transaction(async (tx) => {
        const op = await tx.inventoryOperation.create({
          data: {
            actorId: (await tx.order.findUniqueOrThrow({ where: { id: o.id } })).creatorId,
            key: randomUUID(),
            kind: 'ORDER_PAY',
            requestDigest: 'a'.repeat(64),
            createdAt: now,
          },
        });
        await tx.payment.create({
          data: {
            orderId: o.id,
            amountCents: 1250n,
            method: 'PIX',
            manuallyConfirmed: true,
            actorId: op.actorId,
            recordedAt: now,
            cashSessionId: sid,
            operationId: op.id,
          },
        });
      }),
    ).rejects.toThrow();
    expect((await orderDetail(o.id)).payment).toBeNull();
  });
  it('25. explicit next session opens after closure', async () => {
    const old = sid;
    ok(await close());
    sid = await open('15000');
    expect(sid).not.toBe(old);
    expect((await detail()).totals.expectedCents).toBe('15000');
    expect(await db.client.cashSession.count({ where: { closedAt: null } })).toBe(1);
  });
  it('26. session spans Fortaleza midnight and unpaid future pickup can close', async () => {
    const c = await req('POST', '/api/customers', {
      name: `Synthetic overnight customer ${++serial}`,
    });
    expect(c.statusCode).toBe(201);
    const p = await product();
    const id = ok(
      await cmd('/orders', {
        source: 'WHATSAPP',
        customerId: c.json().customer.id,
        pickupLocal: pickupLocalOf(new Date(BASE.getTime() + 3 * 86400000)),
        lines: [line(p)],
      }),
    ).targetId;
    ok(
      await cmd(`/orders/${id}/confirm`, {
        version: (await orderDetail(id)).version,
        expectedTotalCents: '1250',
      }),
    );
    now = new Date('2026-10-18T03:00:00Z');
    expect((await detail()).session.closedAt).toBeNull();
    ok(await close());
    expect((await orderDetail(id)).payment).toBeNull();
    expect((await orderDetail(id)).status).toBe('CONFIRMED');
  });
  it('27. owner review appends decisions and preserves original figures', async () => {
    ok(await close(sid, { countedCents: '9990', explanation: 'Synthetic shortage for review' }));
    const before = await db.client.cashClosing.findUniqueOrThrow({ where: { sessionId: sid } });
    ok(
      await cmd('/cash/review', {
        sessionId: sid,
        reviewVersion: 0,
        decision: 'NEEDS_ATTENTION',
        note: 'Synthetic check requested',
      }),
    );
    ok(
      await cmd('/cash/review', {
        sessionId: sid,
        reviewVersion: 1,
        decision: 'APPROVED',
        note: 'Synthetic explanation reviewed',
      }),
    );
    const d = await detail();
    expect(d.session.reviewStatus).toBe('APPROVED');
    expect(d.reviews.total).toBe(2);
    expect(await db.client.cashClosing.findUnique({ where: { sessionId: sid } })).toEqual(before);
    expect(
      (
        await cmd('/cash/review', {
          sessionId: sid,
          reviewVersion: 0,
          decision: 'APPROVED',
          note: 'Stale synthetic review',
        })
      ).statusCode,
    ).toBe(409);
  });
  it('28. linked reversal preserves old session, posts once in current cash and cannot reverse a payment', async () => {
    const movement = ok(await move('CASH_EXPENSE', '500'));
    const old = sid;
    ok(await close());
    const before = await db.client.cashClosing.findUniqueOrThrow({ where: { sessionId: old } });
    sid = await open();
    const payload = {
      sessionId: sid,
      movementId: movement.targetId,
      reason: 'Synthetic physical outflow returned',
      physicalMovementConfirmed: true,
    };
    const key = randomUUID();
    const r = await Promise.all([
      cmd('/cash/reverse', payload, key),
      cmd('/cash/reverse', payload, key),
    ]);
    expect(ok(r[0]!)).toEqual(ok(r[1]!));
    expect((await detail()).totals.correctionsCents).toBe('500');
    expect(await db.client.cashClosing.findUnique({ where: { sessionId: old } })).toEqual(before);
    expect((await cmd('/cash/reverse', payload)).statusCode).toBe(409);
    const id = await sale();
    const p = (await orderDetail(id)).payment!;
    expect((await cmd('/cash/reverse', { ...payload, movementId: p.id })).statusCode).toBe(409);
  });
  it('29. cashier/production/manager restrictions are enforced independently of UI', async () => {
    for (const a of [cashier, production]) {
      expect((await req('GET', '/api/cash/sessions', undefined, a.cookie)).statusCode).toBe(403);
      expect((await req('GET', `/api/cash/sessions/${sid}`, undefined, a.cookie)).statusCode).toBe(
        403,
      );
      expect((await move('CASH_ADDITION', '500', {}, randomUUID(), a.cookie)).statusCode).toBe(403);
      expect(
        (
          await cmd(
            '/cash/close',
            { sessionId: sid, activityVersion: 1, countedCents: '10000', confirmed: true },
            randomUUID(),
            a.cookie,
          )
        ).statusCode,
      ).toBe(403);
    }
    expect((await req('GET', '/api/cash/current', undefined, production.cookie)).statusCode).toBe(
      403,
    );
    expect(
      (
        await cmd(
          '/cash/review',
          {
            sessionId: sid,
            reviewVersion: 0,
            decision: 'APPROVED',
            note: 'Unauthorized synthetic approval',
          },
          randomUUID(),
          manager.cookie,
        )
      ).statusCode,
    ).toBe(403);
  });
  it('30. revocation committed under security lock prevents a queued cash write', async () => {
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((r) => (locked = r));
    const gate = new Promise<void>((r) => (release = r));
    const change = db.client.$transaction(async (tx) => {
      await securityLock(tx);
      await tx.user.update({
        where: { id: manager.id },
        data: { active: false, version: { increment: 1 } },
      });
      await tx.session.updateMany({
        where: { userId: manager.id, revokedAt: null },
        data: { revokedAt: now },
      });
      locked();
      await gate;
    });
    await ready;
    const pending = move('CASH_ADDITION', '500', {}, randomUUID(), manager.cookie);
    release();
    await change;
    expect((await pending).statusCode).toBe(401);
    expect((await detail()).movements.total).toBe(0);
    const u = await db.client.user.findUniqueOrThrow({ where: { id: manager.id } });
    expect(
      (
        await req('PATCH', `/api/users/${manager.id}`, {
          version: u.version,
          active: true,
          displayName: u.displayName,
          role: u.role,
          reason: 'Restore isolated synthetic manager',
        })
      ).statusCode,
    ).toBe(200);
    const login = await req(
      'POST',
      '/api/auth/login',
      { loginIdentifier: 'cash-manager', password },
      '',
    );
    expect(login.statusCode).toBe(200);
    manager.cookie = String(login.headers['set-cookie']).split(';')[0]!;
  });
  it('31. all new mutation paths retain exact Origin/Host/CSRF guards', async () => {
    for (const path of ['/cash/movements', '/cash/close', '/cash/review', '/cash/reverse']) {
      for (const bad of [
        { 'x-pommier-csrf': undefined },
        { origin: undefined },
        { origin: 'http://localhost:3333' },
        { host: 'foreign.invalid' },
      ]) {
        const h = Object.fromEntries(
          Object.entries({ ...headers, cookie, ...bad }).filter(([, v]) => v !== undefined),
        );
        const r = await app.inject({ method: 'POST', url: `/api${path}`, headers: h, payload: {} });
        expect(r.statusCode).toBe(403);
      }
    }
  });
  it('32. idempotency mismatch rejected and actor lookup never leaks another result', async () => {
    const key = randomUUID();
    ok(await move('CASH_ADDITION', '500', {}, key));
    expect((await move('CASH_ADDITION', '501', {}, key)).statusCode).toBe(409);
    const r = await req('GET', `/api/cash/operations/${key}`, undefined, manager.cookie);
    expect(r.statusCode).toBe(200);
    expect(r.json().found).toBe(false);
  });
  it('33. read-only reconciliation detects isolated drift and approval cannot mask it', async () => {
    ok(await close());
    const original = await db.client.cashClosing.findUniqueOrThrow({ where: { sessionId: sid } });
    await db.client.$executeRawUnsafe(
      'ALTER TABLE "CashClosing" DISABLE TRIGGER "CashClosing_append_only"',
    );
    try {
      await db.client.cashClosing.update({
        where: { sessionId: sid },
        data: {
          expectedCents: original.expectedCents + 1n,
          differenceCents: original.differenceCents - 1n,
          explanation: 'Isolated synthetic integrity drift',
        },
      });
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "CashClosing" ENABLE TRIGGER "CashClosing_append_only"',
      );
      const r = await req('GET', `/api/cash/sessions/${sid}/reconciliation`);
      expect(r.json().findings).toContain('CLOSING_DRIFT');
      expect(r.json().consistent).toBe(false);
      expect(
        (
          await cmd('/cash/review', {
            sessionId: sid,
            reviewVersion: 0,
            decision: 'APPROVED',
            note: 'Explanation cannot repair integrity',
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (await db.client.cashClosing.findUniqueOrThrow({ where: { sessionId: sid } }))
          .expectedCents,
      ).toBe(original.expectedCents + 1n);
    } finally {
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "CashClosing" DISABLE TRIGGER "CashClosing_append_only"',
      );
      await db.client.cashClosing.update({
        where: { sessionId: sid },
        data: {
          expectedCents: original.expectedCents,
          differenceCents: original.differenceCents,
          explanation: original.explanation,
        },
      });
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "CashClosing" ENABLE TRIGGER "CashClosing_append_only"',
      );
    }
  });
  it('34. SQL protects opening/closing/review and no reopening/deletion is allowed', async () => {
    const owner = await db.client.cashSession.findUniqueOrThrow({
      where: { id: sid },
      select: { openedById: true },
    });
    await expect(
      db.client.$transaction(async (tx) => {
        const op = await tx.inventoryOperation.create({
          data: {
            actorId: owner.openedById,
            key: randomUUID(),
            kind: 'CASH_OPEN',
            requestDigest: 'a'.repeat(64),
            createdAt: now,
          },
        });
        const id = randomUUID();
        await tx.cashSession.create({
          data: {
            id,
            openedAt: now,
            openedById: owner.openedById,
            openingFloatCents: 0n,
            closedAt: now,
            legacyClosed: true,
            operationId: op.id,
          },
          select: { id: true },
        });
        await tx.inventoryOperation.update({
          where: { id: op.id },
          data: { completedAt: now, result: { operationId: op.id, targetId: id } },
        });
      }),
    ).rejects.toThrow();
    await expect(
      db.client.cashSession.update({ where: { id: sid }, data: { openingFloatCents: 1n } }),
    ).rejects.toThrow();
    ok(await close());
    await expect(
      db.client.cashClosing.update({ where: { sessionId: sid }, data: { countedCents: 0n } }),
    ).rejects.toThrow();
    await expect(db.client.cashClosing.delete({ where: { sessionId: sid } })).rejects.toThrow();
    await expect(
      db.client.cashSession.update({ where: { id: sid }, data: { closedAt: null } }),
    ).rejects.toThrow();
    ok(
      await cmd('/cash/review', {
        sessionId: sid,
        reviewVersion: 0,
        decision: 'APPROVED',
        note: 'Synthetic immutable review',
      }),
    );
    const review = await db.client.cashReview.findFirstOrThrow({ where: { sessionId: sid } });
    await expect(db.client.cashReview.delete({ where: { id: review.id } })).rejects.toThrow();
    await expect(
      db.client.cashReview.update({
        where: { id: review.id },
        data: { note: 'Changed synthetic note' },
      }),
    ).rejects.toThrow();
  });
  it('35. cashier current projection omits drawer values and cash sources omit customer/cost/secrets', async () => {
    await sale();
    const r = await req('GET', '/api/cash/current', undefined, cashier.cookie);
    expect(r.statusCode).toBe(200);
    expect(Object.keys(r.json().session).sort()).toEqual(['id', 'openedAt', 'openedBy']);
    const d = await detail();
    const text = JSON.stringify(d);
    for (const field of [
      'estimatedCost',
      'customer',
      'cpf',
      'passwordHash',
      'tokenDigest',
      'requestDigest',
      'tenderedCents',
    ])
      expect(text).not.toContain(field);
    expect((await req('GET', '/api/cash/sessions?q=%27%20OR%201%3D1--')).statusCode).toBe(200);
  });
  it('36. final financial and inventory sources reconcile after race/correction history', async () => {
    const p = await product(3);
    await sale('CASH', p);
    ok(await move());
    ok(await close());
    const sessions = await db.client.cashSession.findMany({
      where: { legacyClosed: false },
      select: { id: true },
    });
    for (const s of sessions) {
      const d = await detail(s.id);
      expect(d.reconciliation.consistent).toBe(true);
    }
    expect(
      (await req('GET', `/api/inventory/products/${p.id}/reconciliation`)).json().consistent,
    ).toBe(true);
    expect(await db.client.inventoryOperation.count({ where: { completedAt: null } })).toBe(0);
  });
  it('37. final audit failure rolls back closing snapshot, session state and operation result', async () => {
    const key = randomUUID();
    await db.client.$executeRawUnsafe(
      `CREATE FUNCTION cash_test_fail_close() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='CASH_CLOSED' THEN RAISE EXCEPTION 'Synthetic final closing audit failure'; END IF; RETURN NEW; END $$`,
    );
    await db.client.$executeRawUnsafe(
      'CREATE TRIGGER cash_test_fail_close BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION cash_test_fail_close()',
    );
    try {
      expect((await close(sid, {}, key)).statusCode).toBe(500);
      expect((await detail()).session.closedAt).toBeNull();
      expect(await db.client.cashClosing.count({ where: { sessionId: sid } })).toBe(0);
      expect(await db.client.inventoryOperation.count({ where: { key } })).toBe(0);
    } finally {
      await db.client.$executeRawUnsafe('DROP TRIGGER cash_test_fail_close ON "AuditEvent"');
      await db.client.$executeRawUnsafe('DROP FUNCTION cash_test_fail_close()');
    }
    ok(await close(sid, {}, key));
  });
  it('38. financial-source corruption and negative legacy expectation block posting without repair', async () => {
    const id = await sale();
    const original = await db.client.payment.findUniqueOrThrow({ where: { orderId: id } });
    await db.client.$executeRawUnsafe(
      'ALTER TABLE "Payment" DISABLE TRIGGER "Payment_append_only"',
    );
    try {
      await db.client.payment.update({
        where: { id: original.id },
        data: { amountCents: 1251n, changeCents: 749n },
      });
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "Payment" ENABLE TRIGGER "Payment_append_only"',
      );
      const d = await detail();
      expect(d.reconciliation.findings).toContain('FINANCIAL_SOURCE_MISMATCH');
      expect(d.reconciliation.consistent).toBe(false);
      expect((await close()).statusCode).toBe(409);
      const p = await product();
      const count = await db.client.order.count();
      const r = await cmd('/sales/checkout', {
        draft: { source: 'COUNTER', lines: [line(p)] },
        payment: { amountCents: '1250', method: 'PIX', manuallyConfirmed: true },
      });
      expect(r.statusCode).toBe(409);
      expect(await db.client.order.count()).toBe(count);
      expect(
        (await db.client.payment.findUniqueOrThrow({ where: { id: original.id } })).amountCents,
      ).toBe(1251n);
    } finally {
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "Payment" DISABLE TRIGGER "Payment_append_only"',
      );
      await db.client.payment.update({
        where: { id: original.id },
        data: { amountCents: original.amountCents, changeCents: original.changeCents },
      });
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "Payment" ENABLE TRIGGER "Payment_append_only"',
      );
    }
    ok(await move('CASH_WITHDRAWAL', '11000'));
    // Test-only source corruption models a preserved negative legacy drawer; it is
    // not an application maintenance endpoint or an allowed employee correction.
    await db.client.$executeRawUnsafe(
      'ALTER TABLE "Payment" DISABLE TRIGGER "Payment_append_only"',
    );
    try {
      await db.client.payment.update({
        where: { id: original.id },
        data: { method: 'PIX', tenderedCents: null, changeCents: null },
      });
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "Payment" ENABLE TRIGGER "Payment_append_only"',
      );
      expect((await detail()).reconciliation.findings).toContain('NEGATIVE_EXPECTED_LEGACY');
      const p = await product();
      const r = await cmd('/sales/checkout', {
        draft: { source: 'COUNTER', lines: [line(p)] },
        payment: {
          amountCents: '1250',
          method: 'CASH',
          tenderedCents: '1250',
          manuallyConfirmed: true,
        },
      });
      expect(r.statusCode).toBe(409);
      expect(r.json().error.code).toBe('CASH_INTEGRITY');
      expect((await detail()).totals.expectedCents).toBe('-1000');
    } finally {
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "Payment" DISABLE TRIGGER "Payment_append_only"',
      );
      await db.client.payment.update({
        where: { id: original.id },
        data: {
          method: original.method,
          tenderedCents: original.tenderedCents,
          changeCents: original.changeCents,
        },
      });
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "Payment" ENABLE TRIGGER "Payment_append_only"',
      );
    }
  });
});
