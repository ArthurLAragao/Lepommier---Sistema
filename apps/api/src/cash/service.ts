import { z } from 'zod';
import {
  cashTotals,
  cashCurrentDto,
  cashHistoryDto,
  cashDetailDto,
  MAX_CASH_SESSION_CENTS,
  canonicalCommand,
  closingDifference,
  correctionDirection,
  businessDayRange,
  type CashTotals,
  type cashHistoryQuery,
  type cashDetailQuery,
  type cashMovementInput,
  type cashCloseInput,
  type cashReviewInput,
  type cashReverseInput,
} from '@pommier/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AuthService, audit, type Principal } from '../auth/service.js';
import { InventoryService } from '../inventory/service.js';
import { AppError } from '../errors.js';
type Tx = Prisma.TransactionClient;
const fail = (code: string, message: string, status = 409) => new AppError(status, code, message);
const actor = { displayName: true } as const;
const closingSelect = {
  sessionId: true,
  activityVersion: true,
  expectedCents: true,
  countedCents: true,
  differenceCents: true,
  explanation: true,
  totals: true,
  actor: { select: actor },
  recordedAt: true,
} as const;
const sessionSelect = {
  id: true,
  openedAt: true,
  openedBy: { select: actor },
  openingFloatCents: true,
  closedAt: true,
  activityVersion: true,
  reviewVersion: true,
  legacyClosed: true,
  closing: { select: closingSelect },
  reviews: { select: { decision: true }, orderBy: { version: 'desc' as const }, take: 1 },
} as const;
const movementSelect = {
  id: true,
  sessionId: true,
  kind: true,
  amountCents: true,
  direction: true,
  reason: true,
  category: true,
  reference: true,
  actor: { select: actor },
  recordedAt: true,
  reversesId: true,
  reversal: { select: { id: true } },
  reverses: { select: { sessionId: true } },
} as const;
const recordSelect = {
  id: true,
  orderId: true,
  order: { select: { number: true } },
  method: true,
  amountCents: true,
  actor: { select: actor },
  recordedAt: true,
} as const;
const reviewSelect = {
  id: true,
  version: true,
  decision: true,
  note: true,
  actor: { select: actor },
  recordedAt: true,
} as const;
const transport = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v, (_k, v) => (typeof v === 'bigint' ? String(v) : v)));
export async function cashTotalsTx(tx: Tx, id: string): Promise<CashTotals> {
  const rows = await tx.$queryRaw<
    Array<{ totals: unknown }>
  >`SELECT cash_session_totals(${id}::uuid) AS totals`;
  const parsed = cashTotals.safeParse(rows[0]?.totals);
  if (!parsed.success)
    throw fail(
      'CASH_INTEGRITY',
      'Não foi possível reconciliar as fontes do caixa. Solicite revisão técnica; nenhum saldo foi corrigido.',
    );
  return parsed.data;
}
async function financialSourcesValid(tx: Tx, id: string) {
  const [r] = await tx.$queryRaw<
    Array<{ invalid: boolean }>
  >`SELECT EXISTS(SELECT 1 FROM "Payment" p JOIN "Order" o ON o.id=p."orderId" JOIN "CashSession" s ON s.id=p."cashSessionId" WHERE s.id=${id}::uuid AND (p."amountCents"<>o."totalCents" OR NOT p."manuallyConfirmed" OR p."recordedAt"<s."openedAt" OR (s."closedAt" IS NOT NULL AND p."recordedAt">s."closedAt")) UNION ALL SELECT 1 FROM "Refund" r JOIN "Payment" p ON p.id=r."paymentId" JOIN "CashSession" s ON s.id=r."cashSessionId" WHERE s.id=${id}::uuid AND (r."amountCents"<>p."amountCents" OR r.method<>p.method OR NOT r."externalRefundConfirmed" OR r."recordedAt"<s."openedAt" OR (s."closedAt" IS NOT NULL AND r."recordedAt">s."closedAt"))) AS invalid`;
  return !r!.invalid;
}
export async function cashPostingCheck(
  tx: Tx,
  id: string,
  amount: bigint,
  type: 'PAYMENT' | 'REFUND',
  method: string,
) {
  const s = await tx.cashSession.findUnique({
    where: { id },
    select: { closedAt: true, activityVersion: true },
  });
  if (!s || s.closedAt)
    throw fail(
      'CASH_CLOSED',
      'A sessão foi fechada. Revise a sessão atual antes de repetir; nada foi registrado.',
    );
  const t = await cashTotalsTx(tx, id);
  if (BigInt(t.expectedCents) < 0n)
    throw fail(
      'CASH_INTEGRITY',
      'O dinheiro esperado anterior é negativo. Solicite análise técnica; nenhum saldo foi corrigido.',
    );
  if (!(await financialSourcesValid(tx, id)))
    throw fail(
      'CASH_INTEGRITY',
      'Há registro financeiro incompatível com sua origem. Solicite revisão técnica antes de continuar.',
    );
  if (BigInt(s.activityVersion) !== BigInt(t.sourceCount) + 1n)
    throw fail(
      'CASH_INTEGRITY',
      'As fontes e a versão do caixa não conferem. Solicite revisão técnica.',
    );
  if (type === 'REFUND' && method === 'CASH' && BigInt(t.expectedCents) < amount)
    throw fail(
      'CASH_INSUFFICIENT',
      'Dinheiro esperado insuficiente para a devolução. Registre um suprimento real antes; não devolva novamente sem conferir o recebimento externo.',
    );
  const field = type === 'PAYMENT' ? 'grossCents' : 'refundCents';
  const gross = Object.values(t.methods).reduce((a, m) => a + BigInt(m[field]), 0n) + amount;
  const expected =
    BigInt(t.expectedCents) + (method === 'CASH' ? (type === 'PAYMENT' ? amount : -amount) : 0n);
  if (gross > MAX_CASH_SESSION_CENTS || expected > MAX_CASH_SESSION_CENTS)
    throw fail(
      'CASH_LIMIT',
      'O limite financeiro desta sessão foi atingido. Revise e feche o caixa antes de novas operações.',
    );
}
export class CashService {
  readonly operations: InventoryService;
  constructor(
    readonly auth: AuthService,
    readonly clock: () => Date,
  ) {
    this.operations = new InventoryService(auth, clock);
  }
  async lock(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "CashSession" WHERE id=${id}::uuid FOR UPDATE`;
    if (!rows[0]) throw fail('CASH_NOT_FOUND', 'Sessão de caixa não encontrada.', 404);
    return tx.cashSession.findUniqueOrThrow({ where: { id }, select: sessionSelect });
  }
  async sources(tx: Tx, id: string) {
    const s = await tx.cashSession.findUnique({ where: { id }, select: sessionSelect });
    if (!s) throw fail('CASH_NOT_FOUND', 'Sessão de caixa não encontrada.', 404);
    const totals = await cashTotalsTx(tx, id);
    const findings: string[] = [];
    if (BigInt(s.activityVersion) !== BigInt(totals.sourceCount) + 1n)
      findings.push('ACTIVITY_VERSION_DRIFT');
    if (BigInt(totals.expectedCents) < 0n) findings.push('NEGATIVE_EXPECTED_LEGACY');
    if (s.closedAt && !s.closing) findings.push('LEGACY_CLOSING_UNAVAILABLE');
    if (
      s.closing &&
      (canonicalCommand(s.closing.totals) !== canonicalCommand(totals) ||
        s.closing.activityVersion !== s.activityVersion ||
        s.closing.recordedAt.getTime() !== s.closedAt?.getTime() ||
        String(s.closing.expectedCents) !== totals.expectedCents ||
        s.closing.differenceCents !== s.closing.countedCents - s.closing.expectedCents)
    )
      findings.push('CLOSING_DRIFT');
    const count = await tx.cashReview.count({ where: { sessionId: id } });
    if (s.reviewVersion !== count) findings.push('REVIEW_VERSION_DRIFT');
    if (!(await financialSourcesValid(tx, id))) findings.push('FINANCIAL_SOURCE_MISMATCH');
    return {
      s,
      totals,
      reconciliation: {
        consistent: findings.length === 0,
        findings,
        operationalDifferenceCents: s.closing ? String(s.closing.differenceCents) : null,
      },
    };
  }
  assertConsistent(v: { reconciliation: { consistent: boolean } }) {
    if (!v.reconciliation.consistent)
      throw fail(
        'CASH_INTEGRITY',
        'Há falha de integridade nas fontes do caixa. Uma justificativa de diferença não corrige esse problema. Solicite revisão técnica.',
      );
  }
  summary(s: Prisma.CashSessionGetPayload<{ select: typeof sessionSelect }>) {
    return { ...s, reviewStatus: s.reviews[0]?.decision ?? 'PENDING_REVIEW' };
  }
  current(p: Principal) {
    return this.operations.run(p, 'cash.current', async (tx) =>
      cashCurrentDto.parse(
        transport({
          session: await tx.cashSession.findFirst({
            where: { closedAt: null },
            select: { id: true, openedAt: true, openedBy: { select: actor } },
          }),
        }),
      ),
    );
  }
  history(p: Principal, q: z.infer<typeof cashHistoryQuery>) {
    return this.operations.run(p, 'cash.read', async (tx) => {
      const where: Prisma.CashSessionWhereInput = {
        ...(q.state === 'open'
          ? { closedAt: null }
          : q.state === 'closed'
            ? { closedAt: { not: null } }
            : {}),
        ...(q.from || q.to
          ? {
              openedAt: {
                ...(q.from ? { gte: businessDayRange(q.from).start } : {}),
                ...(q.to ? { lt: businessDayRange(q.to).end } : {}),
              },
            }
          : {}),
      };
      // UUID search is normalized explicitly; never construct SQL from a search string.
      if (q.q) {
        if (!z.uuid().safeParse(q.q).success)
          return cashHistoryDto.parse({ items: [], total: 0, page: q.page, pageSize: 20 });
        where.id = q.q.toLowerCase();
      }
      const items = await tx.cashSession.findMany({
        where,
        select: sessionSelect,
        orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * 20,
        take: 20,
      });
      return cashHistoryDto.parse(
        transport({
          items: items.map((s) => this.summary(s)),
          total: await tx.cashSession.count({ where }),
          page: q.page,
          pageSize: 20,
        }),
      );
    });
  }
  detail(p: Principal, id: string, q: z.infer<typeof cashDetailQuery>) {
    return this.operations.run(p, 'cash.read', async (tx) => {
      const { s, totals, reconciliation } = await this.sources(tx, id);
      const movements = await tx.cashMovement.findMany({
        where: { sessionId: id },
        select: movementSelect,
        orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
        skip: (q.movementsPage - 1) * 20,
        take: 20,
      });
      const payments = await tx.payment.findMany({
        where: { cashSessionId: id },
        select: recordSelect,
        orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
        skip: (q.paymentsPage - 1) * 20,
        take: 20,
      });
      const refunds = await tx.refund.findMany({
        where: { cashSessionId: id },
        select: recordSelect,
        orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
        skip: (q.refundsPage - 1) * 20,
        take: 20,
      });
      const reviews = await tx.cashReview.findMany({
        where: { sessionId: id },
        select: reviewSelect,
        orderBy: { version: 'desc' },
        skip: (q.reviewsPage - 1) * 20,
        take: 20,
      });
      return cashDetailDto.parse(
        transport({
          session: this.summary(s),
          totals,
          reconciliation,
          movements: {
            items: movements.map((m) => ({
              ...m,
              reversalId: m.reversal?.id ?? null,
              originalSessionId: m.reverses?.sessionId ?? null,
            })),
            total: await tx.cashMovement.count({ where: { sessionId: id } }),
            page: q.movementsPage,
          },
          payments: {
            items: payments.map((p) => ({ ...p, orderNumber: p.order.number })),
            total: await tx.payment.count({ where: { cashSessionId: id } }),
            page: q.paymentsPage,
          },
          refunds: {
            items: refunds.map((r) => ({ ...r, orderNumber: r.order.number })),
            total: await tx.refund.count({ where: { cashSessionId: id } }),
            page: q.refundsPage,
          },
          reviews: { items: reviews, total: s.reviewVersion, page: q.reviewsPage },
        }),
      );
    });
  }
  reconcile(p: Principal, id: string, req: string) {
    return this.operations.run(p, 'cash.read', async (tx, a) => {
      const v = await this.sources(tx, id);
      await audit(tx, 'CASH_RECONCILED', req, a.id, id, this.clock(), {
        count: v.reconciliation.findings.length,
      });
      return v.reconciliation;
    });
  }
  async post(
    tx: Tx,
    a: { id: string },
    op: string,
    input: {
      sessionId: string;
      kind: 'CASH_ADDITION' | 'CASH_WITHDRAWAL' | 'CASH_EXPENSE' | 'CASH_REVERSAL';
      amountCents: string;
      reason: string;
      category?: string | null;
      reference?: string | null;
      reversesId?: string;
      direction: number;
    },
    req: string,
  ) {
    const s = await this.lock(tx, input.sessionId);
    if (s.closedAt)
      throw fail(
        'CASH_CLOSED',
        'Esta sessão já foi fechada. Revise a sessão atual; nada foi registrado.',
      );
    const v = await this.sources(tx, s.id);
    this.assertConsistent(v);
    const amount = BigInt(input.amountCents);
    const expected = BigInt(v.totals.expectedCents) + BigInt(input.direction) * amount;
    if (expected < 0n)
      throw fail(
        'CASH_INSUFFICIENT',
        'Dinheiro esperado insuficiente. Confira o valor e o movimento real; nenhum saldo foi inventado.',
      );
    const field =
      input.kind === 'CASH_ADDITION'
        ? 'additionsCents'
        : input.kind === 'CASH_WITHDRAWAL'
          ? 'withdrawalsCents'
          : input.kind === 'CASH_EXPENSE'
            ? 'expensesCents'
            : 'correctionsCents';
    const aggregate =
      BigInt(v.totals[field]) +
      (input.kind === 'CASH_REVERSAL' ? BigInt(input.direction) : 1n) * amount;
    if (
      expected > MAX_CASH_SESSION_CENTS ||
      aggregate > MAX_CASH_SESSION_CENTS ||
      aggregate < -MAX_CASH_SESSION_CENTS
    )
      throw fail('CASH_LIMIT', 'O limite financeiro da sessão foi atingido. Revise o fechamento.');
    const m = await tx.cashMovement.create({
      data: {
        ...input,
        amountCents: amount,
        actorId: a.id,
        operationId: op,
        recordedAt: this.clock(),
      },
      select: { id: true },
    });
    await audit(
      tx,
      input.kind === 'CASH_REVERSAL' ? 'CASH_REVERSED' : 'CASH_MOVED',
      req,
      a.id,
      m.id,
      this.clock(),
      {
        state: input.kind,
        before: v.totals.expectedCents,
        after: String(expected),
        quantity: input.amountCents,
        direction: input.direction,
        ...(input.reversesId ? { movementId: input.reversesId } : {}),
      },
    );
    return { targetId: m.id, state: input.kind };
  }
  movement(p: Principal, key: string, input: z.infer<typeof cashMovementInput>, req: string) {
    return this.operations.command(p, 'CASH_MOVEMENT', key, input, req, (tx, a, op) =>
      this.post(
        tx,
        a,
        op,
        {
          ...input,
          category: input.category ?? null,
          reference: input.reference ?? null,
          direction: correctionDirection(input.kind),
        },
        req,
      ),
    );
  }
  reverse(p: Principal, key: string, input: z.infer<typeof cashReverseInput>, req: string) {
    return this.operations.command(p, 'CASH_REVERSE', key, input, req, async (tx, a, op) => {
      const current = await this.lock(tx, input.sessionId);
      if (current.closedAt)
        throw fail(
          'CASH_CLOSED',
          'A sessão revisada foi fechada. Confira a sessão atual antes de registrar a movimentação inversa.',
        );
      const original = await tx.cashMovement.findUnique({
        where: { id: input.movementId },
        select: {
          id: true,
          kind: true,
          direction: true,
          amountCents: true,
          reversal: { select: { id: true } },
        },
      });
      if (!original || original.kind === 'CASH_REVERSAL' || original.reversal)
        throw fail(
          'CASH_REVERSAL_INVALID',
          'Movimentação não encontrada, já estornada ou não elegível. Não houve ajuste.',
        );
      return this.post(
        tx,
        a,
        op,
        {
          sessionId: current.id,
          kind: 'CASH_REVERSAL',
          amountCents: String(original.amountCents),
          reason: input.reason,
          reversesId: original.id,
          direction: correctionDirection('CASH_REVERSAL', original.direction),
        },
        req,
      );
    });
  }
  close(p: Principal, key: string, input: z.infer<typeof cashCloseInput>, req: string) {
    return this.operations.command(p, 'CASH_CLOSE', key, input, req, async (tx, a, op) => {
      const s = await this.lock(tx, input.sessionId);
      if (s.closedAt)
        throw fail('CASH_CLOSED', 'Esta sessão já foi fechada. Consulte o resultado original.');
      if (s.activityVersion !== input.activityVersion)
        throw fail(
          'CASH_STALE',
          'O caixa recebeu nova atividade. Recarregue e revise os valores antes de confirmar o fechamento.',
        );
      const v = await this.sources(tx, s.id);
      this.assertConsistent(v);
      const difference = closingDifference(input.countedCents, v.totals.expectedCents);
      if (BigInt(difference) !== 0n && !input.explanation)
        throw fail(
          'CASH_EXPLANATION_REQUIRED',
          'Informe a justificativa da diferença entre dinheiro contado e esperado.',
          400,
        );
      const at = this.clock();
      await tx.cashClosing.create({
        data: {
          sessionId: s.id,
          activityVersion: s.activityVersion,
          expectedCents: BigInt(v.totals.expectedCents),
          countedCents: BigInt(input.countedCents),
          differenceCents: BigInt(difference),
          explanation: input.explanation ?? null,
          totals: v.totals,
          actorId: a.id,
          recordedAt: at,
          operationId: op,
        },
        select: { sessionId: true },
      });
      await tx.cashSession.update({
        where: { id: s.id },
        data: { closedAt: at },
        select: { id: true },
      });
      await audit(tx, 'CASH_CLOSED', req, a.id, s.id, at, {
        state: BigInt(difference) === 0n ? 'BALANCED' : 'DIFFERENCE',
        reason: BigInt(difference) === 0n ? 'COUNT_MATCHED' : 'COUNT_DIFFERED',
        before: v.totals.expectedCents,
        after: input.countedCents,
        quantity: difference,
      });
      return { targetId: s.id, state: 'CLOSED' };
    });
  }
  review(p: Principal, key: string, input: z.infer<typeof cashReviewInput>, req: string) {
    return this.operations.command(p, 'CASH_REVIEW', key, input, req, async (tx, a, op) => {
      const s = await this.lock(tx, input.sessionId);
      if (!s.closedAt || !s.closing || s.legacyClosed)
        throw fail(
          'CASH_REVIEW_UNAVAILABLE',
          'A revisão exige fechamento registrado com contagem e fontes verificáveis.',
        );
      if (s.reviewVersion !== input.reviewVersion)
        throw fail(
          'CASH_REVIEW_STALE',
          'Outra revisão foi registrada. Recarregue e confira o histórico.',
        );
      this.assertConsistent(await this.sources(tx, s.id));
      await tx.cashReview.create({
        data: {
          sessionId: s.id,
          version: s.reviewVersion + 1,
          decision: input.decision,
          note: input.note,
          actorId: a.id,
          recordedAt: this.clock(),
          operationId: op,
        },
        select: { id: true },
      });
      await audit(tx, 'CASH_REVIEWED', req, a.id, s.id, this.clock(), { state: input.decision });
      return { targetId: s.id, state: input.decision };
    });
  }
}
