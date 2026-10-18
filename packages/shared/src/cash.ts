import { z } from 'zod';
import { businessDateSchema } from './contracts.js';
import { paymentMethod, centsText } from './sales.js';
export const MAX_CASH_SESSION_CENTS = 999999999999n;
export const cashUnsigned = z.string().regex(/^(0|[1-9]\d{0,11})$/);
export const cashSigned = z.string().regex(/^-?(0|[1-9]\d{0,11})$/);
export const cashMethodTotals = z.object({
  grossCents: cashUnsigned,
  refundCents: cashUnsigned,
  netCents: cashSigned,
  paymentCount: cashUnsigned,
  refundCount: cashUnsigned,
});
export const cashTotals = z.object({
  openingFloatCents: cashUnsigned,
  methods: z.object({
    CASH: cashMethodTotals,
    PIX: cashMethodTotals,
    DEBIT_CARD: cashMethodTotals,
    CREDIT_CARD: cashMethodTotals,
  }),
  additionsCents: cashUnsigned,
  withdrawalsCents: cashUnsigned,
  expensesCents: cashUnsigned,
  correctionsCents: cashSigned,
  expectedCents: cashSigned,
  sourceCount: cashUnsigned,
});
export type CashTotals = z.infer<typeof cashTotals>;
export function expectedCash(v: {
  openingFloatCents: string;
  cashPaymentsCents: string;
  cashRefundsCents: string;
  additionsCents: string;
  withdrawalsCents: string;
  expensesCents: string;
  correctionsCents: string;
}) {
  return (
    BigInt(v.openingFloatCents) +
    BigInt(v.cashPaymentsCents) -
    BigInt(v.cashRefundsCents) +
    BigInt(v.additionsCents) -
    BigInt(v.withdrawalsCents) -
    BigInt(v.expensesCents) +
    BigInt(v.correctionsCents)
  ).toString();
}
export function methodSummary(
  payments: Array<{ method: z.infer<typeof paymentMethod>; amountCents: string }>,
  refunds: Array<{ method: z.infer<typeof paymentMethod>; amountCents: string }>,
) {
  return Object.fromEntries(
    paymentMethod.options.map((method) => {
      const p = payments.filter((p) => p.method === method);
      const r = refunds.filter((r) => r.method === method);
      const gross = p.reduce((a, p) => a + BigInt(p.amountCents), 0n);
      const back = r.reduce((a, r) => a + BigInt(r.amountCents), 0n);
      return [
        method,
        {
          grossCents: String(gross),
          refundCents: String(back),
          netCents: String(gross - back),
          paymentCount: String(p.length),
          refundCount: String(r.length),
        },
      ];
    }),
  ) as CashTotals['methods'];
}
export function closingDifference(counted: string, expected: string) {
  return (BigInt(cashUnsigned.parse(counted)) - BigInt(cashSigned.parse(expected))).toString();
}
export const cashMovementKind = z.enum([
  'CASH_ADDITION',
  'CASH_WITHDRAWAL',
  'CASH_EXPENSE',
  'CASH_REVERSAL',
]);
export const cashMovementLabels = {
  CASH_ADDITION: 'Suprimento',
  CASH_WITHDRAWAL: 'Sangria',
  CASH_EXPENSE: 'Despesa',
  CASH_REVERSAL: 'Estorno de movimentação',
} as const;
export const expenseCategory = z.enum(['SUPPLIES', 'MAINTENANCE', 'TRANSPORT', 'OTHER']);
export const expenseLabels = {
  SUPPLIES: 'Materiais de uso',
  MAINTENANCE: 'Manutenção',
  TRANSPORT: 'Transporte',
  OTHER: 'Outra',
} as const;
const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(5, 'Descreva o motivo com ao menos 5 caracteres.')
    .max(max)
    .refine(
      (v) =>
        [...v].every((ch) => {
          const code = ch.codePointAt(0)!;
          return (
            [9, 10, 13].includes(code) ||
            (code >= 32 && code !== 127 && (code < 128 || code >= 160))
          );
        }),
      'Remova caracteres de controle.',
    );
export const cashMovementInput = z
  .object({
    sessionId: z.uuid(),
    kind: z.enum(['CASH_ADDITION', 'CASH_WITHDRAWAL', 'CASH_EXPENSE']),
    amountCents: centsText.refine((v) => v !== '0', 'Informe valor positivo.'),
    reason: safeText(240),
    category: expenseCategory.nullable().optional(),
    reference: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._/-]{1,64}$/, 'Use referência interna sem dados pessoais.')
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.kind === 'CASH_EXPENSE' ? !v.category : Boolean(v.category))
      c.addIssue({ code: 'custom', message: 'Categoria é obrigatória somente para despesa.' });
  });
export const cashReverseInput = z
  .object({
    sessionId: z.uuid(),
    movementId: z.uuid(),
    reason: safeText(240),
    physicalMovementConfirmed: z.literal(true, {
      error: 'Confirme a movimentação física inversa no caixa atual.',
    }),
  })
  .strict();
