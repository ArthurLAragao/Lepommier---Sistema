import { z } from 'zod';
import { businessDateSchema, moneyCentsSchema } from './contracts.js';
import { businessDayRange, businessDateOf, formatBusinessTime } from './format.js';
import { wholeUnits, quantityText } from './inventory.js';
export const MAX_ORDER_CENTS = 99999999n;
export const centsText = z
  .string()
  .regex(/^(0|[1-9]\d{0,7})$/, 'Informe centavos inteiros, sem separadores.');
export const orderStatus = z.enum([
  'DRAFT',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'FULFILLED',
  'CANCELLED',
]);
export const orderSource = z.enum(['COUNTER', 'WHATSAPP']);
export const paymentMethod = z.enum(['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD']);
export const orderLabels = {
  DRAFT: 'Rascunho',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Em preparação',
  READY: 'Pronto',
  FULFILLED: 'Entregue',
  CANCELLED: 'Cancelado',
} as const;
export const sourceLabels = { COUNTER: 'Balcão', WHATSAPP: 'WhatsApp manual' } as const;
export const paymentLabels = { UNPAID: 'Não pago', PAID: 'Pago', REFUNDED: 'Reembolsado' } as const;
export const methodLabels = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  DEBIT_CARD: 'Cartão de débito',
  CREDIT_CARD: 'Cartão de crédito',
} as const;
export const saleReasons = z.enum([
  'CUSTOMER_REQUEST',
  'ENTRY_ERROR',
  'STOCK_UNAVAILABLE',
  'QUALITY_ISSUE',
]);
export const reasonLabels = {
  CUSTOMER_REQUEST: 'Solicitação do cliente',
  ENTRY_ERROR: 'Erro de registro',
  STOCK_UNAVAILABLE: 'Estoque indisponível / validade',
  QUALITY_ISSUE: 'Problema de qualidade',
} as const;
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !v.includes('\u0000'), 'Remova caracteres de controle.')
    .transform((v) => v || null)
    .nullable()
    .optional();
export const pickupLocalSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/, 'Informe data e hora de Fortaleza.')
  .refine(
    (v) => businessDateSchema.safeParse(v.slice(0, 10)).success,
    'Data de retirada inválida.',
  );
export function pickupInstant(local: string): Date {
  pickupLocalSchema.parse(local);
  const start = businessDayRange(local.slice(0, 10)).start;
  return new Date(
    start.getTime() + Number(local.slice(11, 13)) * 3600000 + Number(local.slice(14, 16)) * 60000,
  );
}
export function pickupLocalOf(instant: string | Date) {
  return `${businessDateOf(instant)}T${formatBusinessTime(instant)}`;
}
export const cartLine = z
  .object({
    productId: z.uuid(),
    quantity: wholeUnits,
    productVersion: z.number().int().positive(),
    unitPriceCents: moneyCentsSchema,
  })
  .strict();
export const draftInput = z
  .object({
    source: orderSource,
    customerId: z.uuid().nullable().optional(),
    pickupLocal: pickupLocalSchema.nullable().optional(),
    pickupPerson: text(120),
    collectionNote: text(500),
    notes: text(1000),
    lines: z.array(cartLine).min(1, 'Inclua ao menos um produto.').max(20),
    discountCents: centsText.default('0'),
    discountReason: z.enum(['PROMOTION', 'PRICE_AGREEMENT', 'COURTESY']).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.lines.map((l) => l.productId)).size !== v.lines.length)
      ctx.addIssue({ code: 'custom', message: 'Agrupe as quantidades de cada produto.' });
    if (v.source === 'WHATSAPP' && (!v.customerId || !v.pickupLocal))
      ctx.addIssue({
        code: 'custom',
        message: 'Pedido WhatsApp exige cliente e retirada agendada.',
      });
    if (v.source === 'COUNTER' && v.pickupLocal)
      ctx.addIssue({ code: 'custom', message: 'Agendamento pertence ao pedido WhatsApp.' });
    if (BigInt(v.discountCents) > 0n && !v.discountReason)
      ctx.addIssue({ code: 'custom', message: 'Informe o motivo do desconto.' });
  });
export const draftEdit = z
  .object({ version: z.number().int().positive(), draft: draftInput })
  .strict();
export const paymentInput = z
  .object({
    amountCents: centsText,
    method: paymentMethod,
    tenderedCents: centsText.nullable().optional(),
    manuallyConfirmed: z.literal(true, { error: 'Confirme o recebimento manual do valor.' }),
  })
  .strict();
export const checkoutInput = z
  .object({ draft: draftInput, payment: paymentInput })
  .strict()
  .refine((v) => v.draft.source === 'COUNTER', 'Venda imediata deve ter origem balcão.');
export const versionInput = z.object({ version: z.number().int().positive() }).strict();
export const confirmInput = versionInput.extend({ expectedTotalCents: centsText }).strict();
export const progressInput = versionInput.extend({ to: z.enum(['PREPARING', 'READY']) }).strict();
export const orderPaymentInput = versionInput.extend({ payment: paymentInput }).strict();
export const cancelInput = versionInput
  .extend({ reason: saleReasons, externalRefundConfirmed: z.literal(true).optional() })
  .strict();
export const refundInput = versionInput
  .extend({
    reason: saleReasons,
    externalRefundConfirmed: z.literal(true, {
      error: 'Confirme que o reembolso externo foi realizado.',
    }),
  })
  .strict();
