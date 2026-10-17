import { z } from 'zod';

export const roleSchema = z.enum(['OWNER', 'MANAGER', 'CASHIER', 'PRODUCTION']);
export type Role = z.infer<typeof roleSchema>;
export const roleLabels: Record<Role, string> = {
  OWNER: 'Proprietário(a)',
  MANAGER: 'Gerente',
  CASHIER: 'Caixa',
  PRODUCTION: 'Produção',
};
export type Permission = 'profile.self' | 'accounts.manage' | 'security.review';
const permissions: Record<Role, readonly Permission[]> = {
  OWNER: ['profile.self', 'accounts.manage', 'security.review'],
  MANAGER: ['profile.self'],
  CASHIER: ['profile.self'],
  PRODUCTION: ['profile.self'],
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
