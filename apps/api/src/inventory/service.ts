import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  MAX_BATCH_UNITS,
  batchEligible,
  businessDateOf,
  canonicalCommand,
  fefoCompare,
  hasPermission,
  movementDirection,
  nameKey,
  operationResultSchema,
  productionCanTransition,
  stockAmounts,
  yieldShortfall,
  type Permission,
  type Role,
  type StockMovementType,
  type OperationResult,
  type openingInput,
  type receiptInput,
  type planInput,
  type productionTransition,
  type completeInput,
  type wasteInput,
  type adjustmentInput,
  type stockQuery,
  type productionQuery,
  reserveInput,
  reservationAction,
  businessDateSchema,
  type stockItemSchema,
} from '@pommier/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AuthService, audit, type Principal } from '../auth/service.js';
import { AppError } from '../errors.js';
type Tx = Prisma.TransactionClient;
type Actor = { id: string; role: Role };
type Kind =
  | 'SALE_CHECKOUT'
  | 'ORDER_CREATE'
  | 'ORDER_EDIT'
  | 'ORDER_CONFIRM'
  | 'ORDER_PREPARE'
  | 'ORDER_READY'
  | 'ORDER_PAY'
  | 'ORDER_HANDOVER'
  | 'ORDER_CANCEL'
  | 'ORDER_REFUND'
  | 'CASH_OPEN'
  | 'CASH_MOVEMENT'
  | 'CASH_CLOSE'
  | 'CASH_REVIEW'
  | 'CASH_REVERSE'
  | 'OPENING'
  | 'RECEIPT'
  | 'PLAN'
  | 'START'
  | 'CANCEL'
  | 'COMPLETE'
  | 'WASTE'
  | 'ADJUST'
  | 'RESERVE'
  | 'RESERVE_MULTI'
  | 'RELEASE'
  | 'CONSUME';
const permissionFor: Record<Kind, Permission> = {
  SALE_CHECKOUT: 'orders.checkout',
  ORDER_CREATE: 'orders.write',
  ORDER_EDIT: 'orders.write',
  ORDER_CONFIRM: 'orders.write',
  ORDER_PREPARE: 'orders.write',
  ORDER_READY: 'orders.write',
  ORDER_PAY: 'orders.pay',
  ORDER_HANDOVER: 'orders.handover',
  ORDER_CANCEL: 'orders.cancel',
  ORDER_REFUND: 'orders.refund',
  CASH_OPEN: 'cash.open',
  CASH_MOVEMENT: 'cash.movements',
  CASH_CLOSE: 'cash.close',
  CASH_REVIEW: 'cash.review',
  CASH_REVERSE: 'cash.correct',
  OPENING: 'inventory.opening',
  RECEIPT: 'inventory.receive',
  PLAN: 'production.manage',
  START: 'production.manage',
  CANCEL: 'production.manage',
  COMPLETE: 'production.manage',
  WASTE: 'inventory.waste',
  ADJUST: 'inventory.adjust',
  RESERVE: 'inventory.reservations',
  RESERVE_MULTI: 'inventory.reservations',
  RELEASE: 'inventory.reservations',
  CONSUME: 'inventory.reservations',
};
const productSelect = { id: true, code: true, name: true, active: true, origin: true } as const;
const batchSelect = {
  id: true,
  number: true,
  productId: true,
  reference: true,
  source: true,
  recordedAt: true,
  expiresAt: true,
  expiryUnknownReason: true,
  notes: true,
  version: true,
  physical: true,
  reserved: true,
  actor: { select: { displayName: true } },
} as const;
const productionSelect = {
  id: true,
  product: { select: productSelect },
  plannedQuantity: true,
  actualQuantity: true,
  plannedDate: true,
  status: true,
  notes: true,
  version: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  cancelledAt: true,
  cancelReason: true,
  batchId: true,
  actor: { select: { displayName: true } },
} as const;
const fail = (code: string, message: string, status = 409) => new AppError(status, code, message);
const missing = () =>
  fail('STOCK_RECORD_NOT_FOUND', 'Este registro de estoque não foi encontrado.', 404);
const stale = () =>
  fail('STOCK_STALE', 'O saldo ou registro mudou. Recarregue e revise antes de confirmar.');