export const cashOpenInput = z.object({ openingFloatCents: centsText }).strict();
export function orderCanTransition(
  from: z.infer<typeof orderStatus>,
  to: z.infer<typeof orderStatus>,
) {
  return (
    {
      DRAFT: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['READY', 'CANCELLED'],
      READY: ['FULFILLED', 'CANCELLED'],
      FULFILLED: [],
      CANCELLED: [],
    } as Record<string, string[]>
  )[from]!.includes(to);
}
/** Allocate a fixed discount proportionally; deterministic last-line remainder, no fractional cent. */
export function priceCart(
  lines: Array<{ quantity: number; unitPriceCents: number }>,
  discount: string,
) {
  const amounts = lines.map(
    (l) => BigInt(wholeUnits.parse(l.quantity)) * BigInt(moneyCentsSchema.parse(l.unitPriceCents)),
  );
  const subtotal = amounts.reduce((a, b) => a + b, 0n);
  const d = BigInt(centsText.parse(discount));
  if (subtotal > MAX_ORDER_CENTS || d > subtotal)
    throw new Error('O total ultrapassa o limite ou o desconto excede o subtotal.');
  let cumulative = 0n;
  let allocated = 0n;
  const allocations = amounts.map((amount) => {
    cumulative += amount;
    const through = subtotal === 0n ? 0n : (d * cumulative) / subtotal;
    const part = through - allocated;
    allocated = through;
    return {
      subtotalCents: String(amount),
      discountCents: String(part),
      totalCents: String(amount - part),
    };
  });
  return {
    subtotalCents: String(subtotal),
    discountCents: String(d),
    totalCents: String(subtotal - d),
    lines: allocations,
  };
}
export function formatOrderMoney(value: string) {
  const cents = BigInt(value);
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}R$\u00a0${new Intl.NumberFormat('pt-BR').format(absolute / 100n)},${String(absolute % 100n).padStart(2, '0')}`;
}
export const orderQuery = z
  .object({
    q: z.string().trim().max(120).default(''),
    source: orderSource.optional(),
    status: orderStatus.optional(),
    payment: z.enum(['UNPAID', 'PAID', 'REFUNDED']).optional(),
    pickupFrom: businessDateSchema.optional(),
    pickupTo: businessDateSchema.optional(),
    customerId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
const actor = z.object({ displayName: z.string() });
const financial = z.object({
  id: z.uuid(),
  amountCents: quantityText,
  method: paymentMethod,
  recordedAt: z.iso.datetime(),
  cashSessionId: z.uuid(),
  actor,
});
export const orderSummary = z.object({
  id: z.uuid(),
  number: z.number().int(),
  source: orderSource,
  status: orderStatus,
  customer: z
    .object({
      id: z.uuid(),
      name: z.string(),
      active: z.boolean(),
      anonymizedAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  subtotalCents: quantityText,
  discountCents: quantityText,
  totalCents: quantityText,
  paymentState: z.enum(['UNPAID', 'PAID', 'REFUNDED']),
  pickupAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
  fulfilledAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  version: z.number().int(),
  creator: actor,
});
export const orderListSchema = z.object({
  items: z.array(orderSummary),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const orderDetailSchema = z.object({
  order: orderSummary.extend({
    pickupPerson: z.string().nullable(),
    collectionNote: z.string().nullable(),
    notes: z.string().nullable(),
    discountReason: z.string().nullable(),
    cancelReason: z.string().nullable(),
    preparingAt: z.iso.datetime().nullable(),
    readyAt: z.iso.datetime().nullable(),
    items: z.array(
      z.object({
        id: z.uuid(),
        productId: z.uuid(),
        productCode: z.string(),
        productName: z.string(),
        productVersion: z.number().int(),
        quantity: z.number().int(),
        unitPriceCents: z.number().int(),
        subtotalCents: quantityText,
        discountCents: quantityText,
        totalCents: quantityText,
      }),
    ),
    payment: financial
      .extend({
        tenderedCents: quantityText.nullable(),
        changeCents: quantityText.nullable(),
        manuallyConfirmed: z.boolean(),
      })
      .nullable(),
    refund: financial
      .extend({ reason: z.string(), externalRefundConfirmed: z.boolean() })
      .nullable(),
    events: z.array(
      z.object({
        id: z.uuid(),
        type: z.string(),
        state: orderStatus,
        reason: z.string().nullable(),
        createdAt: z.iso.datetime(),
        actor,
      }),
    ),
    reservationIssues: z.array(
      z.object({
        productId: z.uuid(),
        code: z.enum(['EXPIRED', 'PRODUCT_INACTIVE', 'INCONSISTENT']),
        quantity: z.number().int(),
      }),
    ),
  }),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>['order'];
export const saleProduct = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
  version: z.number().int(),
  sellingPriceCents: z.number().int(),
  categoryId: z.uuid(),
  available: quantityText,
  consistent: z.boolean(),
});
export const saleCatalogSchema = z.object({
  items: z.array(saleProduct),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const cashCurrentSchema = z.object({
  session: z
    .object({
      id: z.uuid(),
      openedAt: z.iso.datetime(),
      openedBy: actor,
      openingFloatCents: quantityText.optional(),
    })
    .nullable(),
  limitedFoundation: z.literal(false),
});
export const customerHistorySchema = z.object({
  orders: orderListSchema,
  fulfilledTotalCents: quantityText,
  paymentsReceivedCents: quantityText,
  refundsCents: quantityText,
  lastFulfilledAt: z.iso.datetime().nullable(),
});
