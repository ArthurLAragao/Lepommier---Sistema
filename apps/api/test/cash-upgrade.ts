import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { AuthService } from '../src/auth/service.js';
import { InventoryService } from '../src/inventory/service.js';
import { SalesService } from '../src/sales/service.js';
/** Synthetic five-migration fixture only. It deliberately avoids Phase 6 cash columns/functions. */
export async function seedPhase5Cash(client: PrismaClient) {
  const user = await client.user.findFirstOrThrow({
    where: { role: 'OWNER' },
    select: { id: true },
  });
  const session = await client.session.findFirstOrThrow({
    where: { userId: user.id },
    select: { id: true, userId: true, createdAt: true },
  });
  const principal = { sessionId: session.id, userId: user.id };
  let now = session.createdAt;
  const auth = new AuthService(client, () => now, undefined);
  const inv = new InventoryService(auth, () => now);
  const sales = new SalesService(auth, () => now);
  const existing = await client.product.findFirstOrThrow({
    select: { id: true, version: true, code: true, name: true, sellingPriceCents: true },
  });
  const product = await client.product.update({
    where: { id: existing.id },
    data: { active: true, version: { increment: 1 } },
    select: { id: true, version: true, sellingPriceCents: true },
  });
  await inv.opening(
    principal,
    randomUUID(),
    {
      productId: product.id,
      quantity: 12,
      reason: 'INITIAL_COUNT',
      batch: { reference: 'Synthetic Phase 5 cash upgrade stock', expiresAt: '2099-01-01' },
    },
    'cash-upgrade-stock',
  );
  async function open() {
    const id = randomUUID();
    await inv.command(
      principal,
      'CASH_OPEN',
      randomUUID(),
      { openingFloatCents: '10000' },
      'cash-upgrade-open',
      async (tx, a, op) => {
        await tx.$executeRaw`INSERT INTO "CashSession"(id,"openedAt","openedById","openingFloatCents","operationId") VALUES(${id}::uuid,${now},${a.id}::uuid,10000,${op}::uuid)`;
        return { targetId: id, state: 'OPEN' };
      },
    );
    return id;
  }
  const oldSessionId = await open();
  let currentSessionId = oldSessionId;
  const orders: string[] = [];
  const payments: string[] = [];
  for (const method of ['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD'] as const) {
    if (method === 'DEBIT_CARD') {
      await client.$executeRaw`UPDATE "CashSession" SET "closedAt"=${new Date(now.getTime() + 1)} WHERE id=${oldSessionId}::uuid`;
      now = new Date(now.getTime() + 2);
      currentSessionId = await open();
    }
    const draft = await sales.create(
      principal,
      randomUUID(),
      {
        source: 'COUNTER',
        lines: [
          {
            productId: product.id,
            productVersion: product.version,
            quantity: 1,
            unitPriceCents: product.sellingPriceCents,
          },
        ],
        discountCents: '0',
      },
      'cash-upgrade-draft',
    );
    orders.push(draft.targetId);
    const version = async () =>
      (
        await client.order.findUniqueOrThrow({
          where: { id: draft.targetId },
          select: { version: true },
        })
      ).version;
    await sales.confirm(
      principal,
      randomUUID(),
      draft.targetId,
      { version: await version(), expectedTotalCents: String(product.sellingPriceCents) },
      'cash-upgrade-confirm',
    );
    await inv.command(
      principal,
      'ORDER_PAY',
      randomUUID(),
      { orderId: draft.targetId, method },
      'cash-upgrade-pay',
      async (tx, a, op) => {
        await sales.lockOrder(tx, draft.targetId, await version());
        await tx.$queryRaw`SELECT id FROM "CashSession" WHERE id=${currentSessionId}::uuid FOR UPDATE`;
        const p = await tx.payment.create({
          data: {
            orderId: draft.targetId,
            amountCents: BigInt(product.sellingPriceCents),
            method,
            tenderedCents: method === 'CASH' ? 2000n : null,
            changeCents: method === 'CASH' ? 2000n - BigInt(product.sellingPriceCents) : null,
            manuallyConfirmed: true,
            actorId: a.id,
            recordedAt: now,
            cashSessionId: currentSessionId,
            operationId: op,
          },
          select: { id: true },
        });
        payments.push(p.id);
        await tx.order.update({
          where: { id: draft.targetId },
          data: { version: { increment: 1 } },
          select: { id: true },
        });
        return { targetId: draft.targetId };
      },
    );
    if (method === 'CASH' || method === 'CREDIT_CARD') {
      await sales.progress(
        principal,
        randomUUID(),
        draft.targetId,
        { version: await version(), to: 'PREPARING' },
        'cash-upgrade-prepare',
      );
      await sales.progress(
        principal,
        randomUUID(),
        draft.targetId,
        { version: await version(), to: 'READY' },
        'cash-upgrade-ready',
      );
      await sales.handover(
        principal,
        randomUUID(),
        draft.targetId,
        { version: await version() },
        'cash-upgrade-handover',
      );
    }
  }
  await inv.command(
    principal,
    'ORDER_REFUND',
    randomUUID(),
    { orderId: orders[0] },
    'cash-upgrade-refund',
    async (tx, a, op) => {
      await tx.refund.create({
        data: {
          orderId: orders[0]!,
          paymentId: payments[0]!,
          amountCents: BigInt(product.sellingPriceCents),
          method: 'CASH',
          reason: 'CUSTOMER_REQUEST',
          externalRefundConfirmed: true,
          actorId: a.id,
          recordedAt: now,
          cashSessionId: currentSessionId,
          operationId: op,
        },
        select: { id: true },
      });
      await tx.order.update({
        where: { id: orders[0]! },
        data: { version: { increment: 1 } },
        select: { id: true },
      });
      return { targetId: orders[0]! };
    },
  );
  return {
    oldSessionId,
    currentSessionId,
    orders,
    payments,
    unitPrice: product.sellingPriceCents,
    actorId: user.id,
  };
}
