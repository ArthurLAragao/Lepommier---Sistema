import { z } from 'zod';
import { businessDateSchema, moneyCentsSchema } from './contracts.js';
export const MAX_BATCH_UNITS = 1_000_000_000_000n;
export const wholeUnits = z
  .number({ error: 'Informe uma quantidade de unidades.' })
  .int('Use somente unidades inteiras.')
  .min(1, 'Informe ao menos 1 unidade.')
  .max(100000, 'Use até 100.000 unidades por comando.');
export const quantityText = z.string().regex(/^\d{1,40}$/);
export const signedQuantityText = z.string().regex(/^-?\d{1,40}$/);
export const inventoryNotes = z
  .string()
  .trim()
  .max(500, 'Use até 500 caracteres.')
  .refine((v) => !v.includes('\u0000'), 'Remova caracteres de controle.')
  .transform((v) => v || null)
  .nullable()
  .optional();
export const productionStatusSchema = z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export const movementTypeSchema = z.enum([
  'OPENING',
  'PRODUCTION_RECEIPT',
  'PURCHASED_RECEIPT',
  'CONSUMPTION',
  'WASTE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
]);
export type StockMovementType = z.infer<typeof movementTypeSchema>;
export const movementLabels: Record<StockMovementType, string> = {
  OPENING: 'Saldo inicial',
  PRODUCTION_RECEIPT: 'Conclusão de produção',
  PURCHASED_RECEIPT: 'Recebimento comprado',
  CONSUMPTION: 'Consumo de reserva',
  WASTE: 'Perda de unidades prontas',
  ADJUSTMENT_IN: 'Ajuste positivo',
  ADJUSTMENT_OUT: 'Ajuste negativo',
};
export const productionLabels = {
  PLANNED: 'Planejada',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
} as const;
export function movementDirection(type: StockMovementType): 1 | -1 {
  return ['CONSUMPTION', 'WASTE', 'ADJUSTMENT_OUT'].includes(type) ? -1 : 1;
}
export function batchEligible(expiry: string | null, today: string, through = today) {
  return expiry === null || expiry >= (through > today ? through : today);
}
export function stockAmounts(
  physical: bigint,
  reserved: bigint,
  expiry: string | null,
  today: string,
) {
  if (physical < 0n || reserved < 0n || reserved > physical)
    throw new Error('Saldo físico/reservado inconsistente.');
  const eligible = batchEligible(expiry, today);
  return {
    physical: String(physical),
    reserved: String(reserved),
    available: String(eligible ? physical - reserved : 0n),
    blocked: String(eligible ? 0n : physical),
    expiredReserved: String(eligible ? 0n : reserved),
  };
}
export function fefoCompare(
  a: { expiresAt: string | null; recordedAt: string; id: string },
  b: { expiresAt: string | null; recordedAt: string; id: string },
) {
  return (
    (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999') ||
    a.recordedAt.localeCompare(b.recordedAt) ||
    a.id.localeCompare(b.id)
  );
}
export function canonicalCommand(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalCommand).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalCommand(v)}`)
      .join(',')}}`;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return JSON.stringify(value);
  throw new Error('Comando contém valor não suportado.');
}
export const batchFields = {
  reference: z
    .string()
    .trim()
    .min(2, 'Informe a referência do lote.')
    .max(80)
    .refine((v) => !v.includes('\u0000'), 'Remova caracteres de controle.'),
  expiresAt: businessDateSchema.nullable(),
  expiryUnknownReason: z.enum(['NOT_PROVIDED', 'LEGACY_COUNT']).nullable().optional(),
  notes: inventoryNotes,
};
export const batchInput = z
  .object(batchFields)
  .strict()
  .refine((v) => v.expiresAt !== null || Boolean(v.expiryUnknownReason), {
    message: 'Sem validade informada, selecione o motivo explicitamente.',
    path: ['expiryUnknownReason'],
  });
export const openingInput = z
  .object({
    productId: z.uuid(),
    quantity: wholeUnits,
    batch: batchInput,
    reason: z.enum(['INITIAL_COUNT', 'LEGACY_REFERENCE']),
  })
  .strict();
