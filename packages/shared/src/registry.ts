import { z } from 'zod';
import { moneyCentsSchema } from './contracts.js';

export const textName = z
  .string()
  .trim()
  .min(2, 'Informe pelo menos 2 caracteres.')
  .max(120, 'Use até 120 caracteres.')
  .refine(
    (v) =>
      Array.from(v).length >= 2 &&
      !Array.from(v).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
    'Confira o nome informado.',
  );
export const nameKey = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const ddds = new Set(
  '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(
    ' ',
  ),
);
export function normalizePhone(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (!/^\+?[\d\s().-]+$/.test(value)) throw new Error('Informe telefone brasileiro com DDD.');
  let digits = value.replace(/\D/g, '');
  if (value.startsWith('+') || digits.length >= 12) {
    if (!digits.startsWith('55') || ![12, 13].includes(digits.length))
      throw new Error('Use +55 com DDD e número completo.');
    digits = digits.slice(2);
  }
  if (!ddds.has(digits.slice(0, 2)) || !/^(?:\d{2}[2-5]\d{7}|\d{2}9\d{8})$/.test(digits))
    throw new Error('Informe DDD e número completo, sem acrescentar dígitos.');
  return `+55${digits}`;
}
export function formatPhone(value: string | null | undefined): string {
  if (!value) return 'Não informado';
  const digits = value.slice(3);
  const split = digits.length === 11 ? 7 : 6;
  return `+55 (${digits.slice(0, 2)}) ${digits.slice(2, split)}-${digits.slice(split)}`;
}
export function validCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(value[i]) * (size + 1 - i);
    const digit = ((sum * 10) % 11) % 10;
    if (digit !== Number(value[size])) return false;
  }
  return true;
}
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use até ${max} caracteres.`)
    .refine((v) => !v.includes('\u0000') && !v.includes('\u007f'), 'Remova caracteres de controle.')
    .transform((v) => v || null)
    .nullable()
    .optional();
export const phoneSchema = z
  .string()
  .max(40)
  .transform((value, ctx) => {
    try {
      return normalizePhone(value);
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe telefone brasileiro completo com DDD, ou deixe vazio.',
      });
      return z.NEVER;
    }
  })
  .nullable()
  .optional();
export const cpfSchema = z
  .string()
  .trim()
  .max(20)
  .transform((v) => (v === '' ? null : /^[\d.\-\s]+$/.test(v) ? v.replace(/\D/g, '') : v))
  .refine((v) => v === null || validCpf(v), 'CPF inválido. Confira os 11 dígitos e verificadores.')
  .nullable()
  .optional();
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .transform((v) => v || null)
  .refine(
    (v) => v === null || z.email().safeParse(v).success,
    'Informe um e-mail válido, ou deixe vazio.',
  )
  .nullable()
  .optional();
export const birthdaySchema = z
  .union([
    z.literal('').transform(() => null),
    z.iso
      .date('Informe uma data completa válida (AAAA-MM-DD).')
      .refine((v) => v >= '1900-01-01', 'Use uma data a partir de 1900.'),
  ])
  .nullable()
  .optional();
export function birthdayAllowed(value: string | null | undefined, today: string) {
  return !value || value <= today;
}
export const duplicateReasonSchema = z.enum(['SHARED_CONTACT', 'CONFIRMED_DISTINCT']);
export const customerFields = {
  name: textName,
  phone: phoneSchema,
  email: emailSchema,
  birthday: birthdaySchema,
  cpf: cpfSchema,
  address: nullableText(300),
  notes: nullableText(1000),
};
export const customerCreateSchema = z
  .object({ ...customerFields, duplicateOverrideReason: duplicateReasonSchema.optional() })
  .strict();
export const customerEditSchema = z
  .object({
    ...customerFields,
    version: z.number().int().positive(),
    duplicateOverrideReason: duplicateReasonSchema.optional(),
  })
  .strict();
export type CustomerInput = z.infer<typeof customerCreateSchema>;
export const stateFilter = z.enum(['active', 'inactive', 'all']).default('active');
export const customerQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    state: stateFilter,
    page: z.coerce.number().int().min(1).max(100000).default(1),
    sort: z.enum(['name', 'registration', 'newest']).default('name'),
  })
  .strict();
export type CustomerQuery = z.infer<typeof customerQuerySchema>;
export const statusChangeSchema = z
  .object({
    version: z.number().int().positive(),
    active: z.boolean(),
    reason: z.enum(['CUSTOMER_REQUEST', 'RECORD_REVIEW']),
  })
  .strict();
export const anonymizeSchema = z
  .object({
    version: z.number().int().positive(),
    confirmation: z.string(),
    reason: z.enum(['CUSTOMER_REQUEST', 'RETENTION_REVIEW', 'DATA_MINIMIZATION']),
  })
  .strict();
export const marketingStateSchema = z.enum(['UNKNOWN', 'OPTED_IN', 'OPTED_OUT']);
export const marketingSchema = z
  .object({
    version: z.number().int().positive(),
    state: marketingStateSchema,
    source: z.enum(['IN_PERSON', 'CUSTOMER_REQUEST', 'RECORD_REVIEW']),
    evidence: nullableText(200),
    reason: z.enum(['CUSTOMER_REQUEST', 'CORRECTION', 'NO_EVIDENCE']),
  })
  .strict()
  .refine(
    (value) =>
      value.state !== 'OPTED_IN' ||
      (value.reason !== 'NO_EVIDENCE' &&
        (value.source !== 'RECORD_REVIEW' || Boolean(value.evidence))),
    {
      message:
        'Para registrar aceite, informe uma base confirmada; revisão de registro exige referência.',
    },
  );
export const registrationLabel = (number: number) => `CLI-${String(number).padStart(6, '0')}`;
export const customerDtoSchema = z.object({
  id: z.uuid(),
  registrationNumber: z.number().int(),
  registration: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  active: z.boolean(),
  anonymizedAt: z.iso.datetime().nullable(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  email: z.string().nullable().optional(),
  birthday: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  cpf: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  marketingState: marketingStateSchema.optional(),
});
export type CustomerDto = z.infer<typeof customerDtoSchema>;
export const customerListSchema = z.object({
  items: z.array(customerDtoSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const customerDetailSchema = z.object({
  customer: customerDtoSchema,
  marketingHistory: z
    .array(
      z.object({
        id: z.uuid(),
        previousState: marketingStateSchema,
        state: marketingStateSchema,
        source: z.string(),
        reason: z.string(),
        evidence: z.string().nullable(),
        actorId: z.uuid(),
        actor: z.object({ displayName: z.string() }),
        createdAt: z.iso.datetime(),
      }),
    )
    .optional(),
});
export const duplicateSchema = z.object({
  type: z.enum(['CPF', 'PHONE', 'EMAIL', 'NAME']),
  id: z.string().optional(),
  registration: z.string().optional(),
  name: z.string().optional(),
  version: z.number().int().optional(),
  row: z.number().int().optional(),
});
export type Duplicate = z.infer<typeof duplicateSchema>;
export const duplicatesSchema = z.object({ matches: z.array(duplicateSchema) });

export const categorySchema = z
  .object({ name: textName, active: z.boolean().default(true) })
  .strict();
export const categoryEditSchema = categorySchema.extend({ version: z.number().int().positive() });
export const categoryDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  active: z.boolean(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CategoryDto = z.infer<typeof categoryDtoSchema>;
export const categoryQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    state: stateFilter,
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const categoryListSchema = z.object({
  items: z.array(categoryDtoSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const productOriginSchema = z.enum(['PRODUCED', 'PURCHASED', 'BOTH']);
export const originLabels = {
  PRODUCED: 'Produzido',
  PURCHASED: 'Comprado pronto',
  BOTH: 'Ambas as origens',
} as const;
export const productFields = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9][A-Z0-9._-]{1,31}$/,
      'Use código de 2 a 32 letras, números, ponto, hífen ou sublinhado.',
    ),
  name: textName,
  categoryId: z.uuid(),
  description: nullableText(1000),
  origin: productOriginSchema,
  sellingPriceCents: moneyCentsSchema,
  estimatedCostCents: moneyCentsSchema.nullable().optional(),
  active: z.boolean().default(true),
  storageInstructions: nullableText(500),
  shelfLifeReference: nullableText(300),
  allowZeroPrice: z.boolean().default(false),
};
const zeroCheck = (v: { sellingPriceCents: number; allowZeroPrice: boolean }) =>
  v.sellingPriceCents !== 0 || v.allowZeroPrice;
export const productCreateSchema = z
  .object(productFields)
  .strict()
  .refine(zeroCheck, 'Confirme explicitamente o cadastro com preço zero.');
export const productEditSchema = z
  .object({
    ...productFields,
    version: z.number().int().positive(),
    reason: z.enum(['CATALOG_CORRECTION', 'PRICE_REVIEW']),
  })
  .strict()
  .refine(zeroCheck, 'Confirme explicitamente o cadastro com preço zero.');
export const productQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    state: stateFilter,
    categoryId: z.uuid().optional(),
    origin: productOriginSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    sort: z.enum(['name', 'code', 'price']).default('name'),
  })
  .strict();
export const productDtoSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  categoryId: z.uuid(),
  category: categoryDtoSchema,
  description: z.string().nullable(),
  origin: productOriginSchema,
  sellingPriceCents: moneyCentsSchema,
  estimatedCostCents: moneyCentsSchema.nullable().optional(),
  active: z.boolean(),
  storageInstructions: z.string().nullable(),
  shelfLifeReference: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProductDto = z.infer<typeof productDtoSchema>;
export const productListSchema = z.object({
  items: z.array(productDtoSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const importFields = [
  'name',
  'phone',
  'email',
  'birthday',
  'cpf',
  'address',
  'notes',
] as const;
export const importLabels: Record<(typeof importFields)[number], string> = {
  name: 'Nome',
  phone: 'Telefone',
  email: 'E-mail',
  birthday: 'Nascimento completo',
  cpf: 'CPF',
  address: 'Endereço / referência',
  notes: 'Observações',
};
export const csvInputSchema = z
  .object({ csv: z.string().max(262144), delimiter: z.enum([',', ';']) })
  .strict();
export const importMappingSchema = z
  .object({
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional(),
    birthday: z.string().optional(),
    cpf: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();
export const importPreviewInput = csvInputSchema.extend({ mapping: importMappingSchema });
export type ImportMapping = z.infer<typeof importMappingSchema>;
export const importChoiceSchema = z
  .object({
    row: z.number().int().min(1).max(100),
    action: z.enum(['CREATE', 'SKIP']),
    reason: duplicateReasonSchema.optional(),
  })
  .strict();
export const importConfirmSchema = z
  .object({
    reviewToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    choices: z.array(importChoiceSchema).max(100),
  })
  .strict();
export const importRowSchema = z.object({
  row: z.number().int(),
  original: z.record(z.string(), z.string()),
  customer: customerCreateSchema.nullable(),
  errors: z.array(z.string()),
  duplicates: z.array(duplicateSchema),
});
export type ImportRow = z.infer<typeof importRowSchema>;
export const importPreviewSchema = z.object({
  id: z.uuid(),
  reviewToken: z.string(),
  expiresAt: z.iso.datetime(),
  rows: z.array(importRowSchema),
});
export type ImportPreview = z.infer<typeof importPreviewSchema>;
export const importResultSchema = z.object({
  created: z.number().int(),
  skipped: z.number().int(),
  rows: z.array(
    z.object({
      row: z.number().int(),
      status: z.enum(['CREATED', 'SKIPPED']),
      id: z.uuid().optional(),
      registration: z.string().optional(),
    }),
  ),
});
export const importJobSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED']),
  result: importResultSchema.nullable(),
});
export const csvDownloadSchema = z.object({ csv: z.string(), count: z.number().int() });
