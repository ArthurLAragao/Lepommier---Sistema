import { z } from 'zod';
import {
  hasPermission,
  priceCart,
  pickupInstant,
  businessDateOf,
  businessDayRange,
  batchEligible,
  nameKey,
  orderCanTransition,
  orderDetailSchema,
  orderListSchema,
  orderSummary,
  cashCurrentSchema,
  saleCatalogSchema,
  saleProduct,
  customerHistorySchema,
  type Role,
  type draftInput,
  type draftEdit,
  type checkoutInput,
  type paymentInput,
  type confirmInput,
  type versionInput,
  type orderPaymentInput,
  type progressInput,
  type cancelInput,
  type refundInput,
  type cashOpenInput,
  type orderQuery,
  type stockQuery,
} from '@pommier/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AuthService, audit, type Principal, type SecurityEvent } from '../auth/service.js';
import { InventoryService } from '../inventory/service.js';
import { AppError } from '../errors.js';
import { cashPostingCheck } from '../cash/service.js';
type Tx = Prisma.TransactionClient;
type Actor = { id: string; role: Role };
const actorSelect = { displayName: true } as const;
const eventOrder: Prisma.OrderEventOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];
const summarySelect = {
  id: true,
  number: true,
  source: true,
  status: true,
  customer: { select: { id: true, name: true, active: true, anonymizedAt: true } },
  subtotalCents: true,
  discountCents: true,
  totalCents: true,
  pickupAt: true,
  createdAt: true,
  confirmedAt: true,
  fulfilledAt: true,
  cancelledAt: true,
  version: true,
  creator: { select: actorSelect },
  payment: { select: { id: true } },
  refund: { select: { id: true } },
} as const;
const financialSelect = {
  id: true,
  amountCents: true,
  method: true,
  recordedAt: true,
  cashSessionId: true,
  actor: { select: actorSelect },
} as const;
const itemSelect = {
  id: true,
  productId: true,
  productCode: true,
  productName: true,
  productVersion: true,
  quantity: true,
  unitPriceCents: true,
  subtotalCents: true,
  discountCents: true,
  totalCents: true,
} as const;
const detailSelect = {
  ...summarySelect,
  customerId: true,
  pickupPerson: true,
  collectionNote: true,
  notes: true,
  discountReason: true,
  cancelReason: true,
  preparingAt: true,
  readyAt: true,
  items: { select: itemSelect, orderBy: { productId: 'asc' as const } },
  payment: {
    select: { ...financialSelect, tenderedCents: true, changeCents: true, manuallyConfirmed: true },
  },
  refund: { select: { ...financialSelect, reason: true, externalRefundConfirmed: true } },
  events: {
    select: {
      id: true,
      type: true,
      state: true,
      reason: true,
      createdAt: true,
      actor: { select: actorSelect },
    },
    orderBy: eventOrder,
  },
} as const;
type OrderRow = Prisma.OrderGetPayload<{ select: typeof detailSelect }>;
const fail = (code: string, message: string, status = 409) => new AppError(status, code, message);
const transport = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? String(v) : v)));
const summary = (row: Prisma.OrderGetPayload<{ select: typeof summarySelect }>) =>
  orderSummary.parse(
    transport({ ...row, paymentState: row.refund ? 'REFUNDED' : row.payment ? 'PAID' : 'UNPAID' }),
  );