const dateOnly = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;
export function transientInventoryError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false;
  const code = 'code' in error ? error.code : undefined;
  if (code === 'P2034' || code === '40001' || code === '40P01') return true;
  // Inspect only known driver wrapping fields, with a bounded depth even for cyclic errors.
  for (const field of ['cause', 'meta', 'driverAdapterError'] as const)
    if (
      field in error &&
      transientInventoryError((error as Record<string, unknown>)[field], depth + 1)
    )
      return true;
  return false;
}
export class InventoryService {
  constructor(
    readonly auth: AuthService,
    readonly clock: () => Date,
  ) {}
  today() {
    return businessDateOf(this.clock());
  }
  async run<T>(
    principal: Principal,
    permission: Permission,
    fn: (tx: Tx, actor: Actor) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++)
      try {
        return await this.auth.withPermission(principal, permission, fn);
      } catch (error) {
        if (attempt < 2 && transientInventoryError(error)) {
          await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
          continue;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw fail(
            'STOCK_UNIQUE_CONFLICT',
            'A referência já foi usada para este produto ou operação. Revise o histórico; nenhum saldo foi duplicado.',
          );
        throw error;
      }
  }
  async command(
    principal: Principal,
    kind: Kind,
    key: string,
    payload: unknown,
    requestId: string,
    fn: (
      tx: Tx,
      actor: Actor,
      operationId: string,
    ) => Promise<Omit<OperationResult, 'operationId'>>,
  ) {
    return this.run(principal, permissionFor[kind], (tx, actor) =>
      this.commandTx(tx, actor, kind, key, payload, requestId, fn),
    );
  }
  /** Caller must hold securityLock and reauthorize before composing this in a future business transaction. */
  async commandTx(
    tx: Tx,
    actor: Actor,
    kind: Kind,
    key: string,
    payload: unknown,
    requestId: string,
    fn: (
      tx: Tx,
      actor: Actor,
      operationId: string,
    ) => Promise<Omit<OperationResult, 'operationId'>>,
  ): Promise<OperationResult> {
    if (!hasPermission(actor.role, permissionFor[kind]))
      throw fail('FORBIDDEN', 'Seu perfil não permite esta operação.', 403);
    const digest = createHash('sha256').update(canonicalCommand({ kind, payload })).digest('hex');
    const existing = await tx.inventoryOperation.findUnique({
      where: { actorId_key: { actorId: actor.id, key } },
      select: { id: true, kind: true, requestDigest: true, result: true },
    });
    if (existing) {
      if (existing.kind !== kind || existing.requestDigest !== digest)
        throw fail(
          'IDEMPOTENCY_MISMATCH',
          'Esta referência já foi usada com outros dados. Consulte o resultado original.',
        );
      if (!existing.result)
        throw fail(
          'OPERATION_PENDING',
          'Resultado ainda não confirmado. Repita a mesma solicitação.',
        );
      return operationResultSchema.parse(existing.result);
    }
    const operation = await tx.inventoryOperation.create({
      data: { actorId: actor.id, key, kind, requestDigest: digest, createdAt: this.clock() },
      select: { id: true },
    });
    const outcome = await fn(tx, actor, operation.id);
    const result = operationResultSchema.parse({ operationId: operation.id, ...outcome });
    await tx.inventoryOperation.update({
      where: { id: operation.id },
      data: { result, completedAt: this.clock() },
    });
    void requestId;
    return result;
  }
  lookup(
    principal: Principal,
    key: string,
    permission:
      'inventory.operations' | 'orders.operations' | 'cash.operations' = 'inventory.operations',
  ) {
    return this.run(principal, permission, async (tx, actor) => {
      const op = await tx.inventoryOperation.findUnique({
        where: { actorId_key: { actorId: actor.id, key } },
        select: { kind: true, result: true },
      });
      if (op && !hasPermission(actor.role, permissionFor[op.kind as Kind]))
        throw fail('FORBIDDEN', 'Seu perfil não permite consultar esta operação.', 403);
      return {
        found: Boolean(op?.result),
        result: op?.result ? operationResultSchema.parse(op.result) : null,
      };
    });
  }
  async lockProducts(tx: Tx, ids: string[], limit = 20) {
    const unique = [...new Set(ids)].sort();
    if (!unique.length || unique.length > limit)
      throw fail(
        'STOCK_PRODUCT_LIMIT',
        `Use de 1 a ${limit} produtos distintos por transação.`,
        400,
      );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(unique)}) ORDER BY "id" FOR UPDATE`,
    );
    const products = await tx.product.findMany({
      where: { id: { in: unique } },
      select: productSelect,
      orderBy: { id: 'asc' },
    });
    if (products.length !== unique.length) throw missing();
    return products;
  }
  async lockBatches(tx: Tx, productIds: string[]) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Batch" WHERE "productId" IN (${Prisma.join([...new Set(productIds)].sort())}) ORDER BY "id" FOR UPDATE`,
    );
  }
  active(product: { active: boolean }) {
    if (!product.active)
      throw fail(
        'PRODUCT_INACTIVE',
        'Produto desativado. Reative e revise o catálogo antes de receber ou produzir novas unidades.',
      );
  }
  async totals(tx: Tx, batchId: string) {
    const [ledger] = await tx.$queryRaw<
      Array<{ physical: string }>
    >`SELECT COALESCE(SUM(CASE WHEN "type" IN ('CONSUMPTION','WASTE','ADJUSTMENT_OUT') THEN -"quantity"::bigint ELSE "quantity"::bigint END),0)::text AS physical FROM "InventoryMovement" WHERE "batchId"=${batchId}::uuid`;
    const [alloc] = await tx.$queryRaw<
      Array<{ reserved: string }>
    >`SELECT COALESCE(SUM("allocated"::bigint-"released"-"consumed"),0)::text AS reserved FROM "ReservationAllocation" WHERE "batchId"=${batchId}::uuid`;
    return { physical: BigInt(ledger!.physical), reserved: BigInt(alloc!.reserved) };
  }
  async checkedBatch(tx: Tx, id: string, productId?: string, version?: number) {
    const batch = await tx.batch.findUnique({ where: { id }, select: batchSelect });
    if (!batch || (productId && batch.productId !== productId)) throw missing();
    if (version !== undefined && batch.version !== version) throw stale();
    const totals = await this.totals(tx, id);
    if (
      totals.physical !== batch.physical ||
      totals.reserved !== batch.reserved ||
      totals.physical < 0n ||
      totals.reserved < 0n ||
      totals.reserved > totals.physical
    )
      throw fail(
        'STOCK_RECONCILIATION_REQUIRED',
        'Saldo divergente do histórico. A operação foi bloqueada; solicite conciliação, sem ajuste automático.',
      );
    return batch;
  }
  async newBatch(
    tx: Tx,
    actor: Actor,
    productId: string,
    source: 'OPENING' | 'PRODUCTION' | 'PURCHASED' | 'ADJUSTMENT',
    input: z.infer<typeof openingInput>['batch'],
  ) {
    const today = this.today();
    if (source !== 'OPENING' && input.expiresAt !== null && input.expiresAt < today)
      throw fail(
        'BATCH_ALREADY_EXPIRED',
        'Novas unidades de produção, compra ou ajuste positivo precisam de validade não vencida. Conte unidades antigas pelo saldo inicial.',
        400,
      );
    if (input.expiresAt === null && !input.expiryUnknownReason)
      throw fail('EXPIRY_ACKNOWLEDGEMENT', 'Informe o motivo de validade desconhecida.', 400);
    return tx.batch.create({
      data: {
        productId,
        reference: input.reference,
        referenceKey: nameKey(input.reference),
        source,
        recordedAt: this.clock(),
        expiresAt: input.expiresAt ? new Date(`${input.expiresAt}T00:00:00Z`) : null,
        expiryUnknownReason: input.expiresAt ? null : input.expiryUnknownReason!,
        actorId: actor.id,
        notes: input.notes ?? null,
      },
      select: batchSelect,
    });
  }
  async move(
    tx: Tx,
    actor: Actor,
    operationId: string,
    batchId: string,
    type: StockMovementType,
    quantity: number,
    reason: string,
    notes?: string | null,
    correctsMovementId?: string,
    reservationId?: string,
  ) {
    const batch = await this.checkedBatch(tx, batchId);
    const after = batch.physical + BigInt(movementDirection(type)) * BigInt(quantity);
    if (after < batch.reserved || after < 0n)
      throw fail(
        'INSUFFICIENT_UNRESERVED_STOCK',
        'A quantidade excede o saldo físico não reservado. Resolva as reservas antes de retirar unidades.',
      );
    if (after > MAX_BATCH_UNITS)
      throw fail(
        'STOCK_CAPACITY',
        'O lote ultrapassaria o limite de 1 trilhão de unidades. Revise os registros.',
        400,
      );
    const movement = await tx.inventoryMovement.create({
      data: {
        productId: batch.productId,
        batchId,
        operationId,
        actorId: actor.id,
        type,
        quantity,
        reason,
        notes: notes ?? null,
        createdAt: this.clock(),
        ...(correctsMovementId ? { correctsMovementId } : {}),
        ...(reservationId ? { reservationId } : {}),
      },
      select: { id: true },
    });
    await tx.batch.update({
      where: { id: batchId },
      data: { physical: after, version: { increment: 1 } },
    });
    return { movementId: movement.id, before: batch.physical.toString(), after: after.toString() };
  }
  opening(
    principal: Principal,
    key: string,
    input: z.infer<typeof openingInput>,
    requestId: string,
  ) {
    return this.command(principal, 'OPENING', key, input, requestId, async (tx, actor, op) => {
      const [product] = await this.lockProducts(tx, [input.productId]);
      this.active(product!);
      const batch = await this.newBatch(tx, actor, input.productId, 'OPENING', input.batch);
      const movement = await this.move(
        tx,
        actor,
        op,
        batch.id,
        'OPENING',
        input.quantity,
        input.reason,
        input.batch.notes,
      );
      await audit(tx, 'STOCK_OPENED', requestId, actor.id, batch.id, this.clock(), {
        quantity: input.quantity,
        reason: input.reason,
        ...movement,
      });
      return { targetId: batch.id, batchId: batch.id };
    });
  }
  receipt(
    principal: Principal,
    key: string,
    input: z.infer<typeof receiptInput>,
    requestId: string,
  ) {
    return this.command(principal, 'RECEIPT', key, input, requestId, async (tx, actor, op) => {
      const [product] = await this.lockProducts(tx, [input.productId]);
      this.active(product!);
      if (product!.origin === 'PRODUCED')
        throw fail(
          'PRODUCT_ORIGIN',
          'Este produto é somente produzido. Corrija a origem no catálogo antes de receber uma compra.',
        );
      if (input.unitCostCents !== undefined && !hasPermission(actor.role, 'inventory.cost'))
        throw fail('COST_FORBIDDEN', 'Seu perfil não acessa custo de compra.', 403);
      const batch = await this.newBatch(tx, actor, input.productId, 'PURCHASED', input.batch);
      const receipt = await tx.purchasedProductReceipt.create({
        data: {
          productId: input.productId,
          batchId: batch.id,
          quantity: input.quantity,
          supplierReference: input.supplierReference,
          supplierBatch: input.supplierBatch ?? null,
          unitCostCents: input.unitCostCents ?? null,
          recordedAt: this.clock(),
          actorId: actor.id,
          notes: input.notes ?? null,
        },
        select: { id: true },
      });
      await this.move(
        tx,
        actor,
        op,
        batch.id,
        'PURCHASED_RECEIPT',
        input.quantity,
        'FINISHED_PRODUCT_RECEIPT',
      );
      await audit(tx, 'PURCHASED_RECEIVED', requestId, actor.id, receipt.id, this.clock(), {
        quantity: input.quantity,
        batchId: batch.id,
      });
      return { targetId: receipt.id, batchId: batch.id };
    });
  }
  plan(principal: Principal, key: string, input: z.infer<typeof planInput>, requestId: string) {
    return this.command(principal, 'PLAN', key, input, requestId, async (tx, actor) => {
      const [product] = await this.lockProducts(tx, [input.productId]);
      this.active(product!);
      if (product!.origin === 'PURCHASED')
        throw fail(
          'PRODUCT_ORIGIN',
          'Produto somente comprado não pode ser planejado para produção.',
        );
      const record = await tx.productionRecord.create({
        data: {
          productId: input.productId,
          actorId: actor.id,
          plannedQuantity: input.plannedQuantity,
          plannedDate: new Date(`${input.plannedDate}T00:00:00Z`),
          notes: input.notes ?? null,
          createdAt: this.clock(),
        },
        select: { id: true },
      });
      await audit(tx, 'PRODUCTION_PLANNED', requestId, actor.id, record.id, this.clock(), {
        quantity: input.plannedQuantity,
      });
      return { targetId: record.id, state: 'PLANNED' };
    });
  }
  transition(
    principal: Principal,
    key: string,
    id: string,
    input: z.infer<typeof productionTransition>,
    requestId: string,
  ) {
    return this.command(
      principal,
      input.action,
      key,
      { id, ...input },
      requestId,
      async (tx, actor) => {
        const record = await tx.productionRecord.findUnique({
          where: { id },
          select: { id: true, productId: true, status: true, version: true },
        });
        if (!record) throw missing();
        const [product] = await this.lockProducts(tx, [record.productId]);
        await tx.$queryRaw`SELECT "id" FROM "ProductionRecord" WHERE "id"=${id}::uuid FOR UPDATE`;
        if (record.version !== input.version) throw stale();
        const next = input.action === 'START' ? 'IN_PROGRESS' : 'CANCELLED';
        if (!productionCanTransition(record.status, next))
          throw fail(
            'PRODUCTION_STATE',
            'Esta produção não permite a transição. Conclusões são corrigidas por movimento compensatório autorizado.',
          );
        if (input.action === 'START') {
          this.active(product!);
          if (product!.origin === 'PURCHASED')
            throw fail(
              'PRODUCT_ORIGIN',
              'Corrija a origem do produto antes de iniciar a produção.',
            );
        }
        await tx.productionRecord.update({
          where: { id },
          data: {
            status: next,
            version: { increment: 1 },
            ...(next === 'IN_PROGRESS'
              ? { startedAt: this.clock() }
              : { cancelledAt: this.clock(), cancelReason: input.reason! }),
          },
        });
        await audit(
          tx,
          next === 'IN_PROGRESS' ? 'PRODUCTION_STARTED' : 'PRODUCTION_CANCELLED',
          requestId,
          actor.id,
          id,
          this.clock(),
          { ...(input.reason ? { reason: input.reason } : {}) },
        );
        return { targetId: id, state: next };
      },
    );
  }
  complete(
    principal: Principal,
    key: string,
    id: string,
    input: z.infer<typeof completeInput>,
    requestId: string,
  ) {
    return this.command(
      principal,
      'COMPLETE',
      key,
      { id, ...input },
      requestId,
      async (tx, actor, op) => {
        const record = await tx.productionRecord.findUnique({
          where: { id },
          select: { productId: true, status: true, version: true, plannedQuantity: true },
        });
        if (!record) throw missing();
        const [product] = await this.lockProducts(tx, [record.productId]);
        this.active(product!);
        await tx.$queryRaw`SELECT "id" FROM "ProductionRecord" WHERE "id"=${id}::uuid FOR UPDATE`;
        if (record.version !== input.version) throw stale();
        if (record.status !== 'IN_PROGRESS')
          throw fail(
            'PRODUCTION_STATE',
            'Somente produção em andamento pode ser concluída. Não houve nova entrada.',
          );
        if (product!.origin === 'PURCHASED')
          throw fail(
            'PRODUCT_ORIGIN',
            'A origem mudou para somente comprado. Corrija o catálogo ou cancele a produção; nenhum saldo foi recebido.',
          );
        const batch = await this.newBatch(tx, actor, record.productId, 'PRODUCTION', input.batch);
        await this.move(
          tx,
          actor,
          op,
          batch.id,
          'PRODUCTION_RECEIPT',
          input.actualQuantity,
          'PRODUCTION_COMPLETED',
        );
        await tx.productionRecord.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            actualQuantity: input.actualQuantity,
            batchId: batch.id,
            completedAt: this.clock(),
            version: { increment: 1 },
          },
        });
        await audit(tx, 'PRODUCTION_COMPLETED', requestId, actor.id, id, this.clock(), {
          quantity: input.actualQuantity,
          shortfall: yieldShortfall(record.plannedQuantity, input.actualQuantity),
          batchId: batch.id,
        });
        return { targetId: id, batchId: batch.id, state: 'COMPLETED' };
      },
    );
  }
  waste(principal: Principal, key: string, input: z.infer<typeof wasteInput>, requestId: string) {
    return this.command(principal, 'WASTE', key, input, requestId, async (tx, actor, op) => {
      await this.lockProducts(tx, [input.productId]);
      await this.lockBatches(tx, [input.productId]);
      const batch = await this.checkedBatch(tx, input.batchId, input.productId, input.version);
      if (actor.role === 'PRODUCTION' && batch.source !== 'PRODUCTION')
        throw fail(
          'WASTE_SCOPE',
          'Produção registra perda apenas de lotes recebidos de produção interna.',
          403,
        );
      if (
        input.reason === 'EXPIRED' &&
        (batch.expiresAt === null || dateOnly(batch.expiresAt)! >= this.today())
      )
        throw fail(
          'WASTE_REASON',
          'O motivo vencido exige validade conhecida anterior a hoje em Fortaleza.',
          400,
        );
      if (input.reason === 'PRODUCTION_FAILURE' && batch.source !== 'PRODUCTION')
        throw fail(
          'WASTE_REASON',
          'Falha de produção pronta se refere a lote de produção interna.',
          400,
        );
      const move = await this.move(
        tx,
        actor,
        op,
        batch.id,
        'WASTE',
        input.quantity,
        input.reason,
        input.notes,
      );
      await audit(tx, 'STOCK_WASTED', requestId, actor.id, batch.id, this.clock(), {
        quantity: input.quantity,
        reason: input.reason,
        ...move,
      });
      return { targetId: move.movementId, batchId: batch.id };
    });
  }
  adjust(
    principal: Principal,
    key: string,
    input: z.infer<typeof adjustmentInput>,
    requestId: string,
  ) {
    return this.command(principal, 'ADJUST', key, input, requestId, async (tx, actor, op) => {
      const [product] = await this.lockProducts(tx, [input.productId]);
      await this.lockBatches(tx, [input.productId]);
      const batch = input.batchId
        ? await this.checkedBatch(tx, input.batchId, input.productId, input.version)
        : await this.newBatch(tx, actor, input.productId, 'ADJUSTMENT', input.newBatch!);
      if (input.direction === 'IN') {
        this.active(product!);
        if (!batchEligible(dateOnly(batch.expiresAt), this.today()))
          throw fail(
            'BATCH_EXPIRED',
            'Ajuste positivo exige lote elegível; não altere a validade do histórico.',
          );
      }
      if (input.correctsMovementId) {
        const original = await tx.inventoryMovement.findUnique({
          where: { id: input.correctsMovementId },
          select: { productId: true, type: true },
        });
        if (!original || original.productId !== input.productId)
          throw fail(
            'CORRECTION_REFERENCE',
            'O movimento original deve pertencer ao mesmo produto.',
            400,
          );
        if (
          (input.reason === 'PRODUCTION_CORRECTION' && original.type !== 'PRODUCTION_RECEIPT') ||
          (input.reason === 'RECEIPT_CORRECTION' && original.type !== 'PURCHASED_RECEIPT')
        )
          throw fail(
            'CORRECTION_REFERENCE',
            'O motivo não corresponde ao movimento original.',
            400,
          );
      }
      const move = await this.move(
        tx,
        actor,
        op,
        batch.id,
        input.direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
        input.quantity,
        input.reason,
        input.notes,
        input.correctsMovementId,
      );
      await audit(tx, 'STOCK_ADJUSTED', requestId, actor.id, batch.id, this.clock(), {
        quantity: input.quantity,
        reason: input.reason,
        direction: input.direction,
        ...move,
      });
      return { targetId: move.movementId, batchId: batch.id };
    });
  }
  async batchDto(tx: Tx, batch: Prisma.BatchGetPayload<{ select: typeof batchSelect }>) {
    const sums = await this.totals(tx, batch.id);
    const consistent =
      sums.physical === batch.physical &&
      sums.reserved === batch.reserved &&
      sums.physical >= sums.reserved &&
      sums.reserved >= 0n;
    const amounts = consistent
      ? stockAmounts(sums.physical, sums.reserved, dateOnly(batch.expiresAt), this.today())
      : {
          physical: String(sums.physical < 0n ? 0n : sums.physical),
          reserved: String(sums.reserved < 0n ? 0n : sums.reserved),
          available: '0',
          blocked: '0',
          expiredReserved: '0',
        };
    const { physical: cachedPhysical, reserved: cachedReserved, ...fields } = batch;
    void cachedPhysical;
    void cachedReserved;
    return {
      ...fields,
      recordedAt: batch.recordedAt.toISOString(),
      expiresAt: dateOnly(batch.expiresAt),
      ...amounts,
      consistent,
      expired: batch.expiresAt !== null && !batchEligible(dateOnly(batch.expiresAt), this.today()),
    };
  }
  list(principal: Principal, query: z.infer<typeof stockQuery>) {
    return this.run(principal, 'inventory.availability', async (tx, actor) => {
      if (!hasPermission(actor.role, 'inventory.read') && query.state !== 'active')
        throw fail('STOCK_SCOPE', 'Seu perfil consulta disponibilidade de produtos ativos.', 403);
      const where = {
        ...(query.state === 'all' ? {} : { active: query.state === 'active' }),
        ...(query.origin ? { origin: query.origin } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        OR: [
          { nameKey: { contains: nameKey(query.q) } },
          { code: { contains: query.q.toUpperCase() } },
        ],
      };
      const products = await tx.product.findMany({
        where,
        select: productSelect,
        orderBy: [{ nameKey: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * 20,
        take: 20,
      });
      const items: Array<z.infer<typeof stockItemSchema>> = [];
      for (const product of products) {
        const batches = await tx.batch.findMany({
          where: { productId: product.id },
          select: batchSelect,
        });
        const sums = {
          physical: 0n,
          reserved: 0n,
          available: 0n,
          blocked: 0n,
          expiredReserved: 0n,
        };
        let consistent = true;
        for (const batch of batches) {
          const dto = await this.batchDto(tx, batch);
          consistent &&= dto.consistent;
          for (const field of Object.keys(sums) as Array<keyof typeof sums>)
            sums[field] += BigInt(dto[field]);
        }
        const totals = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, String(v)]));
        items.push({
          product,
          consistent,
          ...(hasPermission(actor.role, 'inventory.read') ? totals : {}),
          available: consistent ? totals.available! : '0',
        });
      }
      return {
        items,
        total: await tx.product.count({ where }),
        page: query.page,
        pageSize: 20,
        businessDate: this.today(),
      };
    });
  }
  batches(principal: Principal, productId: string, page: number) {
    return this.run(principal, 'inventory.read', async (tx) => {
      const where = { productId };
      const items = await tx.batch.findMany({
        where,
        select: batchSelect,
        orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * 20,
        take: 20,
      });
      return {
        items: await Promise.all(items.map((b) => this.batchDto(tx, b))),
        total: await tx.batch.count({ where }),
        page,
        pageSize: 20,
      };
    });
  }
  batch(principal: Principal, id: string) {
    return this.run(principal, 'inventory.read', async (tx, actor) => {
      const batch = await tx.batch.findUnique({ where: { id }, select: batchSelect });
      if (!batch) throw missing();
      const receipt = await tx.purchasedProductReceipt.findUnique({
        where: { batchId: id },
        select: {
          id: true,
          quantity: true,
          supplierReference: true,
          supplierBatch: true,
          notes: true,
          ...(hasPermission(actor.role, 'inventory.cost') ? { unitCostCents: true } : {}),
        },
      });
      return { batch: await this.batchDto(tx, batch), receipt };
    });
  }
  history(principal: Principal, productId: string, page: number) {
    return this.run(principal, 'inventory.read', async (tx) => {
      const where = { productId };
      const items = await tx.inventoryMovement.findMany({
        where,
        select: {
          id: true,
          batchId: true,
          type: true,
          quantity: true,
          reason: true,
          notes: true,
          createdAt: true,
          operationId: true,
          correctsMovementId: true,
          actor: { select: { displayName: true } },
          batch: { select: { reference: true, number: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * 20,
        take: 20,
      });
      return {
        items: items.map((row) => ({
          ...row,
          direction: movementDirection(row.type) === 1 ? 'IN' : 'OUT',
        })),
        total: await tx.inventoryMovement.count({ where }),
        page,
        pageSize: 20,
      };
    });
  }
  productions(principal: Principal, query: z.infer<typeof productionQuery>) {
    return this.run(principal, 'production.manage', async (tx) => {
      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.date ? { plannedDate: new Date(`${query.date}T00:00:00Z`) } : {}),
        product: {
          OR: [
            { nameKey: { contains: nameKey(query.q) } },
            { code: { contains: query.q.toUpperCase() } },
          ],
        },
      };
      const rows = await tx.productionRecord.findMany({
        where,
        select: productionSelect,
        orderBy: [{ plannedDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * 20,
        take: 20,
      });
      return {
        items: rows.map((row) => ({ ...row, plannedDate: dateOnly(row.plannedDate) })),
        total: await tx.productionRecord.count({ where }),
        page: query.page,
        pageSize: 20,
      };
    });
  }
  reconcile(principal: Principal, productId: string, requestId: string) {
    return this.run(principal, 'inventory.reconcile', async (tx, actor) => {
      const batches = await tx.batch.findMany({
        where: { productId },
        select: { id: true, physical: true, reserved: true },
      });
      const findings: Array<{ batchId: string; code: string; expected: string; actual: string }> =
        [];
      for (const batch of batches) {
        const totals = await this.totals(tx, batch.id);
        for (const [field, code] of [
          ['physical', 'PHYSICAL_DRIFT'],
          ['reserved', 'RESERVED_DRIFT'],
        ] as const)
          if (batch[field] !== totals[field])
            findings.push({
              batchId: batch.id,
              code,
              expected: String(totals[field]),
              actual: String(batch[field]),
            });
        if (totals.physical < 0n || totals.reserved > totals.physical)
          findings.push({
            batchId: batch.id,
            code: 'NEGATIVE_LEDGER',
            expected: '0',
            actual: String(totals.physical - totals.reserved),
          });
      }
      const reservations = await tx.inventoryReservation.findMany({
        where: { productId },
        select: {
          quantity: true,
          status: true,
          allocations: {
            select: { batchId: true, allocated: true, released: true, consumed: true },
          },
        },
      });
      for (const reservation of reservations) {
        const allocated = reservation.allocations.reduce((n, a) => n + BigInt(a.allocated), 0n);
        const released = reservation.allocations.reduce((n, a) => n + BigInt(a.released), 0n);
        const consumed = reservation.allocations.reduce((n, a) => n + BigInt(a.consumed), 0n);
        if (
          allocated !== BigInt(reservation.quantity) ||
          (reservation.status === 'ACTIVE' && (released !== 0n || consumed !== 0n)) ||
          (reservation.status === 'RELEASED' && released !== allocated) ||
          (reservation.status === 'CONSUMED' && consumed !== allocated)
        )
          findings.push({
            batchId: reservation.allocations[0]?.batchId ?? batches[0]?.id ?? productId,
            code: 'ALLOCATION_STATE',
            expected: String(reservation.quantity),
            actual: String(allocated - released - consumed),
          });
      }
      await audit(tx, 'STOCK_RECONCILED', requestId, actor.id, productId, this.clock(), {
        count: findings.length,
      });
      return { productId, consistent: findings.length === 0, checkedAt: this.clock(), findings };
    });
  }
  /** Internal-only ownership namespace. No orders table, fake order IDs or HTTP mutation route. */
  reserve(
    principal: Principal,
    key: string,
    input: z.infer<typeof reserveInput>,
    requestId: string,
  ) {
    return this.command(principal, 'RESERVE', key, input, requestId, async (tx, actor) => {
      input = reserveInput.parse(input);
      const [product] = await this.lockProducts(tx, [input.productId]);
      this.active(product!);
      await this.lockBatches(tx, [input.productId]);
      return this.reserveTx(tx, actor, input, requestId);
    });
  }
  async reserveTx(
    tx: Tx,
    actor: Actor,
    input: z.infer<typeof reserveInput>,
    requestId: string,
    orderItemId?: string,
  ) {
    if (input.eligibilityThrough < this.today())
      throw fail('RESERVATION_DATE', 'A elegibilidade deve alcançar hoje ou uma data futura.', 400);
    const all = await tx.batch.findMany({
      where: { productId: input.productId },
      select: batchSelect,
      orderBy: { id: 'asc' },
    });
    for (const batch of all) await this.checkedBatch(tx, batch.id);
    const eligible = all
      .filter((b) => batchEligible(dateOnly(b.expiresAt), this.today(), input.eligibilityThrough))
      .sort((a, b) =>
        fefoCompare(
          { id: a.id, expiresAt: dateOnly(a.expiresAt), recordedAt: a.recordedAt.toISOString() },
          { id: b.id, expiresAt: dateOnly(b.expiresAt), recordedAt: b.recordedAt.toISOString() },
        ),
      );
    if (eligible.reduce((sum, b) => sum + b.physical - b.reserved, 0n) < BigInt(input.quantity))
      throw fail(
        'INSUFFICIENT_SELLABLE_STOCK',
        'Estoque elegível não reservado insuficiente para a data solicitada. Nenhuma alocação foi confirmada.',
      );
    const reservation = await tx.inventoryReservation.create({
      data: {
        productId: input.productId,
        quantity: input.quantity,
        sourceNamespace: orderItemId ? 'ORDER' : 'INTERNAL',
        sourceReference: input.sourceReference,
        ...(orderItemId ? { orderItemId } : {}),
        eligibilityThrough: new Date(`${input.eligibilityThrough}T00:00:00Z`),
        actorId: actor.id,
        createdAt: this.clock(),
      },
      select: { id: true },
    });
    let remaining = input.quantity;
    for (const batch of eligible) {
      if (!remaining) break;
      const quantity = Number(
        batch.physical - batch.reserved > BigInt(remaining)
          ? BigInt(remaining)
          : batch.physical - batch.reserved,
      );
      if (!quantity) continue;
      await tx.reservationAllocation.create({
        data: {
          productId: input.productId,
          reservationId: reservation.id,
          batchId: batch.id,
          allocated: quantity,
        },
      });
      await tx.batch.update({
        where: { id: batch.id },
        data: { reserved: { increment: BigInt(quantity) }, version: { increment: 1 } },
      });
      remaining -= quantity;
    }
    await audit(tx, 'STOCK_RESERVED', requestId, actor.id, reservation.id, this.clock(), {
      quantity: input.quantity,
    });
    return { targetId: reservation.id, state: 'ACTIVE' };
  }
  reserveMany(
    principal: Principal,
    key: string,
    sourceReference: string,
    lines: Array<{ productId: string; quantity: number; eligibilityThrough: string }>,
    requestId: string,
  ) {
    const input = z
      .object({
        sourceReference: z.uuid(),
        lines: z
          .array(
            z.object({
              productId: z.uuid(),
              quantity: z.number().int().min(1).max(100000),
              eligibilityThrough: businessDateSchema,
            }),
          )
          .min(1)
          .max(20),
      })
      .parse({ sourceReference, lines });
    if (new Set(lines.map((l) => l.productId)).size !== lines.length)
      throw fail(
        'DUPLICATE_PRODUCT',
        'Agrupe as quantidades de cada produto antes de reservar.',
        400,
      );
    return this.command(principal, 'RESERVE_MULTI', key, input, requestId, async (tx, actor) => {
      const products = await this.lockProducts(
        tx,
        lines.map((l) => l.productId),
      );
      products.forEach((p) => this.active(p));
      await this.lockBatches(
        tx,
        lines.map((l) => l.productId),
      );
      const ids: string[] = [];
      for (const line of [...lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const r = await this.reserveTx(
          tx,
          actor,
          { ...line, sourceNamespace: 'INTERNAL', sourceReference },
          requestId,
        );
        ids.push(r.targetId);
      }
      return { targetId: ids[0]!, reservationIds: ids, state: 'ACTIVE' };
    });
  }
  reservationChange(
    principal: Principal,
    key: string,
    action: 'RELEASE' | 'CONSUME',
    input: z.infer<typeof reservationAction>,
    requestId: string,
  ) {
    input = reservationAction.parse(input);
    return this.command(principal, action, key, input, requestId, (tx, actor, op) =>
      this.reservationChangeTx(
        tx,
        actor,
        op,
        action,
        { ...input, sourceNamespace: 'INTERNAL' },
        requestId,
      ),
    );
  }
  /** Caller holds security/product/source/reservation/batch locks and validates the genuine business source. */
  async reservationChangeTx(
    tx: Tx,
    actor: Actor,
    op: string,
    action: 'RELEASE' | 'CONSUME',
    input: {
      reservationId: string;
      sourceNamespace: 'INTERNAL' | 'ORDER';
      sourceReference: string;
    },
    requestId: string,
  ) {
    const reservation = await tx.inventoryReservation.findUnique({
      where: { id: input.reservationId },
      select: {
        id: true,
        productId: true,
        sourceNamespace: true,
        sourceReference: true,
        status: true,
        eligibilityThrough: true,
        allocations: {
          select: { id: true, batchId: true, allocated: true, released: true, consumed: true },
          orderBy: { batchId: 'asc' },
        },
      },
    });
    if (
      !reservation ||
      reservation.sourceNamespace !== input.sourceNamespace ||
      reservation.sourceReference !== input.sourceReference
    )
      throw missing();
    await this.lockProducts(tx, [reservation.productId]);
    await tx.$queryRaw`SELECT "id" FROM "InventoryReservation" WHERE "id"=${reservation.id}::uuid FOR UPDATE`;
    await this.lockBatches(tx, [reservation.productId]);
    const next = action === 'RELEASE' ? 'RELEASED' : 'CONSUMED';
    if (reservation.status === next) return { targetId: reservation.id, state: next };
    if (reservation.status !== 'ACTIVE')
      throw fail('RESERVATION_CLOSED', 'Esta reserva já foi encerrada por outra operação.');
    if (action === 'CONSUME') {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: reservation.productId },
        select: productSelect,
      });
      this.active(product);
      for (const allocation of reservation.allocations) {
        const batch = await this.checkedBatch(tx, allocation.batchId);
        if (
          !batchEligible(
            dateOnly(batch.expiresAt),
            this.today(),
            dateOnly(reservation.eligibilityThrough)!,
          )
        )
          throw fail(
            'RESERVED_BATCH_EXPIRED',
            'Lote reservado está vencido ou não atende à data. Libere e revise explicitamente a alocação; não houve substituição ou consumo.',
          );
      }
    }
    for (const allocation of reservation.allocations) {
      const batch = await this.checkedBatch(tx, allocation.batchId);
      const quantity = allocation.allocated - allocation.released - allocation.consumed;
      if (quantity <= 0)
        throw fail('RESERVATION_DRIFT', 'Alocação inconsistente. Solicite conciliação.');
      await tx.reservationAllocation.update({
        where: { id: allocation.id },
        data:
          action === 'RELEASE'
            ? { released: { increment: quantity } }
            : { consumed: { increment: quantity } },
      });
      await tx.batch.update({
        where: { id: batch.id },
        data: { reserved: { decrement: BigInt(quantity) }, version: { increment: 1 } },
      });
      if (action === 'CONSUME')
        await this.move(
          tx,
          actor,
          op,
          batch.id,
          'CONSUMPTION',
          quantity,
          'INTERNAL_ALLOCATION_CONSUMED',
          undefined,
          undefined,
          reservation.id,
        );
    }
    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: { status: next, closedAt: this.clock(), version: { increment: 1 } },
    });
    await audit(
      tx,
      action === 'RELEASE' ? 'STOCK_RELEASED' : 'STOCK_CONSUMED',
      requestId,
      actor.id,
      reservation.id,
      this.clock(),
    );
    return { targetId: reservation.id, state: next };
  }
}
