import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  reportResult,
  dashboardResult,
  reportQuery,
  reportDefinitions,
  type ReportKind,
  draftInput,
  checkoutInput,
} from '@pommier/shared';
import { buildApp } from '../src/app.js';
import { AuthService, securityLock, type Principal } from '../src/auth/service.js';
import { SalesService } from '../src/sales/service.js';
import { ReportingService } from '../src/reports/service.js';
import { freshDatabase } from './database.js';
import { seedReportScenario } from './report-scenario.js';
let db: Awaited<ReturnType<typeof freshDatabase>>,
  app: FastifyInstance,
  scenario: Awaited<ReturnType<typeof seedReportScenario>>,
  principal: Principal;
const timeline = { now: new Date('2026-10-13T18:00:00Z') };
const password = randomBytes(24).toString('base64url'),
  secret = randomBytes(32).toString('base64url');
let cookie = '';
const roles: Record<string, { cookie: string; id: string }> = {};
const headers = { host: '127.0.0.1:3333', origin: 'http://127.0.0.1:3333', 'x-pommier-csrf': '1' };
const req = async (
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: Record<string, unknown>,
  session = cookie,
) =>
  app.inject({
    method,
    url,
    headers: { ...headers, ...(session ? { cookie: session } : {}) },
    ...(payload !== undefined ? { payload } : {}),
  });
const query = (from = '2026-10-14', to = '2026-10-15', extra: Record<string, string> = {}) =>
  new URLSearchParams({ from, to, ...extra }).toString();
async function report(
  kind: string,
  extra: Record<string, string> = {},
  session = cookie,
  from = '2026-10-14',
  to = '2026-10-15',
) {
  const r = await req('GET', `/api/reports/${kind}?${query(from, to, extra)}`, undefined, session);
  if (r.statusCode === 503) {
    const service = new ReportingService(
      new AuthService(db.client, () => timeline.now, undefined),
      () => timeline.now,
    );
    await service.auth.withReadSnapshot(
      principal,
      reportDefinitions[kind as ReportKind].permission,
      (tx, a) =>
        service.tableTx(
          tx,
          a.role,
          kind as ReportKind,
          reportQuery.parse({ from, to, ...extra }),
          timeline.now,
        ),
    );
  }
  expect(r.statusCode, r.body).toBe(200);
  return reportResult.parse(r.json());
}
async function dashboard(extra: Record<string, string> = {}) {
  const r = await req('GET', '/api/reports/dashboard?' + new URLSearchParams(extra));
  expect(r.statusCode, r.body).toBe(200);
  return dashboardResult.parse(r.json());
}
const sales = () =>
  new SalesService(new AuthService(db.client, () => timeline.now, undefined), () => timeline.now);