export function parseCashCounted(input: string) {
  const value = input.trim();
  if (!/^(?:0|[1-9]\d{0,9}|[1-9]\d{0,2}(?:\.\d{3}){1,3})(?:,\d{1,2})?$/.test(value))
    throw new Error('Informe o dinheiro contado como 125,90, sem sinal ou símbolo.');
  const [whole = '0', fraction = ''] = value.split(',');
  const parsed = cashUnsigned.safeParse(
    String(BigInt(whole.replaceAll('.', '')) * 100n + BigInt(fraction.padEnd(2, '0'))),
  );
  if (!parsed.success)
    throw new Error('O dinheiro contado ultrapassa o limite de R$ 9.999.999.999,99.');
  return parsed.data;
}
export const cashCloseInput = z
  .object({
    sessionId: z.uuid(),
    activityVersion: z.number().int().positive().max(2147483647),
    countedCents: cashUnsigned,
    explanation: safeText(500).nullable().optional(),
    confirmed: z.literal(true, { error: 'Confirme que o fechamento não poderá ser reaberto.' }),
  })
  .strict();
export const cashReviewInput = z
  .object({
    sessionId: z.uuid(),
    reviewVersion: z.number().int().nonnegative().max(2147483647),
    decision: z.enum(['APPROVED', 'NEEDS_ATTENTION']),
    note: safeText(500),
  })
  .strict();
export const cashHistoryQuery = z
  .object({
    q: z.string().trim().max(36).default(''),
    state: z.enum(['all', 'open', 'closed']).default('all'),
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, 'Revise o período.');
const actor = z.object({ displayName: z.string() });
export const cashClosingDto = z.object({
  sessionId: z.uuid(),
  activityVersion: z.number().int(),
  expectedCents: cashUnsigned,
  countedCents: cashUnsigned,
  differenceCents: cashSigned,
  explanation: z.string().nullable(),
  totals: cashTotals,
  actor,
  recordedAt: z.iso.datetime(),
});
export const cashReviewDto = z.object({
  id: z.uuid(),
  version: z.number().int(),
  decision: z.enum(['APPROVED', 'NEEDS_ATTENTION']),
  note: z.string(),
  actor,
  recordedAt: z.iso.datetime(),
});
export const cashSessionDto = z.object({
  id: z.uuid(),
  openedAt: z.iso.datetime(),
  openedBy: actor,
  openingFloatCents: cashUnsigned,
  closedAt: z.iso.datetime().nullable(),
  activityVersion: z.number().int(),
  reviewVersion: z.number().int(),
  legacyClosed: z.boolean(),
  closing: cashClosingDto.nullable(),
  reviewStatus: z.enum(['PENDING_REVIEW', 'APPROVED', 'NEEDS_ATTENTION']),
});
export const cashCurrentDto = z.object({
  session: z.object({ id: z.uuid(), openedAt: z.iso.datetime(), openedBy: actor }).nullable(),
});
export const cashHistoryDto = z.object({
  items: z.array(cashSessionDto),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.literal(20),
});
export const cashMovementDto = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  kind: cashMovementKind,
  amountCents: cashUnsigned,
  direction: z.union([z.literal(1), z.literal(-1)]),
  reason: z.string(),
  category: expenseCategory.nullable(),
  reference: z.string().nullable(),
  actor,
  recordedAt: z.iso.datetime(),
  reversesId: z.uuid().nullable(),
  reversalId: z.uuid().nullable(),
  originalSessionId: z.uuid().nullable(),
});
export const cashRecordDto = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  orderNumber: z.number().int(),
  method: paymentMethod,
  amountCents: cashUnsigned,
  actor,
  recordedAt: z.iso.datetime(),
});
export const cashReconciliation = z.object({
  consistent: z.boolean(),
  findings: z.array(z.string()),
  operationalDifferenceCents: cashSigned.nullable(),
});
export const cashDetailDto = z.object({
  session: cashSessionDto,
  totals: cashTotals,
  reconciliation: cashReconciliation,
  movements: z.object({
    items: z.array(cashMovementDto),
    total: z.number().int(),
    page: z.number().int(),
  }),
  payments: z.object({
    items: z.array(cashRecordDto),
    total: z.number().int(),
    page: z.number().int(),
  }),
  refunds: z.object({
    items: z.array(cashRecordDto),
    total: z.number().int(),
    page: z.number().int(),
  }),
  reviews: z.object({
    items: z.array(cashReviewDto),
    total: z.number().int(),
    page: z.number().int(),
  }),
});
export const cashDetailQuery = z
  .object({
    movementsPage: z.coerce.number().int().min(1).max(100000).default(1),
    paymentsPage: z.coerce.number().int().min(1).max(100000).default(1),
    refundsPage: z.coerce.number().int().min(1).max(100000).default(1),
    reviewsPage: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export function correctionDirection(
  kind: z.infer<typeof cashMovementKind>,
  originalDirection?: number,
) {
  if (kind === 'CASH_REVERSAL') {
    if (originalDirection !== 1 && originalDirection !== -1)
      throw Error('Reversal requires an original direction');
    return -originalDirection;
  }
  return kind === 'CASH_ADDITION' ? 1 : -1;
}