export class SalesService {
  readonly inventory: InventoryService;
  constructor(
    readonly auth: AuthService,
    readonly clock: () => Date,
  ) {
    this.inventory = new InventoryService(auth, clock);
  }
  async event(
    tx: Tx,
    actor: Actor,
    id: string,
    type: Extract<
      SecurityEvent,
      | 'ORDER_CREATED'
      | 'ORDER_EDITED'
      | 'ORDER_CONFIRMED'
      | 'ORDER_PREPARING'
      | 'ORDER_READY'
      | 'PAYMENT_RECORDED'
      | 'ORDER_FULFILLED'
      | 'ORDER_CANCELLED'
      | 'REFUND_RECORDED'
    >,
    state: OrderRow['status'],
    requestId: string,
    reason?: string,
  ) {
    await tx.orderEvent.create({
      data: {
        orderId: id,
        type,
        state,
        actorId: actor.id,
        createdAt: this.clock(),
        reason: reason ?? null,
      },
    });
    await audit(tx, type, requestId, actor.id, id, this.clock(), {
      state,
      ...(reason ? { reason } : {}),
    });
  }
  async currentCash(tx: Tx) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "CashSession" WHERE "closedAt" IS NULL ORDER BY "id" FOR UPDATE`;
    if (!rows[0])
      throw fail(
        'CASH_SESSION_REQUIRED',
        'Abra explicitamente uma sessão de caixa antes de registrar pagamento ou reembolso. A operação não foi registrada.',
      );
    return rows[0].id;
  }
  cash(principal: Principal) {
    return this.inventory.run(principal, 'orders.read', async (tx, actor) => {
      const session = await tx.cashSession.findFirst({
        where: { closedAt: null },
        select: {
          id: true,
          openedAt: true,
          openedBy: { select: actorSelect },
          ...(hasPermission(actor.role, 'cash.open') ? { openingFloatCents: true } : {}),
        },
      });
      return cashCurrentSchema.parse(transport({ session, limitedFoundation: false }));
    });
  }
  openCash(
    principal: Principal,
    key: string,
    input: z.infer<typeof cashOpenInput>,
    requestId: string,
  ) {
    return this.inventory.command(
      principal,
      'CASH_OPEN',
      key,
      input,
      requestId,
      async (tx, actor, op) => {
        if (await tx.cashSession.findFirst({ where: { closedAt: null }, select: { id: true } }))
          throw fail('CASH_ALREADY_OPEN', 'Já existe uma sessão aberta. Não foi criada outra.');
        const session = await tx.cashSession.create({
          data: {
            openedAt: this.clock(),
            openedById: actor.id,
            openingFloatCents: BigInt(input.openingFloatCents),
            operationId: op,
          },
          select: { id: true },
        });
        await audit(tx, 'CASH_OPENED', requestId, actor.id, session.id, this.clock());
        return { targetId: session.id, state: 'OPEN' };
      },
    );
  }
  async customer(tx: Tx, id: string | null | undefined) {
    if (!id) return;
    const customer = await tx.customer.findUnique({
      where: { id },
      select: { active: true, anonymizedAt: true },
    });
    if (!customer || !customer.active || customer.anonymizedAt)
      throw fail(
        'CUSTOMER_UNAVAILABLE',
        'Selecione um cliente ativo e não anonimizado; o histórico anterior será preservado.',
      );
  }
  pickup(input: z.infer<typeof draftInput>, checkFuture = true) {
    if (!input.pickupLocal) return null;
    const instant = pickupInstant(input.pickupLocal);
    if (
      checkFuture &&
      (instant <= this.clock() || instant.getTime() > this.clock().getTime() + 365 * 86400000)
    )
      throw fail(
        'PICKUP_TIME',
        'Escolha uma retirada futura, em até 365 dias, no horário de Fortaleza.',
        400,
      );
    return instant;
  }
  async price(tx: Tx, actor: Actor, input: z.infer<typeof draftInput>) {
    const products = await tx.product.findMany({
      where: { id: { in: input.lines.map((l) => l.productId) } },
      select: {
        id: true,
        code: true,
        name: true,
        active: true,
        version: true,
        sellingPriceCents: true,
      },
    });
    const lines = input.lines.map((line) => {
      const p = products.find((p) => p.id === line.productId);
      if (!p || !p.active)
        throw fail(
          'PRODUCT_UNAVAILABLE',
          'Um produto está desativado ou indisponível. Revise o carrinho.',
        );
      if (p.version !== line.productVersion || p.sellingPriceCents !== line.unitPriceCents)
        throw fail(
          'PRICE_REVIEW_REQUIRED',
          'Preço ou versão do produto mudou. Atualize o catálogo e revise o carrinho antes de confirmar.',
        );
      return { ...line, productCode: p.code, productName: p.name };
    });
    if (BigInt(input.discountCents) > 0n && !hasPermission(actor.role, 'orders.discount'))
      throw fail('DISCOUNT_FORBIDDEN', 'Seu perfil não pode conceder desconto.', 403);
    let priced: ReturnType<typeof priceCart>;
    try {
      priced = priceCart(lines, input.discountCents);
    } catch {
      throw fail(
        'ORDER_MONEY_LIMIT',
        'Revise o desconto e o total: limite de R$ 999.999,99 por pedido.',
        400,
      );
    }
    return { ...priced, lines: lines.map((line, i) => ({ ...line, ...priced.lines[i]! })) };
  }
  async createTx(tx: Tx, actor: Actor, input: z.infer<typeof draftInput>, requestId: string) {
    await this.customer(tx, input.customerId);
    const pickupAt = this.pickup(input);
    const priced = await this.price(tx, actor, input);
    const order = await tx.order.create({
      data: {
        source: input.source,
        customerId: input.customerId ?? null,
        pickupAt,
        pickupPerson: input.pickupPerson ?? null,
        collectionNote: input.collectionNote ?? null,
        notes: input.notes ?? null,
        discountReason: BigInt(input.discountCents) > 0n ? input.discountReason! : null,
        subtotalCents: BigInt(priced.subtotalCents),
        discountCents: BigInt(priced.discountCents),
        totalCents: BigInt(priced.totalCents),
        creatorId: actor.id,
        createdAt: this.clock(),
        items: {
          create: priced.lines.map((line) => ({
            productId: line.productId,
            productCode: line.productCode,
            productName: line.productName,
            productVersion: line.productVersion,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            subtotalCents: BigInt(line.subtotalCents),
            discountCents: BigInt(line.discountCents),
            totalCents: BigInt(line.totalCents),
          })),
        },
      },
      select: detailSelect,
    });
    await this.event(tx, actor, order.id, 'ORDER_CREATED', 'DRAFT', requestId);
    return order;
  }
  create(principal: Principal, key: string, input: z.infer<typeof draftInput>, requestId: string) {
    return this.inventory.command(
      principal,
      'ORDER_CREATE',
      key,
      input,
      requestId,
      async (tx, actor) => {
        await this.inventory.lockProducts(
          tx,
          input.lines.map((l) => l.productId),
        );
        const order = await this.createTx(tx, actor, input, requestId);
        return { targetId: order.id, state: 'DRAFT' };
      },
    );
  }
  async lockOrder(tx: Tx, id: string, version: number) {
    const order = await tx.order.findUnique({ where: { id }, select: detailSelect });
    if (!order) throw fail('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
    await this.inventory.lockProducts(
      tx,
      order.items.map((i) => i.productId),
    );
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${id}::uuid FOR UPDATE`;
    if (order.version !== version)
      throw fail('ORDER_STALE', 'Este pedido mudou. Feche, recarregue e revise a versão atual.');
    return order;
  }
  async lockStock(tx: Tx, order: OrderRow) {
    await tx.$queryRaw`SELECT r."id" FROM "InventoryReservation" r JOIN "OrderItem" i ON i."id"=r."orderItemId" WHERE i."orderId"=${order.id}::uuid ORDER BY r."id" FOR UPDATE OF r`;
    await this.inventory.lockBatches(
      tx,
      order.items.map((i) => i.productId),
    );
  }
  edit(
    principal: Principal,
    key: string,
    id: string,
    input: z.infer<typeof draftEdit>,
    requestId: string,
  ) {
    return this.inventory.command(
      principal,
      'ORDER_EDIT',
      key,
      { id, ...input },
      requestId,
      async (tx, actor) => {
        const current = await tx.order.findUnique({
          where: { id },
          select: { items: { select: { productId: true } } },
        });
        if (!current) throw fail('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
        await this.inventory.lockProducts(
          tx,
          [...current.items.map((i) => i.productId), ...input.draft.lines.map((i) => i.productId)],
          40,
        );
        const order = await this.lockOrder(tx, id, input.version);
        if (order.status !== 'DRAFT')
          throw fail(
            'ORDER_FROZEN',
            'Somente rascunhos podem ser editados. Cancele e recrie um pedido confirmado.',
          );
        await this.customer(tx, input.draft.customerId);
        const pickupAt = this.pickup(input.draft);
        const priced = await this.price(tx, actor, input.draft);
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.order.update({
          where: { id },
          data: {
            source: input.draft.source,
            customerId: input.draft.customerId ?? null,
            pickupAt,
            pickupPerson: input.draft.pickupPerson ?? null,
            collectionNote: input.draft.collectionNote ?? null,
            notes: input.draft.notes ?? null,
            subtotalCents: BigInt(priced.subtotalCents),
            discountCents: BigInt(priced.discountCents),
            totalCents: BigInt(priced.totalCents),
            discountReason: BigInt(priced.discountCents) > 0n ? input.draft.discountReason! : null,
            version: { increment: 1 },
            items: {
              create: priced.lines.map((line) => ({
                productId: line.productId,
                productCode: line.productCode,
                productName: line.productName,
                productVersion: line.productVersion,
                quantity: line.quantity,
                unitPriceCents: line.unitPriceCents,
                subtotalCents: BigInt(line.subtotalCents),
                discountCents: BigInt(line.discountCents),
                totalCents: BigInt(line.totalCents),
              })),
            },
          },
        });
        await this.event(tx, actor, id, 'ORDER_EDITED', 'DRAFT', requestId);
        return { targetId: id, state: 'DRAFT' };
      },
    );
  }
  async confirmTx(tx: Tx, actor: Actor, order: OrderRow, requestId: string) {
    if (order.status !== 'DRAFT')
      throw fail('ORDER_STATE', 'Somente rascunhos podem ser confirmados.');
    if (order.totalCents <= 0n)
      throw fail(
        'ZERO_TOTAL_UNSUPPORTED',
        'Venda sem cobrança não é suportada nesta fase. Não crie um recebimento fictício.',
        400,
      );
    await this.customer(tx, order.customerId);
    if (order.discountCents > 0n && !hasPermission(actor.role, 'orders.discount'))
      throw fail(
        'DISCOUNT_FORBIDDEN',
        'A confirmação de desconto exige proprietário ou gerente.',
        403,
      );
    if (
      order.pickupAt &&
      (order.pickupAt <= this.clock() ||
        order.pickupAt.getTime() > this.clock().getTime() + 365 * 86400000)
    )
      throw fail(
        'PICKUP_TIME',
        'A retirada agendada passou ou está fora do limite. Edite e revise o rascunho.',
        400,
      );
    for (const item of order.items) {
      const p = await tx.product.findUnique({
        where: { id: item.productId },
        select: { active: true, version: true, sellingPriceCents: true },
      });
      if (!p?.active) throw fail('PRODUCT_UNAVAILABLE', 'Produto desativado; revise o rascunho.');
      if (p.version !== item.productVersion || p.sellingPriceCents !== item.unitPriceCents)
        throw fail(
          'PRICE_REVIEW_REQUIRED',
          'Preço ou versão mudou desde o rascunho. Edite, atualize e revise antes de confirmar.',
        );
    }
    const through = businessDateOf(order.pickupAt ?? this.clock());
    for (const item of order.items)
      await this.inventory.reserveTx(
        tx,
        actor,
        {
          productId: item.productId,
          quantity: item.quantity,
          sourceNamespace: 'INTERNAL',
          sourceReference: item.id,
          eligibilityThrough: through,
        },
        requestId,
        item.id,
      );
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'CONFIRMED', confirmedAt: this.clock(), version: { increment: 1 } },
    });
    await this.event(tx, actor, order.id, 'ORDER_CONFIRMED', 'CONFIRMED', requestId);
  }
  confirm(
    principal: Principal,
    key: string,
    id: string,
    input: z.infer<typeof confirmInput>,
    requestId: string,
  ) {
    return this.inventory.command(
      principal,
      'ORDER_CONFIRM',
      key,
      { id, ...input },
      requestId,
      async (tx, actor) => {
        const order = await this.lockOrder(tx, id, input.version);
        if (order.totalCents !== BigInt(input.expectedTotalCents))
          throw fail(
            'TOTAL_REVIEW_REQUIRED',
            'O total confirmado não corresponde ao pedido. Recarregue e revise.',
          );
        await this.lockStock(tx, order);
        await this.confirmTx(tx, actor, order, requestId);
        return { targetId: id, state: 'CONFIRMED' };
      },
    );
  }
  async paymentTx(
    tx: Tx,
    actor: Actor,
    order: OrderRow,
    input: z.infer<typeof paymentInput>,
    sessionId: string,
    operationId: string,
    requestId: string,
  ) {
    if (
      !['CONFIRMED', 'PREPARING', 'READY'].includes(order.status) ||
      order.payment ||
      order.refund
    )
      throw fail('PAYMENT_STATE', 'Este pedido não aceita outro pagamento. Consulte o histórico.');
    if (order.totalCents <= 0n || BigInt(input.amountCents) !== order.totalCents)
      throw fail(
        'PAYMENT_AMOUNT',
        'Registre exatamente o valor integral do pedido, sem parcelas ou divisão.',
        400,
      );
    let tender: bigint | null = null;
    let change: bigint | null = null;
    if (input.method === 'CASH') {
      if (
        input.tenderedCents === undefined ||
        input.tenderedCents === null ||
        BigInt(input.tenderedCents) < order.totalCents
      )
        throw fail('CASH_TENDER', 'O dinheiro recebido deve cobrir o total integral.', 400);
      tender = BigInt(input.tenderedCents);
      change = tender - order.totalCents;
    } else if (input.tenderedCents !== undefined && input.tenderedCents !== null)
      throw fail('PAYMENT_METHOD', 'Pix e cartão não têm dinheiro recebido/troco em espécie.', 400);
    await cashPostingCheck(tx, sessionId, order.totalCents, 'PAYMENT', input.method);
    await tx.payment.create({
      data: {
        orderId: order.id,
        amountCents: order.totalCents,
        method: input.method,
        tenderedCents: tender,
        changeCents: change,
        manuallyConfirmed: input.manuallyConfirmed,
        actorId: actor.id,
        recordedAt: this.clock(),
        cashSessionId: sessionId,
        operationId,
      },
      select: { id: true },
    });
    await tx.order.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
    await this.event(tx, actor, order.id, 'PAYMENT_RECORDED', order.status, requestId);
  }
  pay(
    principal: Principal,
    key: string,
    id: string,
    input: z.infer<typeof orderPaymentInput>,
    requestId: string,
  ) {
    return this.inventory.command(
      principal,
      'ORDER_PAY',
      key,
      { id, ...input },
      requestId,
      async (tx, actor, op) => {
        const order = await this.lockOrder(tx, id, input.version);
        const session = await this.currentCash(tx);
        await this.paymentTx(tx, actor, order, input.payment, session, op, requestId);
        return { targetId: id, state: 'PAID' };
      },
    );
  }
  progress(
    principal: Principal,
    key: string,
    id: string,
    input: z.infer<typeof progressInput>,
    requestId: string,
  ) {
    return this.inventory.command(
      principal,
      input.to === 'READY' ? 'ORDER_READY' : 'ORDER_PREPARE',
      key,
      { id, ...input },
      requestId,
      async (tx, actor) => {
        const order = await this.lockOrder(tx, id, input.version);
        if (!orderCanTransition(order.status, input.to))
          throw fail('ORDER_STATE', 'Esta transição não é permitida. Recarregue o pedido.');
        await tx.order.update({
          where: { id },
          data: {
            status: input.to,
            version: { increment: 1 },
            ...(input.to === 'READY' ? { readyAt: this.clock() } : { preparingAt: this.clock() }),
          },
        });
        await this.event(
          tx,
          actor,
          id,
          input.to === 'READY' ? 'ORDER_READY' : 'ORDER_PREPARING',
          input.to,
          requestId,
        );
        return { targetId: id, state: input.to };
      },
    );
  }
  async reservationActionTx(
    tx: Tx,
    actor: Actor,
    order: OrderRow,
    op: string,
    action: 'CONSUME' | 'RELEASE',
    requestId: string,
  ) {
    for (const item of order.items) {
      const reservation = await tx.inventoryReservation.findUnique({
        where: { orderItemId: item.id },
        select: {
          id: true,
          productId: true,
          quantity: true,
          sourceNamespace: true,
          sourceReference: true,
        },
      });
      if (
        !reservation ||
        reservation.productId !== item.productId ||
        reservation.quantity !== item.quantity ||
        reservation.sourceNamespace !== 'ORDER' ||
        reservation.sourceReference !== item.id
      )
        throw fail(
          'ORDER_RESERVATION_INTEGRITY',
          'A reserva não corresponde ao pedido. Solicite revisão; não houve movimentação parcial.',
        );
      await this.inventory.reservationChangeTx(
        tx,
        actor,
        op,
        action,
        { reservationId: reservation.id, sourceNamespace: 'ORDER', sourceReference: item.id },
        requestId,
      );
    }
  }
  async handoverTx(
    tx: Tx,
    actor: Actor,
    order: OrderRow,
    op: string,
    requestId: string,
    immediate = false,
  ) {
    if ((!immediate && order.status !== 'READY') || (immediate && order.status !== 'CONFIRMED'))
      throw fail('ORDER_STATE', 'Marque o pedido como pronto antes de entregar.');
    if (!order.payment || order.refund)
      throw fail(
        'PAYMENT_REQUIRED',
        'A entrega exige um pagamento integral registrado e não reembolsado.',
      );
    await this.reservationActionTx(tx, actor, order, op, 'CONSUME', requestId);
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'FULFILLED', fulfilledAt: this.clock(), version: { increment: 1 } },
    });
    await this.event(tx, actor, order.id, 'ORDER_FULFILLED', 'FULFILLED', requestId);
  }
  handover(
    principal: Principal,
    key: string,
    id: string,
    input: z.infer<typeof versionInput>,
    requestId: string,
  ) {
    return this.inventory.command(
      principal,
      'ORDER_HANDOVER',
      key,
      { id, ...input },
      requestId,
      async (tx, actor, op) => {
        const order = await this.lockOrder(tx, id, input.version);
        await this.lockStock(tx, order);
        await this.handoverTx(tx, actor, order, op, requestId);
        return { targetId: id, state: 'FULFILLED' };
      },
    );
  }
  checkout(
    principal: Principal,
    key: string,
    input: z.infer<typeof checkoutInput>,
    requestId: string,
  ) {
    return this.inventory.command(
      principal,
      'SALE_CHECKOUT',
      key,
      input,
      requestId,
      async (tx, actor, op) => {
        await this.inventory.lockProducts(
          tx,
          input.draft.lines.map((l) => l.productId),
        );
        const order = await this.createTx(tx, actor, input.draft, requestId);
        const session = await this.currentCash(tx);
        await this.lockStock(tx, order);
        await this.confirmTx(tx, actor, order, requestId);
        const confirmed = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
          select: detailSelect,
        });
        await this.paymentTx(tx, actor, confirmed, input.payment, session, op, requestId);
        const paid = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
          select: detailSelect,
        });
        await this.handoverTx(tx, actor, paid, op, requestId, true);
        return { targetId: order.id, state: 'FULFILLED' };
      },
    );
  }
  async refundTx(
    tx: Tx,
    actor: Actor,
    order: OrderRow,
    op: string,
    reason: string,
    confirmed: boolean | undefined,
    session: string,
    requestId: string,
  ) {
    if (!hasPermission(actor.role, 'orders.refund'))
      throw fail('REFUND_FORBIDDEN', 'Somente o proprietário pode aprovar este reembolso.', 403);
    if (!confirmed)
      throw fail(
        'REFUND_CONFIRMATION',
        'Confirme que o reembolso integral externo foi realizado. O sistema registra, não executa devoluções.',
        400,
      );
    if (!order.payment || order.refund)
      throw fail('REFUND_STATE', 'Não há pagamento elegível para um novo reembolso.');
    await cashPostingCheck(tx, session, order.payment.amountCents, 'REFUND', order.payment.method);
    await tx.refund.create({
      data: {
        orderId: order.id,
        paymentId: order.payment.id,
        amountCents: order.payment.amountCents,
        method: order.payment.method,
        reason,
        externalRefundConfirmed: true,
        actorId: actor.id,
        recordedAt: this.clock(),
        cashSessionId: session,
        operationId: op,
      },
      select: { id: true },
    });
    await this.event(tx, actor, order.id, 'REFUND_RECORDED', order.status, requestId, reason);
  }
  cancel(
    principal: Principal,
    key: string,
    id: string,
    input: z.infer<typeof cancelInput>,
    requestId: string,
  ) {
    return this.inventory.command(
      principal,
      'ORDER_CANCEL',
      key,
      { id, ...input },
      requestId,
      async (tx, actor, op) => {
        const order = await this.lockOrder(tx, id, input.version);
        if (!orderCanTransition(order.status, 'CANCELLED'))
          throw fail(
            'ORDER_STATE',
            'Pedido entregue ou cancelado não pode ser cancelado novamente.',
          );
        if (order.payment) {
          if (!hasPermission(actor.role, 'orders.refund'))
            throw fail(
              'REFUND_FORBIDDEN',
              'Cancelamento pago exige reembolso integral aprovado pelo proprietário.',
              403,
            );
          const session = await this.currentCash(tx);
          await this.refundTx(
            tx,
            actor,
            order,
            op,
            input.reason,
            input.externalRefundConfirmed,
            session,
            requestId,
          );
        }
        await this.lockStock(tx, order);
        if (order.confirmedAt)
          await this.reservationActionTx(tx, actor, order, op, 'RELEASE', requestId);
        await tx.order.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt: this.clock(),
            cancelReason: input.reason,
            version: { increment: 1 },
          },
        });
        await this.event(tx, actor, id, 'ORDER_CANCELLED', 'CANCELLED', requestId, input.reason);
        return { targetId: id, state: 'CANCELLED' };
      },
    );
  }
  refund(
    principal: Principal,
    key: string,
    id: string,
    input: z.infer<typeof refundInput>,
    requestId: string,
  ) {
    return this.inventory.command(
      principal,
      'ORDER_REFUND',
      key,
      { id, ...input },
      requestId,
      async (tx, actor, op) => {
        const order = await this.lockOrder(tx, id, input.version);
        if (order.status !== 'FULFILLED')
          throw fail('REFUND_STATE', 'Para pedido pago não entregue, use cancelar com reembolso.');
        const session = await this.currentCash(tx);
        await this.refundTx(
          tx,
          actor,
          order,
          op,
          input.reason,
          input.externalRefundConfirmed,
          session,
          requestId,
        );
        await tx.order.update({ where: { id }, data: { version: { increment: 1 } } });
        return { targetId: id, state: 'REFUNDED' };
      },
    );
  }
  list(principal: Principal, query: z.infer<typeof orderQuery>) {
    return this.inventory.run(principal, 'orders.read', (tx) => this.listTx(tx, query));
  }
  async listTx(tx: Tx, query: z.infer<typeof orderQuery>) {
    const number = /^(?:PED-)?\d+$/i.test(query.q) ? Number(query.q.replace(/^PED-/i, '')) : null;
    const where: Prisma.OrderWhereInput = {
      ...(query.source ? { source: query.source } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.payment === 'UNPAID'
        ? { payment: null }
        : query.payment === 'PAID'
          ? { payment: { isNot: null }, refund: null }
          : query.payment === 'REFUNDED'
            ? { refund: { isNot: null } }
            : {}),
      ...(query.pickupFrom || query.pickupTo
        ? {
            pickupAt: {
              ...(query.pickupFrom ? { gte: businessDayRange(query.pickupFrom).start } : {}),
              ...(query.pickupTo ? { lt: businessDayRange(query.pickupTo).end } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              ...(number !== null && Number.isSafeInteger(number) && number <= 2147483647
                ? [{ number }]
                : []),
              { customer: { nameKey: { contains: nameKey(query.q) } } },
            ],
          }
        : {}),
    };
    const items = await tx.order.findMany({
      where,
      select: summarySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * 20,
      take: 20,
    });
    return orderListSchema.parse({
      items: items.map(summary),
      total: await tx.order.count({ where }),
      page: query.page,
      pageSize: 20,
    });
  }
  detail(principal: Principal, id: string) {
    return this.inventory.run(principal, 'orders.read', async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, select: detailSelect });
      if (!order) throw fail('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
      const reservations = await tx.inventoryReservation.findMany({
        where: { orderItem: { orderId: id }, status: 'ACTIVE' },
        select: {
          productId: true,
          quantity: true,
          eligibilityThrough: true,
          product: { select: { active: true } },
          allocations: { select: { batch: { select: { id: true, expiresAt: true } } } },
        },
      });
      const issues: Array<{
        productId: string;
        quantity: number;
        code: 'EXPIRED' | 'PRODUCT_INACTIVE' | 'INCONSISTENT';
      }> = [];
      for (const r of reservations) {
        let code: 'EXPIRED' | 'PRODUCT_INACTIVE' | 'INCONSISTENT' | null = r.product.active
          ? null
          : 'PRODUCT_INACTIVE';
        for (const a of r.allocations) {
          if (
            !batchEligible(
              a.batch.expiresAt?.toISOString().slice(0, 10) ?? null,
              this.inventory.today(),
              r.eligibilityThrough.toISOString().slice(0, 10),
            )
          )
            code = 'EXPIRED';
          try {
            await this.inventory.checkedBatch(tx, a.batch.id);
          } catch (error) {
            if (!(error instanceof AppError)) throw error;
            code = 'INCONSISTENT';
          }
        }
        if (code) issues.push({ productId: r.productId, quantity: r.quantity, code });
      }
      return orderDetailSchema.parse(
        transport({
          order: {
            ...order,
            paymentState: order.refund ? 'REFUNDED' : order.payment ? 'PAID' : 'UNPAID',
            reservationIssues: issues,
          },
        }),
      );
    });
  }
  async catalogTx(tx: Tx, query: z.infer<typeof stockQuery>, id?: string) {
    const where: Prisma.ProductWhereInput = {
      ...(id
        ? { id }
        : {
            active: true,
            ...(query.categoryId ? { categoryId: query.categoryId } : {}),
            OR: [
              { nameKey: { contains: nameKey(query.q) } },
              { code: { contains: query.q.toUpperCase() } },
            ],
          }),
    };
    const products = await tx.product.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        active: true,
        version: true,
        sellingPriceCents: true,
        categoryId: true,
        batches: { select: { id: true, expiresAt: true } },
      },
      orderBy: [{ nameKey: 'asc' }, { id: 'asc' }],
      skip: id ? 0 : (query.page - 1) * 20,
      take: id ? 1 : 20,
    });
    const items = [];
    for (const p of products) {
      let available = 0n;
      let consistent = true;
      for (const batch of p.batches) {
        try {
          const b = await this.inventory.checkedBatch(tx, batch.id);
          if (
            batchEligible(
              batch.expiresAt?.toISOString().slice(0, 10) ?? null,
              this.inventory.today(),
            )
          )
            available += b.physical - b.reserved;
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          consistent = false;
        }
      }
      const { batches, ...fields } = p;
      void batches;
      items.push({
        ...fields,
        available: String(consistent && p.active ? available : 0n),
        consistent,
      });
    }
    return { items, total: await tx.product.count({ where }), page: query.page, pageSize: 20 };
  }
  catalog(principal: Principal, query: z.infer<typeof stockQuery>) {
    return this.inventory.run(principal, 'orders.read', async (tx) =>
      saleCatalogSchema.parse(await this.catalogTx(tx, query)),
    );
  }
  product(principal: Principal, id: string) {
    return this.inventory.run(principal, 'orders.read', async (tx) => {
      const result = await this.catalogTx(tx, { q: '', page: 1, state: 'active' }, id);
      if (!result.items[0]) throw fail('PRODUCT_UNAVAILABLE', 'Produto não encontrado.', 404);
      return saleProduct.parse(result.items[0]);
    });
  }
  customerHistory(principal: Principal, id: string, page: number) {
    return this.inventory.run(principal, 'orders.read', async (tx, actor) => {
      if (!hasPermission(actor.role, 'customers.read'))
        throw fail('FORBIDDEN', 'Este perfil não pode consultar o histórico de clientes.', 403);
      const customer = await tx.customer.findUnique({ where: { id }, select: { active: true } });
      if (!customer || (!customer.active && !hasPermission(actor.role, 'customers.manage')))
        throw fail('CUSTOMER_UNAVAILABLE', 'Cliente não disponível para este perfil.', 404);
      const orders = await this.listTx(tx, { q: '', page, customerId: id });
      const [totals] = await tx.$queryRaw<
        Array<{ fulfilled: string; payments: string; refunds: string; last: Date | null }>
      >`SELECT COALESCE(SUM(o."totalCents") FILTER (WHERE o."status"='FULFILLED'),0)::text AS fulfilled,COALESCE(SUM(p."amountCents"),0)::text AS payments,COALESCE(SUM(r."amountCents"),0)::text AS refunds,MAX(o."fulfilledAt") AS last FROM "Order" o LEFT JOIN "Payment" p ON p."orderId"=o."id" LEFT JOIN "Refund" r ON r."orderId"=o."id" WHERE o."customerId"=${id}::uuid`;
      return customerHistorySchema.parse(
        transport({
          orders,
          fulfilledTotalCents: totals!.fulfilled,
          paymentsReceivedCents: totals!.payments,
          refundsCents: totals!.refunds,
          lastFulfilledAt: totals!.last,
        }),
      );
    });
  }
}