const line = () => ({
  productId: scenario.b.id,
  productVersion: scenario.b.version,
  quantity: 1,
  unitPriceCents: 2000,
});
beforeAll(async () => {
  db = await freshDatabase();
  app = await buildApp({
    database: db.connection,
    origin: headers.origin,
    installationSecret: secret,
    clock: () => timeline.now,
    logger: false,
  });
  await app.ready();
  expect(
    (
      await req(
        'POST',
        '/api/auth/setup',
        {
          loginIdentifier: 'report-owner',
          displayName: 'Synthetic report owner',
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
    { loginIdentifier: 'report-owner', password },
    '',
  );
  expect(login.statusCode).toBe(200);
  cookie = String(login.headers['set-cookie']).split(';')[0]!;
  const owner = await db.client.user.findUniqueOrThrow({
    where: { loginIdentifier: 'report-owner' },
    select: { id: true },
  });
  const session = await db.client.session.findFirstOrThrow({
    where: { userId: owner.id, revokedAt: null },
    select: { id: true },
  });
  principal = { userId: owner.id, sessionId: session.id };
  scenario = await seedReportScenario(db.client, principal, timeline);
  for (const role of ['MANAGER', 'CASHIER', 'PRODUCTION'] as const) {
    const id = 'report-' + role.toLowerCase();
    const created = await req('POST', '/api/users', {
      loginIdentifier: id,
      displayName: 'Synthetic ' + role,
      role,
      password,
    });
    expect(created.statusCode).toBe(201);
    const r = await req('POST', '/api/auth/login', { loginIdentifier: id, password }, '');
    expect(r.statusCode).toBe(200);
    roles[role] = {
      cookie: String(r.headers['set-cookie']).split(';')[0]!,
      id: created.json().user.id,
    };
  }
}, 30000);
afterAll(async () => {
  await app?.close();
  await db?.connection.close();
});
describe('Phase 7 real PostgreSQL reconciliation', () => {
  it('01. fulfillment and payment use different source dates', async () => {
    const d = await report('daily');
    const first = d.items.find((r) => r.cells.day === '2026-10-14')!,
      second = d.items.find((r) => r.cells.day === '2026-10-15')!;
    expect(first.cells).toMatchObject({
      fulfilled: '3',
      gross: '5000',
      discount: '200',
      net: '4800',
      received: '6800',
      refunded: '2000',
      receiptsNet: '4800',
    });
    expect(second.cells).toMatchObject({
      fulfilled: '2',
      gross: '2500',
      discount: '0',
      net: '2500',
      received: '1500',
      refunded: '1800',
      receiptsNet: '-300',
    });
  });
  it('02. order intake is separate and does not add to delivered value', async () => {
    const d = await report('daily');
    expect(d.totals).toMatchObject({ intake: '9', confirmed: '7', fulfilled: '5', net: '7300' });
    const o = await report('orders');
    expect(o.total).toBe(9);
    expect(o.totals).toMatchObject({
      counter: '6',
      whatsapp: '3',
      unpaid: '3',
      paid: '4',
      refundedCount: '2',
      cancelled: '1',
      fulfilled: '5',
    });
  });
  it('03. cancelled and unfulfilled states never count as fulfilled sales', async () => {
    const r = await report('sales');
    expect(r.total).toBe(5);
    for (const id of [scenario.cancelled, scenario.future, scenario.unpaid, scenario.zeroDraft])
      expect(r.items.some((x) => x.id === id)).toBe(false);
  });
  it('04. discounts occur once across order and allocated product snapshots', async () => {
    expect((await report('sales')).totals).toMatchObject({
      gross: '7500',
      discount: '200',
      net: '7300',
    });
    expect((await report('products')).totals).toMatchObject({
      gross: '7500',
      discount: '200',
      net: '7300',
    });
  });
  it('05. later refunds remain on recorded date and preserve earlier delivery', async () => {
    const d = await report('payments', {}, cookie, '2026-10-15', '2026-10-15');
    expect(d.totals).toMatchObject({ received: '1500', refunded: '1800', receiptsNet: '-300' });
    const sale = (await report('sales')).items.find((x) => x.id === scenario.discounted)!;
    expect(sale.cells.net).toBe('1800');
    expect(sale.cells.refundAt).toContain('2026-10-15');
  });
  it('06. refunds are subtracted once from receipts and never rewrite fulfilled totals', async () => {
    expect((await report('daily')).totals).toMatchObject({
      net: '7300',
      received: '8300',
      refunded: '3800',
      receiptsNet: '4500',
    });
  });
  it('07. future paid pickup contributes payments but not deliveries', async () => {
    const orders = await report('orders', { source: 'WHATSAPP' });
    expect(orders.items.find((r) => r.id === scenario.future)?.cells).toMatchObject({
      status: 'Confirmado',
      payment: 'Pago',
      net: '1000',
    });
    expect((await report('sales')).items.some((r) => r.id === scenario.future)).toBe(false);
  });
  it('08. rename/repricing preserve stable grouping and historical values', async () => {
    const r = await report('products');
    const a = r.items.find((x) => x.id === scenario.a.id)!;
    expect(a.cells).toMatchObject({
      label: 'Synthetic renamed current A',
      historical: 'Synthetic historical A',
      quantity: '5',
      gross: '5500',
      discount: '200',
      net: '5300',
    });
  });
  it('09. inactive products remain in historical sales', async () => {
    expect(
      (await db.client.product.findUniqueOrThrow({ where: { id: scenario.a.id } })).active,
    ).toBe(false);
    expect((await report('products', { productId: scenario.a.id })).total).toBe(1);
  });
  it('10. method totals match independent recorded receipt values', async () => {
    const r = await report('payments');
    expect(r.totals).toMatchObject({
      paymentCount: '6',
      refundCount: '2',
      received: '8300',
      refunded: '3800',
      receiptsNet: '4500',
    });
    const cash = await report('payments', { method: 'CASH' });
    expect(cash.totals).toMatchObject({ received: '1800', refunded: '1800', receiptsNet: '0' });
  });
  it('11. cash history preserves the Phase 6 formula and immutable count', async () => {
    const r = await report('cash', {}, cookie, '2026-10-13', '2026-10-15');
    expect(r.total).toBe(2);
    expect(r.items.find((x) => x.id === scenario.session1)?.cells).toMatchObject({
      float: '10000',
      cashReceived: '1800',
      cashRefunded: '0',
      additions: '500',
      withdrawals: '200',
      expenses: '100',
      expected: '12000',
      counted: '11950',
      difference: '-50',
    });
    expect(r.items.find((x) => x.id === scenario.session2)?.cells).toMatchObject({
      expected: '3200',
      cashRefunded: '1800',
      counted: null,
    });
  });
  it('12. overnight cash session selection is by opening, not daily receipt date', async () => {
    const r = await report('cash', {}, cookie, '2026-10-14', '2026-10-14');
    expect(r.total).toBe(0);
    expect((await report('payments', {}, cookie, '2026-10-14', '2026-10-14')).totals.received).toBe(
      '6800',
    );
  });
  it('13. completed actual units exclude pending plan quantities', async () => {
    const r = await report('production');
    expect(r.total).toBe(1);
    expect(r.totals).toMatchObject({ planned: '10', actual: '8', shortfall: '2' });
  });
  it('14. yield shortfall is not finished-unit waste', async () => {
    expect((await report('waste')).totals.quantity).toBe('2');
    expect((await report('waste')).items[0]?.cells.reason).toBe('Danificado');
    expect((await report('daily')).totals).toMatchObject({
      produced: '8',
      purchased: '20',
      wasted: '2',
    });
    expect((await report('receipts')).items[0]?.cells.unitCost).toBe('700');
  });
  it('15. signed stock movement formula reconciles', async () => {
    const a = (await report('inventory', { productId: scenario.a.id })).items[0]!;
    expect(a.cells).toMatchObject({
      opening: '107',
      inbound: '8',
      consumed: '5',
      wasted: '2',
      adjustment: '2',
      closing: '110',
      physical: '110',
      reserved: '1',
      available: '0',
      integrity: 'Conciliado',
    });
  });
  it('16. physical, reserved and sellable remain distinct', async () => {
    const b = (await report('inventory', { productId: scenario.b.id })).items[0]!;
    expect(b.cells).toMatchObject({
      opening: '0',
      inbound: '20',
      consumed: '1',
      closing: '19',
      physical: '19',
      reserved: '1',
      available: '18',
    });
  });
  it('17. Fortaleza half-open boundary excludes preceding UTC instant', async () => {
    const r = await report('sales', {}, cookie, '2026-10-14', '2026-10-14');
    expect(r.items.some((x) => x.id === scenario.beforeBoundary)).toBe(false);
    expect(r.items.some((x) => x.id === scenario.atBoundary)).toBe(true);
    expect(r.period.start).toBe('2026-10-14T03:00:00.000Z');
    expect(r.period.end).toBe('2026-10-15T03:00:00.000Z');
  });
  it('18. anonymized customers never reappear through report/export projections', async () => {
    const r = await req('POST', '/api/reports/customers/export', {
      from: '2026-10-14',
      to: '2026-10-15',
      customerId: scenario.customerId,
    });
    expect(r.statusCode, r.body).toBe(200);
    for (const text of [
      'Synthetic person removed',
      'Synthetic collection',
      'cpf',
      'phone',
      'pickupPerson',
    ])
      expect(r.body).not.toContain(text);
    expect((await report('customers', { customerId: scenario.customerId })).total).toBe(3);
  });
  it('19. roles restrict reports, costs, counts and owner dashboard', async () => {
    for (const role of ['CASHIER', 'PRODUCTION'])
      for (const kind of [
        'dashboard',
        'daily',
        'payments',
        'orders',
        'receipts',
        'cash',
        'customers',
      ])
        expect(
          (await req('GET', `/api/reports/${kind}`, undefined, roles[role]!.cookie)).statusCode,
        ).toBe(403);
    expect(
      (await req('GET', '/api/reports/dashboard', undefined, roles.MANAGER!.cookie)).statusCode,
    ).toBe(403);
    const p = await report('production', {}, roles.PRODUCTION!.cookie);
    expect(p.total).toBe(1);
    const waste = await report('waste', {}, roles.PRODUCTION!.cookie);
    expect(waste.total).toBe(0);
    for (const field of ['unitCost', 'received', 'cpf', 'customer', 'cash'])
      expect(JSON.stringify(p)).not.toContain('"' + field + '"');
  });
  it('20. export cannot bypass customer policy and audit omits rows', async () => {
    for (const role of ['MANAGER', 'CASHIER', 'PRODUCTION'])
      expect(
        (
          await req(
            'POST',
            '/api/reports/sales/export',
            { from: '2026-10-14', to: '2026-10-15' },
            roles[role]!.cookie,
          )
        ).statusCode,
      ).toBe(403);
    const r = await req('POST', '/api/reports/products/export', {
      from: '2026-10-14',
      to: '2026-10-15',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().csv).toContain("'=Synthetic formula-safe B");
    expect(r.json().csv.startsWith('\uFEFF')).toBe(true);
    expect(r.json().filename).toBe('le-pommier-products-2026-10-14-2026-10-15.csv');
    const logs = await db.client.auditEvent.findMany({
      where: { eventType: 'REPORT_EXPORTED' },
      select: { metadata: true },
    });
    for (const l of logs) {
      expect(Object.keys(l.metadata as object).sort()).toEqual(['count', 'reason', 'scope']);
      expect(JSON.stringify(l.metadata)).not.toContain('Synthetic');
    }
  });
  it('21. stable pagination keeps full-filter totals distinct from page totals', async () => {
    for (let i = 0; i < 25; i++)
      await sales().create(
        principal,
        randomUUID(),
        draftInput.parse({ source: 'COUNTER', lines: [line()] }),
        'synthetic-report-pages',
      );
    const a = await report('orders', {}, cookie, '2026-10-17', '2026-10-17'),
      b = await report('orders', { page: '2' }, cookie, '2026-10-17', '2026-10-17');
    expect(a.total).toBe(25);
    expect(a.items).toHaveLength(20);
    expect(b.items).toHaveLength(5);
    expect(new Set([...a.items, ...b.items].map((r) => r.id)).size).toBe(25);
    expect(a.totals.net).toBe('50000');
    expect(b.totals.net).toBe('50000');
  });
  it('22. concurrent checkout does not split the dashboard snapshot', async () => {
    const original = ReportingService.prototype.tableTx;
    const spy = vi
      .spyOn(ReportingService.prototype, 'tableTx')
      .mockImplementationOnce(async function (this: ReportingService, ...args) {
        const data = await original.apply(this, args);
        await sales().checkout(
          principal,
          randomUUID(),
          checkoutInput.parse({
            draft: { source: 'COUNTER', lines: [line()] },
            payment: {
              method: 'CASH',
              amountCents: '2000',
              tenderedCents: '2000',
              manuallyConfirmed: true,
            },
          }),
          'synthetic-report-concurrency',
        );
        return data;
      });
    try {
      const old = await dashboard();
      expect(old.metrics.net).toBe('0');
      expect(old.metrics.intake).toBe('25');
      expect(old.cash?.expectedCents).toBe('3200');
    } finally {
      spy.mockRestore();
    }
    const current = await dashboard();
    expect(current.metrics.net).toBe('2000');
    expect(current.cash?.expectedCents).toBe('5200');
  });
  it('23. expiry/unknown/current paid-allocation alerts use actual entered rules', async () => {
    const d = await dashboard({ expiryDays: '1' });
    const counts = Object.fromEntries(d.alerts.map((a) => [a.code, a.count]));
    expect(counts).toMatchObject({
      expired: '1',
      expiring: '1',
      unknown: '1',
      unpaid: '1',
      invalidPaid: '1',
      inventoryIntegrity: '0',
      cashReview: '1',
      cashIntegrity: '0',
    });
    expect((await dashboard()).alerts.find((a) => a.code === 'expiring')?.count).toBeNull();
    expect(d.alerts.some((a) => a.code === 'lowStock')).toBe(false);
  });
  it('24. zero-total drafts are intake only and cannot confirm or create money', async () => {
    await expect(
      sales().confirm(
        principal,
        randomUUID(),
        scenario.zeroDraft,
        { version: 1, expectedTotalCents: '0' },
        'synthetic-zero',
      ),
    ).rejects.toThrow();
    expect(await db.client.payment.count({ where: { orderId: scenario.zeroDraft } })).toBe(0);
    expect((await report('orders')).items.find((r) => r.id === scenario.zeroDraft)?.cells.net).toBe(
      '0',
    );
  });
  it('25. filter/sort injection and invalid/excessive/future dates are rejected', async () => {
    for (const suffix of [
      'direction=desc%3BDROP%20TABLE',
      'source=%27OR%201%3D1',
      'sort=amount',
      'from=2026-02-30',
      'from=2026-10-16&to=2026-10-14',
      'from=2000-01-01&to=2026-10-17',
      'to=2099-01-01',
    ])
      expect((await req('GET', '/api/reports/orders?' + suffix)).statusCode).toBe(400);
    expect((await req('GET', '/api/reports/production?method=CASH')).statusCode).toBe(400);
  });
  it('26. empty periods return honest zeros/empty results', async () => {
    const d = await report('daily', {}, cookie, '2000-01-01', '2000-01-01');
    expect(d.totals.net).toBe('0');
    expect(d.totals.receiptsNet).toBe('0');
    expect((await report('sales', {}, cookie, '2000-01-01', '2000-01-01')).items).toEqual([]);
  });
  it('27. export limit rejects all rows above the cap without truncation', async () => {
    const existing = await db.client.order.count({
      where: { createdAt: { gte: new Date('2026-10-17T03:00:00Z') } },
    });
    for (let i = existing; i < 1000; i++)
      await sales().create(
        principal,
        randomUUID(),
        draftInput.parse({ source: 'COUNTER', lines: [line()] }),
        'synthetic-export-cap',
      );
    const data = { from: '2026-10-17', to: '2026-10-17' };
    const ok = await req('POST', '/api/reports/orders/export', data);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().rows).toBe(1000);
    await sales().create(
      principal,
      randomUUID(),
      draftInput.parse({ source: 'COUNTER', lines: [line()] }),
      'synthetic-export-over-cap',
    );
    const fail = await req('POST', '/api/reports/orders/export', data);
    expect(fail.statusCode).toBe(413);
    expect(fail.json().error.code).toBe('REPORT_EXPORT_LIMIT');
    expect(fail.json().csv).toBeUndefined();
  }, 60000);
  it('28. additive reporting indexes preserve genuine populated seven-migration history', async () => {
    let before = '';
    let legacyScenario: Awaited<ReturnType<typeof seedReportScenario>> | undefined;
    async function fingerprint(client: typeof db.client) {
      const values = [];
      for (const table of [
        'StoreSettings',
        'User',
        'Session',
        'InstallationState',
        'AuditEvent',
        'Customer',
        'Product',
        'InventoryMovement',
        'InventoryReservation',
        'Order',
        'OrderItem',
        'Payment',
        'Refund',
        'CashSession',
        'CashMovement',
        'CashClosing',
        'CashReview',
      ]) {
        const r = await client.$queryRawUnsafe<Array<{ rows: string }>>(
          `SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb)::text rows FROM (SELECT to_jsonb(t) v FROM "${table}" t) x`,
        );
        values.push(r[0]!.rows);
      }
      return createHash('sha256').update(values.join('\n')).digest('hex');
    }
    const legacy = await freshDatabase('cash', async (client) => {
      const s = await client.session.findFirstOrThrow({ select: { id: true, userId: true } });
      legacyScenario = await seedReportScenario(
        client,
        { sessionId: s.id, userId: s.userId },
        { now: new Date('2026-10-13T18:00:00Z') },
      );
      before = await fingerprint(client);
    });
    try {
      expect(await fingerprint(legacy.client)).toBe(before);
      expect(
        await legacy.client.cashClosing.count({ where: { sessionId: legacyScenario!.session1 } }),
      ).toBe(1);
      expect(
        await legacy.client.$queryRawUnsafe(
          "SELECT indexname FROM pg_indexes WHERE indexname='Order_fulfilledAt_id_idx'",
        ),
      ).toHaveLength(1);
    } finally {
      await legacy.connection.close();
    }
  }, 30000);
  it('29. routine read completes while the global security write lock is held', async () => {
    await db.client.$transaction(
      async (tx) => {
        await securityLock(tx);
        const r = await req('GET', '/api/reports/daily?' + query());
        expect(r.statusCode, r.body).toBe(200);
      },
      { timeout: 7000 },
    );
  });
  it('30. export revocation after snapshot prevents delivery', async () => {
    const created = await req('POST', '/api/users', {
      loginIdentifier: 'report-extra-owner',
      displayName: 'Synthetic temporary reporting owner',
      role: 'OWNER',
      password,
    });
    expect(created.statusCode).toBe(201);
    const user = created.json().user;
    const login = await req(
      'POST',
      '/api/auth/login',
      { loginIdentifier: user.loginIdentifier, password },
      '',
    );
    expect(login.statusCode).toBe(200);
    const temporary = String(login.headers['set-cookie']).split(';')[0]!;
    const original = ReportingService.prototype.tableTx;
    const spy = vi
      .spyOn(ReportingService.prototype, 'tableTx')
      .mockImplementationOnce(async function (this: ReportingService, ...args) {
        const result = await original.apply(this, args);
        const changed = await req('PATCH', '/api/users/' + user.id, {
          displayName: user.displayName,
          role: 'OWNER',
          active: false,
          version: user.version,
          reason: 'Synthetic export revocation',
        });
        expect(changed.statusCode).toBe(200);
        return result;
      });
    try {
      const r = await req(
        'POST',
        '/api/reports/sales/export',
        { from: '2026-10-14', to: '2026-10-15' },
        temporary,
      );
      expect(r.statusCode).toBe(401);
      expect(r.json().csv).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
  it('31. timestamped financial drill-downs preserve gross/refund bases and source links', async () => {
    const d = await report('transactions');
    expect(d.total).toBe(8);
    expect(d.totals).toMatchObject({ received: '8300', refunded: '3800', receiptsNet: '4500' });
    expect(d.items.every((r) => r.drill?.kind === 'order' && r.cells.at)).toBe(true);
    const refunds = await report('transactions', { recordType: 'REFUND' });
    expect(refunds.total).toBe(2);
    expect(refunds.totals).toMatchObject({ received: '0', refunded: '3800', receiptsNet: '-3800' });
  });
  it('32. every current alert count reconciles to its complete filtered source report', async () => {
    const d = await dashboard({ expiryDays: '1' });
    for (const a of d.alerts) {
      expect(
        (
          await report('alerts', {
            alert: a.code,
            ...(a.code === 'expiring' ? { expiryDays: '1' } : {}),
          })
        ).total,
      ).toBe(Number(a.count));
    }
  });
  it('33. new exports retain Origin Host CSRF and authenticated read protection', async () => {
    expect((await req('GET', '/api/reports/daily', undefined, '')).statusCode).toBe(401);
    for (const h of [
      { host: headers.host, origin: headers.origin },
      { ...headers, origin: 'https://untrusted.invalid' },
      { ...headers, host: 'untrusted.invalid' },
    ]) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/reports/sales/export',
        headers: { ...h, cookie },
        payload: { from: '2026-10-14', to: '2026-10-15' },
      });
      expect([400, 403]).toContain(r.statusCode);
      expect(r.json().csv).toBeUndefined();
    }
  });
  it('34. cash and stock integrity findings remain separate from count differences and never auto-repair', async () => {
    const original = await db.client.cashClosing.findUniqueOrThrow({
      where: { sessionId: scenario.session1 },
    });
    await db.client.$executeRawUnsafe(
      'ALTER TABLE "CashClosing" DISABLE TRIGGER "CashClosing_append_only"',
    );
    try {
      await db.client.cashClosing.update({
        where: { sessionId: scenario.session1 },
        data: {
          expectedCents: original.expectedCents + 1n,
          differenceCents: original.differenceCents - 1n,
        },
      });
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "CashClosing" ENABLE TRIGGER "CashClosing_append_only"',
      );
      const d = await dashboard();
      expect(d.alerts.find((a) => a.code === 'cashIntegrity')?.count).toBe('1');
      expect((await report('alerts', { alert: 'cashIntegrity' })).total).toBe(1);
      const h = await report('cash', {}, cookie, '2026-10-13', '2026-10-15');
      expect(h.items.find((r) => r.id === scenario.session1)?.cells.integrity).toBe(
        'Sem conciliação verificável',
      );
      expect(
        (await db.client.cashClosing.findUniqueOrThrow({ where: { sessionId: scenario.session1 } }))
          .expectedCents,
      ).toBe(12001n);
    } finally {
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "CashClosing" DISABLE TRIGGER "CashClosing_append_only"',
      );
      await db.client.cashClosing.update({
        where: { sessionId: scenario.session1 },
        data: { expectedCents: original.expectedCents, differenceCents: original.differenceCents },
      });
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "CashClosing" ENABLE TRIGGER "CashClosing_append_only"',
      );
    }
    const batch = await db.client.batch.findUniqueOrThrow({ where: { id: scenario.batch } });
    await db.client.$executeRawUnsafe(
      'ALTER TABLE "Batch" DISABLE TRIGGER "Batch_projection_consistency"',
    );
    try {
      await db.client.batch.update({
        where: { id: batch.id },
        data: { physical: batch.physical + 1n, version: { increment: 1 } },
      });
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "Batch" ENABLE TRIGGER "Batch_projection_consistency"',
      );
      const d = await report('inventory', { productId: scenario.a.id });
      expect(d.items[0]?.cells.available).toBeNull();
      expect(d.items[0]?.cells.integrity).toContain('Falha de integridade');
      expect((await dashboard()).alerts.find((a) => a.code === 'inventoryIntegrity')?.count).toBe(
        '1',
      );
      expect((await report('alerts', { alert: 'inventoryIntegrity' })).total).toBe(1);
      expect((await db.client.batch.findUniqueOrThrow({ where: { id: batch.id } })).physical).toBe(
        batch.physical + 1n,
      );
    } finally {
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "Batch" DISABLE TRIGGER "Batch_projection_consistency"',
      );
      await db.client.batch.update({
        where: { id: batch.id },
        data: { physical: batch.physical, version: { increment: 1 } },
      });
      await db.client.$executeRawUnsafe(
        'ALTER TABLE "Batch" ENABLE TRIGGER "Batch_projection_consistency"',
      );
    }
  });
  it('35. delayed audit commit returns one confirmed export instead of a premature client timeout', async () => {
    await db.client.$executeRawUnsafe(
      `CREATE FUNCTION reporting_test_commit_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventType"='REPORT_EXPORTED' THEN PERFORM pg_sleep(2.2); END IF; RETURN NULL; END $$`,
    );
    await db.client.$executeRawUnsafe(
      `CREATE CONSTRAINT TRIGGER reporting_test_commit_delay AFTER INSERT ON "AuditEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reporting_test_commit_delay()`,
    );
    const count = await db.client.auditEvent.count({ where: { eventType: 'REPORT_EXPORTED' } });
    try {
      const r = await req('POST', '/api/reports/sales/export', {
        from: '2026-10-14',
        to: '2026-10-15',
      });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().rows).toBe(5);
      expect(await db.client.auditEvent.count({ where: { eventType: 'REPORT_EXPORTED' } })).toBe(
        count + 1,
      );
    } finally {
      await db.client.$executeRawUnsafe('DROP TRIGGER reporting_test_commit_delay ON "AuditEvent"');
      await db.client.$executeRawUnsafe('DROP FUNCTION reporting_test_commit_delay()');
    }
  });
});
