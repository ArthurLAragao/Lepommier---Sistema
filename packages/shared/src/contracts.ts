import { z } from 'zod';

export const BUSINESS_TIMEZONE = 'America/Fortaleza' as const;
export const APP_VERSION = '0.1.0';
export const moneyCentsSchema = z.number().int().min(0).max(99_999_999);
export const unitQuantitySchema = z.number().int().min(1).max(100_000);
export const businessDateSchema = z.iso.date().refine((value) => {
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2099;
}, 'Informe uma data válida entre 2000 e 2099.');

export const moduleIdSchema = z.enum([
  'overview',
  'sales',
  'orders',
  'customers',
  'products',
  'production',
  'inventory',
  'cash',
  'reports',
  'settings',
]);
export type ModuleId = z.infer<typeof moduleIdSchema>;

export const modules = [
  {
    id: 'overview',
    label: 'Visão geral',
    phase: 1,
    available: true,
    description: 'Acompanhe a preparação do sistema e a conexão local.',
  },
  {
    id: 'sales',
    label: 'Vendas',
    phase: 5,
    available: true,
    description: 'Vendas de balcão com pagamento, baixa de estoque e comprovante não fiscal.',
  },
  {
    id: 'orders',
    label: 'Pedidos',
    phase: 5,
    available: true,
    description: 'Pedidos do WhatsApp registrados manualmente, com reserva e retirada.',
  },
  {
    id: 'customers',
    label: 'Clientes',
    phase: 3,
    available: true,
    description:
      'Cadastros, perfis, preferências e histórico conectado de pedidos, compras e pagamentos.',
  },
  {
    id: 'products',
    label: 'Produtos',
    phase: 3,
    available: true,
    description: 'Catálogo, categorias, preços e origem dos produtos.',
  },
  {
    id: 'production',
    label: 'Produção',
    phase: 4,
    available: true,
    description: 'Planejamento, conclusão da produção e recebimento por lote.',
  },
  {
    id: 'inventory',
    label: 'Estoque',
    phase: 4,
    available: true,
    description: 'Entradas, reservas, perdas e movimentações rastreáveis.',
  },
  {
    id: 'cash',
    label: 'Caixa',
    phase: 6,
    available: false,
    description: 'Abertura, entradas, saídas e conferência do fechamento.',
  },
  {
    id: 'reports',
    label: 'Relatórios',
    phase: 7,
    available: false,
    description: 'Vendas concluídas, recebimentos e conciliação por período.',
  },
  {
    id: 'settings',
    label: 'Configurações',
    phase: 1,
    available: true,
    description: 'Confira a conexão e as informações desta instalação.',
  },
] as const satisfies ReadonlyArray<{
  id: ModuleId;
  label: string;
  phase: number;
  available: boolean;
  description: string;
}>;

export const databaseStatusSchema = z.object({
  status: z.enum(['ready', 'unavailable', 'not_configured']),
  checkedAt: z.iso.datetime(),
});
export type DatabaseStatus = z.infer<typeof databaseStatusSchema>;

export const systemStatusSchema = z.object({
  version: z.string(),
  phase: z.literal(5),
  businessTimezone: z.literal(BUSINESS_TIMEZONE),
  businessDate: businessDateSchema,
  timestamp: z.iso.datetime(),
  database: databaseStatusSchema,
  operational: z.literal(false),
});
export type SystemStatus = z.infer<typeof systemStatusSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;
