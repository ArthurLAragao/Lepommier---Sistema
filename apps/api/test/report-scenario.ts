import { randomUUID } from 'node:crypto';
import {
  nameKey,
  registrationLabel,
  pickupLocalOf,
  openingInput,
  receiptInput,
  planInput,
  completeInput,
  wasteInput,
  adjustmentInput,
  draftInput,
  checkoutInput,
  orderPaymentInput,
} from '@pommier/shared';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { AuthService, type Principal } from '../src/auth/service.js';
import { InventoryService } from '../src/inventory/service.js';
import { SalesService } from '../src/sales/service.js';
import { CashService } from '../src/cash/service.js';
import { RegistryService } from '../src/registry/service.js';
/** Deliberate synthetic test scenario. Never called by startup or a manual seed. */
export async function seedReportScenario(db: PrismaClient, p: Principal, timeline: { now: Date }) {
  const clock = () => timeline.now;
  const auth = new AuthService(db, clock, undefined),
    stock = new InventoryService(auth, clock),
    sales = new SalesService(auth, clock),
    cash = new CashService(auth, clock),
    registry = new RegistryService(auth, clock);
  const at = (value: string) => {
    timeline.now = new Date(value);
  };
  const key = () => randomUUID();
  const request = 'synthetic-report-fixture';
  await db.session.update({
    where: { id: p.sessionId },
    data: { expiresAt: new Date('2099-01-01T00:00:00Z') },
  });
  const category = await db.category.create({
    data: { name: 'Synthetic report category', nameKey: 'synthetic report category' },
  });
  async function product(code: string, name: string, price: number) {
    return db.product.create({
      data: {
        code,
        name,
        nameKey: nameKey(name),
        categoryId: category.id,
        origin: 'BOTH',
        sellingPriceCents: price,
        estimatedCostCents: 333,
      },
    });
  }
  let a = await product('R7-A', 'Synthetic historical A', 1000);
  const b = await product('R7-B', '=Synthetic formula-safe B', 2000),
    zero = await product('R7-Z', 'Synthetic zero draft', 0);
  const customer = await db.customer.create({
    data: {
      name: 'Synthetic person removed by anonymization',
      nameKey: 'synthetic person removed by anonymization',
    },
  });
  const line = (product: typeof a, quantity = 1) => ({
    productId: product.id,
    productVersion: product.version,
    quantity,
    unitPriceCents: product.sellingPriceCents,
  });
  const ver = async (id: string) =>
    (await db.order.findUniqueOrThrow({ where: { id }, select: { version: true } })).version;
  const session1 = (await sales.openCash(p, key(), { openingFloatCents: '10000' }, request))
    .targetId;
  const batch = (
    await stock.opening(
      p,
      key(),
      openingInput.parse({
        productId: a.id,
        quantity: 100,
        reason: 'INITIAL_COUNT',
        batch: { reference: 'Synthetic report opening A', expiresAt: '2026-10-30' },
      }),
      request,
    )
  ).targetId;
  await stock.opening(
    p,
    key(),
    openingInput.parse({
      productId: a.id,
      quantity: 5,
      reason: 'INITIAL_COUNT',
      batch: {
        reference: 'Synthetic unknown expiry A',
        expiresAt: null,
        expiryUnknownReason: 'LEGACY_COUNT',
      },
    }),
    request,
  );
  await stock.opening(
    p,
    key(),
    openingInput.parse({
      productId: a.id,
      quantity: 3,
      reason: 'INITIAL_COUNT',
      batch: { reference: 'Synthetic expired physical A', expiresAt: '2026-10-12' },
    }),
    request,
  );
  async function checkout(product: typeof a, method = 'PIX', quantity = 1, discountCents?: string) {
    return (
      await sales.checkout(
        p,
        key(),
        checkoutInput.parse({
          draft: {
            source: 'COUNTER',
            lines: [line(product, quantity)],
            ...(discountCents ? { discountCents, discountReason: 'PROMOTION' } : {}),
          },
          payment: {
            method,
            amountCents: String(product.sellingPriceCents * quantity - Number(discountCents ?? 0)),
            manuallyConfirmed: true,
            ...(method === 'CASH' ? { tenderedCents: '2000' } : {}),
          },
        }),
        request,
      )
    ).targetId;
  }
  at('2026-10-14T02:59:59Z');
  const beforeBoundary = await checkout(a);
  at('2026-10-14T03:00:00Z');
  const atBoundary = await checkout(a, 'CREDIT_CARD');
  at('2026-10-14T12:00:00Z');
  const production = (
    await stock.plan(
      p,
      key(),
      planInput.parse({ productId: a.id, plannedQuantity: 10, plannedDate: '2026-10-14' }),
      request,
    )
  ).targetId;
  await stock.transition(p, key(), production, { version: 1, action: 'START' }, request);
  await stock.complete(
    p,
    key(),
    production,
    completeInput.parse({
      version: 2,
      actualQuantity: 8,
      batch: { reference: 'Synthetic report produced A', expiresAt: '2026-10-30' },
    }),
    request,
  );
  await stock.plan(
    p,
    key(),
    planInput.parse({ productId: a.id, plannedQuantity: 99, plannedDate: '2026-10-17' }),
    request,
  );
  const purchased = (
    await stock.receipt(
      p,
      key(),
      receiptInput.parse({
        productId: b.id,
        quantity: 20,
        supplierReference: 'Synthetic supplier code',
        unitCostCents: 700,
        batch: { reference: 'Synthetic report purchased B', expiresAt: '2026-10-18' },
      }),
      request,
    )
  ).targetId;
  async function batchVersion() {
    return (await db.batch.findUniqueOrThrow({ where: { id: batch }, select: { version: true } }))
      .version;
  }
  await stock.waste(
    p,
    key(),
    wasteInput.parse({
      productId: a.id,
      batchId: batch,
      version: await batchVersion(),
      quantity: 2,
      reason: 'DAMAGED',
    }),
    request,
  );
  await stock.adjust(
    p,
    key(),
    adjustmentInput.parse({
      productId: a.id,
      newBatch: { reference: 'Synthetic report count addition', expiresAt: '2026-10-30' },
      direction: 'IN',
      quantity: 3,
      reason: 'COUNT_DIFFERENCE',
    }),
    request,
  );
  await stock.adjust(
    p,
    key(),
    adjustmentInput.parse({
      productId: a.id,
      batchId: batch,
      version: await batchVersion(),
      direction: 'OUT',
      quantity: 1,
      reason: 'COUNT_DIFFERENCE',
    }),
    request,
  );
  const discounted = await checkout(a, 'CASH', 2, '200');
  const sameDayRefund = await checkout(b, 'DEBIT_CARD');
  await sales.refund(
    p,
    key(),
    sameDayRefund,
    {
      version: await ver(sameDayRefund),
      reason: 'CUSTOMER_REQUEST',
      externalRefundConfirmed: true,
    },
    request,
  );
  async function order(product: typeof a, pickupAt: string, payment?: string) {
    const id = (
      await sales.create(
        p,
        key(),
        draftInput.parse({
          source: 'WHATSAPP',
          customerId: customer.id,
          pickupLocal: pickupLocalOf(pickupAt),
          lines: [line(product)],
          pickupPerson: 'Synthetic collection name to erase',
          collectionNote: 'Synthetic collection note to erase',
        }),
        request,
      )
    ).targetId;
    await sales.confirm(
      p,
      key(),
      id,
      { version: await ver(id), expectedTotalCents: String(product.sellingPriceCents) },
      request,
    );
    if (payment)
      await sales.pay(
        p,
        key(),
        id,
        orderPaymentInput.parse({
          version: await ver(id),
          payment: {
            method: payment,
            amountCents: String(product.sellingPriceCents),
            manuallyConfirmed: true,
          },
        }),
        request,
      );
    return id;
  }
  const paidEarlier = await order(a, '2026-10-15T13:00:00Z', 'PIX');
  const future = await order(a, '2026-10-18T13:00:00Z', 'CREDIT_CARD');
  const unpaid = await order(b, '2026-10-18T13:00:00Z');
  const zeroDraft = (
    await sales.create(
      p,
      key(),
      draftInput.parse({ source: 'COUNTER', lines: [line(zero)] }),
      request,
    )
  ).targetId;
  const cancelled = (
    await sales.create(p, key(), draftInput.parse({ source: 'COUNTER', lines: [line(b)] }), request)
  ).targetId;
  await sales.cancel(p, key(), cancelled, { version: 1, reason: 'CUSTOMER_REQUEST' }, request);
  for (const [kind, amountCents] of [
    ['CASH_ADDITION', '500'],
    ['CASH_WITHDRAWAL', '200'],
    ['CASH_EXPENSE', '100'],
  ] as const)
    await cash.movement(
      p,
      key(),
      {
        sessionId: session1,
        kind,
        amountCents,
        reason: 'Synthetic physical cash fixture',
        ...(kind === 'CASH_EXPENSE' ? { category: 'SUPPLIES' as const } : {}),
      },
      request,
    );
  const c = await db.cashSession.findUniqueOrThrow({ where: { id: session1 } });
  await cash.close(
    p,
    key(),
    {
      sessionId: session1,
      activityVersion: c.activityVersion,
      countedCents: '11950',
      explanation: 'Synthetic independently counted shortage',
      confirmed: true,
    },
    request,
  );
  at('2026-10-15T12:00:00Z');
  const session2 = (await sales.openCash(p, key(), { openingFloatCents: '5000' }, request))
    .targetId;
  await sales.refund(
    p,
    key(),
    discounted,
    { version: await ver(discounted), reason: 'CUSTOMER_REQUEST', externalRefundConfirmed: true },
    request,
  );
  await sales.progress(
    p,
    key(),
    paidEarlier,
    { version: await ver(paidEarlier), to: 'PREPARING' },
    request,
  );
  await sales.progress(
    p,
    key(),
    paidEarlier,
    { version: await ver(paidEarlier), to: 'READY' },
    request,
  );
  await sales.handover(p, key(), paidEarlier, { version: await ver(paidEarlier) }, request);
  a = await db.product.update({
    where: { id: a.id },
    data: {
      name: 'Synthetic renamed current A',
      nameKey: 'synthetic renamed current a',
      sellingPriceCents: 1500,
      version: { increment: 1 },
    },
  });
  const repriced = await checkout(a, 'CREDIT_CARD');
  at('2026-10-17T12:00:00Z');
  await registry.anonymize(
    p,
    customer.id,
    {
      version: customer.version,
      confirmation: registrationLabel(customer.registrationNumber),
      reason: 'CUSTOMER_REQUEST',
    },
    request,
  );
  a = await db.product.update({
    where: { id: a.id },
    data: { active: false, version: { increment: 1 } },
  });
  return {
    a,
    b,
    zero,
    customerId: customer.id,
    session1,
    session2,
    production,
    purchased,
    batch,
    beforeBoundary,
    atBoundary,
    discounted,
    sameDayRefund,
    paidEarlier,
    future,
    unpaid,
    zeroDraft,
    cancelled,
    repriced,
  };
}