export const receiptInput = z
  .object({
    productId: z.uuid(),
    quantity: wholeUnits,
    batch: batchInput,
    supplierReference: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .refine((v) => !v.includes('\u0000'), 'Remova caracteres de controle.'),
    supplierBatch: z
      .string()
      .trim()
      .max(80)
      .refine((v) => !v.includes('\u0000'), 'Remova caracteres de controle.')
      .transform((v) => v || null)
      .nullable()
      .optional(),
    unitCostCents: moneyCentsSchema.nullable().optional(),
    notes: inventoryNotes,
  })
  .strict();
export const planInput = z
  .object({
    productId: z.uuid(),
    plannedQuantity: wholeUnits,
    plannedDate: businessDateSchema,
    notes: inventoryNotes,
  })
  .strict();
export const productionTransition = z
  .object({
    version: z.number().int().positive(),
    action: z.enum(['START', 'CANCEL']),
    reason: z.enum(['PLAN_CHANGE', 'FAILED_BEFORE_FINISH', 'PRODUCT_UNAVAILABLE']).optional(),
  })
  .strict()
  .refine((v) => v.action !== 'CANCEL' || Boolean(v.reason), {
    message: 'Informe o motivo do cancelamento.',
  });
export const completeInput = z
  .object({ version: z.number().int().positive(), actualQuantity: wholeUnits, batch: batchInput })
  .strict();
export const wasteInput = z
  .object({
    productId: z.uuid(),
    batchId: z.uuid(),
    version: z.number().int().positive(),
    quantity: wholeUnits,
    reason: z.enum(['EXPIRED', 'DAMAGED', 'PRODUCTION_FAILURE', 'UNSOLD', 'OTHER']),
    notes: inventoryNotes,
  })
  .strict()
  .refine((v) => v.reason !== 'OTHER' || (v.notes?.length ?? 0) >= 5, {
    message: 'Explique a perda em pelo menos 5 caracteres.',
    path: ['notes'],
  });
export const adjustmentInput = z
  .object({
    productId: z.uuid(),
    batchId: z.uuid().optional(),
    version: z.number().int().positive().optional(),
    newBatch: batchInput.optional(),
    direction: z.enum(['IN', 'OUT']),
    quantity: wholeUnits,
    reason: z.enum([
      'COUNT_DIFFERENCE',
      'RECORD_CORRECTION',
      'PRODUCTION_CORRECTION',
      'RECEIPT_CORRECTION',
    ]),
    correctsMovementId: z.uuid().optional(),
    notes: inventoryNotes,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      Boolean(v.batchId) === Boolean(v.newBatch) ||
      (v.batchId && !v.version) ||
      (!v.batchId && v.direction === 'OUT')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Escolha lote existente com versão, ou novo lote para ajuste positivo.',
      });
    if (v.reason !== 'COUNT_DIFFERENCE' && !v.correctsMovementId)
      ctx.addIssue({ code: 'custom', message: 'Informe o movimento original da correção.' });
  });
export const commandSchema = <T extends z.ZodType>(payload: T) =>
  z.object({ key: z.uuid(), payload }).strict();
