import { z } from 'zod';

export const roleSchema = z.enum(['OWNER', 'MANAGER', 'CASHIER', 'PRODUCTION']);
export type Role = z.infer<typeof roleSchema>;
export const roleLabels: Record<Role, string> = {
  OWNER: 'Proprietário(a)',
  MANAGER: 'Gerente',
  CASHIER: 'Caixa',
  PRODUCTION: 'Produção',
};
export type Permission =
  | 'profile.self'
  | 'accounts.manage'
  | 'security.review'
  | 'customers.read'
  | 'customers.write'
  | 'customers.manage'
  | 'customers.private'
  | 'customers.operational'
  | 'customers.marketing'
  | 'customers.import'
  | 'customers.export'
  | 'customers.anonymize'
  | 'catalog.read'
  | 'catalog.manage'
  | 'catalog.cost'
  | 'inventory.availability'
  | 'inventory.read'
  | 'inventory.opening'
  | 'inventory.receive'
  | 'inventory.waste'
  | 'inventory.adjust'
  | 'inventory.cost'
  | 'inventory.reconcile'
  | 'inventory.reservations'
  | 'inventory.operations'
  | 'production.manage'
  | 'orders.read'
  | 'orders.write'
  | 'orders.checkout'
  | 'orders.pay'
  | 'orders.handover'
  | 'orders.cancel'
  | 'orders.refund'
  | 'orders.discount'
  | 'orders.operations'
  | 'cash.open'
  | 'cash.current'
  | 'cash.read'
  | 'cash.movements'
  | 'cash.close'
  | 'cash.review'
  | 'cash.correct'
  | 'cash.operations';
const cashManagement: Permission[] = [
  'cash.current',
  'cash.read',
  'cash.movements',
  'cash.close',
  'cash.operations',
];
const orderOperations: Permission[] = [
  'orders.read',
  'orders.write',
  'orders.checkout',
  'orders.pay',
  'orders.handover',
  'orders.cancel',
  'orders.operations',
];
const inventoryManagement: Permission[] = [
  'inventory.availability',
  'inventory.read',
  'inventory.opening',
  'inventory.receive',
  'inventory.waste',
  'inventory.adjust',
  'inventory.cost',
  'inventory.reconcile',
  'inventory.reservations',
  'inventory.operations',
  'production.manage',
];
const customerBasic: Permission[] = ['customers.read', 'customers.write'];
const customerManagement: Permission[] = [
  ...customerBasic,
  'customers.operational',
  'customers.manage',
];
const permissions: Record<Role, readonly Permission[]> = {
  OWNER: [
    ...cashManagement,
    'cash.review',
    'cash.correct',
    ...orderOperations,
    'orders.refund',
    'orders.discount',
    'cash.open',
    ...inventoryManagement,
    'profile.self',
    'accounts.manage',
    'security.review',
    ...customerManagement,
    'customers.private',
    'customers.marketing',
    'customers.import',
    'customers.export',
    'customers.anonymize',
    'catalog.read',
    'catalog.manage',
    'catalog.cost',
  ],
  MANAGER: [
    ...cashManagement,
    ...orderOperations,
    'orders.discount',
    'cash.open',
    ...inventoryManagement,
    'profile.self',
    ...customerManagement,
    'catalog.read',
    'catalog.manage',
    'catalog.cost',
  ],
  CASHIER: [
    'cash.current',
    ...orderOperations,
    'profile.self',
    ...customerBasic,
    'catalog.read',
    'inventory.availability',
  ],
  PRODUCTION: [
    'profile.self',
    'catalog.read',
    'inventory.availability',
    'inventory.read',
    'inventory.waste',
    'inventory.operations',
    'production.manage',
  ],
};
export const hasPermission = (role: Role, permission: Permission): boolean =>
  permissions[role].includes(permission);
export const normalizeLogin = (value: string): string => value.trim().toLowerCase();
export const loginIdentifierSchema = z
  .string()
  .max(64, 'Informe um usuário de 3 a 32 caracteres, sem espaços internos.')
  .transform(normalizeLogin)
  .pipe(
    z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9._-]{2,31}$/,
        'Use de 3 a 32 letras sem acento, números, ponto, hífen ou sublinhado.',
      ),
  );
export const passwordSchema = z
  .string()
  .max(256, 'Use uma senha com 12 a 128 caracteres.')
  .refine(
    (value) =>
      Array.from(value).length >= 12 && Array.from(value).length <= 128 && value.trim().length > 0,
    'Use uma senha com 12 a 128 caracteres.',
  );
const nameSchema = z
  .string()
  .trim()
  .min(2, 'Informe um nome com pelo menos 2 caracteres.')
  .max(80, 'Use um nome com até 80 caracteres.');
const currentPasswordSchema = z
  .string()
  .min(1, 'Informe sua senha atual.')
  .max(256, 'A senha ultrapassa o limite permitido.');
export const loginSchema = z
  .object({ loginIdentifier: loginIdentifierSchema, password: currentPasswordSchema })
  .strict();
export const setupSchema = z
  .object({
    loginIdentifier: loginIdentifierSchema,
    displayName: nameSchema,
    password: passwordSchema,
    installationSecret: z
      .string()
      .min(1, 'Informe a chave privada de instalação.')
      .max(256, 'Confira a chave no arquivo local de instalação.'),
  })
  .strict();
export const createAccountSchema = z
  .object({
    loginIdentifier: loginIdentifierSchema,
    displayName: nameSchema,
    role: roleSchema,
    password: passwordSchema,
  })
  .strict();
export const editAccountSchema = z
  .object({
    displayName: nameSchema,
    role: roleSchema,
    active: z.boolean(),
    version: z.number().int().positive(),
    reason: z
      .string()
      .trim()
      .min(3, 'Informe um motivo com pelo menos 3 caracteres.')
      .max(200, 'Use um motivo com até 200 caracteres.'),
  })
  .strict();
export const changePasswordSchema = z
  .object({ currentPassword: currentPasswordSchema, newPassword: passwordSchema })
  .strict();
export const resetPasswordSchema = z
  .object({
    ownerPassword: currentPasswordSchema,
    newPassword: passwordSchema,
    reason: z
      .string()
      .trim()
      .min(5, 'Informe um motivo com pelo menos 5 caracteres.')
      .max(200, 'Use um motivo com até 200 caracteres.'),
  })
  .strict();
export const userSchema = z.object({
  id: z.uuid(),
  loginIdentifier: z.string(),
  displayName: z.string(),
  role: roleSchema,
  active: z.boolean(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Account = z.infer<typeof userSchema>;
export const currentUserSchema = z.object({ user: userSchema, expiresAt: z.iso.datetime() });
export type CurrentUser = z.infer<typeof currentUserSchema>;
export const authStateSchema = z.object({ initialized: z.boolean(), setupAvailable: z.boolean() });
export const accountListSchema = z.object({
  users: z.array(userSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const SESSION_HOURS = 12;
export const sessionExpiry = (now: Date): Date =>
  new Date(now.getTime() + SESSION_HOURS * 3_600_000);
export const CSRF_HEADER_VALUE = '1';