export const operationResultSchema = z.object({
  operationId: z.uuid(),
  targetId: z.uuid(),
  batchId: z.uuid().optional(),
  state: z.string().optional(),
  reservationIds: z.array(z.uuid()).optional(),
});
export type OperationResult = z.infer<typeof operationResultSchema>;
export const operationLookupSchema = z.object({
  found: z.boolean(),
  result: operationResultSchema.nullable(),
});
export const stockQuery = z
  .object({
    q: z.string().trim().max(120).default(''),
    state: z.enum(['active', 'inactive', 'all']).default('active'),
    origin: z.enum(['PRODUCED', 'PURCHASED', 'BOTH']).optional(),
    categoryId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const productionQuery = z
  .object({
    q: z.string().trim().max(120).default(''),
    status: productionStatusSchema.optional(),
    productId: z.uuid().optional(),
    date: businessDateSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const pageQuery = z
  .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
  .strict();
const productRef = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
  origin: z.enum(['PRODUCED', 'PURCHASED', 'BOTH']),
});
const amounts = {
  physical: quantityText,
  reserved: quantityText,
  available: quantityText,
  blocked: quantityText,
  expiredReserved: quantityText,
};
export const stockItemSchema = z.object({
  product: productRef,
  available: quantityText,
  physical: quantityText.optional(),
  reserved: quantityText.optional(),
  blocked: quantityText.optional(),
  expiredReserved: quantityText.optional(),
  consistent: z.boolean(),
});
export const stockListSchema = z.object({
  items: z.array(stockItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  businessDate: businessDateSchema,
});
export const batchDto = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  number: z.number().int(),
  reference: z.string(),
  source: z.enum(['OPENING', 'PRODUCTION', 'PURCHASED', 'ADJUSTMENT']),
  recordedAt: z.iso.datetime(),
  expiresAt: businessDateSchema.nullable(),
  expiryUnknownReason: z.string().nullable(),
  notes: z.string().nullable(),
  version: z.number().int(),
  actor: z.object({ displayName: z.string() }),
  ...amounts,
  consistent: z.boolean(),
  expired: z.boolean(),
});
export type StockBatch = z.infer<typeof batchDto>;
export const batchListSchema = z.object({
  items: z.array(batchDto),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const batchDetailSchema = z.object({
  batch: batchDto,
  receipt: z
    .object({
      id: z.uuid(),
      quantity: z.number().int(),
      supplierReference: z.string(),
      supplierBatch: z.string().nullable(),
      notes: z.string().nullable(),
      unitCostCents: z.number().int().nullable().optional(),
    })
    .nullable(),
});
export const movementDto = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  type: movementTypeSchema,
  quantity: z.number().int(),
  direction: z.enum(['IN', 'OUT']),
  reason: z.string(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  operationId: z.uuid(),
  correctsMovementId: z.uuid().nullable(),
  actor: z.object({ displayName: z.string() }),
  batch: z.object({ reference: z.string(), number: z.number().int() }),
});
export const movementListSchema = z.object({
  items: z.array(movementDto),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const productionDto = z.object({
  id: z.uuid(),
  product: productRef,
  plannedQuantity: z.number().int(),
  actualQuantity: z.number().int().nullable(),
  plannedDate: businessDateSchema,
  status: productionStatusSchema,
  notes: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  cancelReason: z.string().nullable(),
  batchId: z.uuid().nullable(),
  actor: z.object({ displayName: z.string() }),
});
export type ProductionDto = z.infer<typeof productionDto>;
export const productionListSchema = z.object({
  items: z.array(productionDto),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const reconciliationSchema = z.object({
  productId: z.uuid(),
  consistent: z.boolean(),
  checkedAt: z.iso.datetime(),
  findings: z.array(
    z.object({
      batchId: z.uuid(),
      code: z.enum(['PHYSICAL_DRIFT', 'RESERVED_DRIFT', 'ALLOCATION_STATE', 'NEGATIVE_LEDGER']),
      expected: signedQuantityText,
      actual: signedQuantityText,
    }),
  ),
});
export const reserveInput = z
  .object({
    productId: z.uuid(),
    quantity: wholeUnits,
    sourceNamespace: z.literal('INTERNAL'),
    sourceReference: z.uuid(),
    eligibilityThrough: businessDateSchema,
  })
  .strict();
export const reservationAction = z
  .object({ reservationId: z.uuid(), sourceReference: z.uuid() })
  .strict();
export function productionCanTransition(from: string, to: string) {
  return (
    (from === 'PLANNED' && ['IN_PROGRESS', 'CANCELLED'].includes(to)) ||
    (from === 'IN_PROGRESS' && ['COMPLETED', 'CANCELLED'].includes(to))
  );
}
export const yieldShortfall = (planned: number, actual: number) => Math.max(0, planned - actual);
