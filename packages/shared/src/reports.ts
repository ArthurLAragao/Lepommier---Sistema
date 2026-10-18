import { z } from 'zod';
import { businessDateSchema, BUSINESS_TIMEZONE } from './contracts.js';
import { businessDateOf, businessDayRange } from './format.js';
import type { Permission, Role } from './auth.js';
import { hasPermission } from './auth.js';

export const reportKind = z.enum([
  'daily',
  'sales',
  'products',
  'payments',
  'transactions',
  'orders',
  'production',
  'receipts',
  'waste',
  'inventory',
  'cash',
  'customers',
  'alerts',
]);
export type ReportKind = z.infer<typeof reportKind>;
export const reportFormat = z.enum(['text', 'money', 'integer', 'date', 'datetime']);
export type ReportColumn = { key: string; label: string; format: z.infer<typeof reportFormat> };
const c = (key: string, label: string, format: ReportColumn['format'] = 'text'): ReportColumn => ({
  key,
  label,
  format,
});
export const reportDefinitions: Record<
  ReportKind,
  { label: string; permission: Permission; basis: string; columns: ReportColumn[]; sums: string[] }
> = {
  daily: {
    label: 'Resumo diário',
    permission: 'reports.financial',
    basis:
      'Cada fonte usa sua própria data em Fortaleza. Retiradas pendentes refletem o estado atual e a data agendada; não são uma posição histórica.',
    columns: [
      c('day', 'Dia', 'date'),
      c('fulfilled', 'Entregas', 'integer'),
      c('gross', 'Vendas brutas entregues', 'money'),
      c('discount', 'Descontos das entregas', 'money'),
      c('net', 'Vendas entregues antes de reembolsos', 'money'),
      c('received', 'Pagamentos registrados', 'money'),
      c('refunded', 'Reembolsos registrados', 'money'),
      c('receiptsNet', 'Recebimentos líquidos', 'money'),
      c('produced', 'Unidades produzidas', 'integer'),
      c('purchased', 'Unidades compradas recebidas', 'integer'),
      c('wasted', 'Unidades descartadas', 'integer'),
      c('pending', 'Retiradas ainda pendentes', 'integer'),
    ],
    sums: [
      'fulfilled',
      'gross',
      'discount',
      'net',
      'received',
      'refunded',
      'receiptsNet',
      'produced',
      'purchased',
      'wasted',
      'pending',
    ],
  },
  sales: {
    label: 'Vendas entregues',
    permission: 'reports.financial',
    basis:
      'Data da entrega. Subtotal, desconto e total são snapshots; reembolso posterior não altera a entrega. Reembolsos da lista podem estar fora do período e são apresentados separadamente.',
    columns: [
      c('number', 'Pedido'),
      c('at', 'Entrega', 'datetime'),
      c('source', 'Origem'),
      c('gross', 'Bruto', 'money'),
      c('discount', 'Desconto', 'money'),
      c('net', 'Antes de reembolsos', 'money'),
      c('refunded', 'Reembolso vinculado (qualquer data)', 'money'),
      c('refundAt', 'Data do reembolso', 'datetime'),
    ],
    sums: ['gross', 'discount', 'net', 'refunded'],
  },
  products: {
    label: 'Vendas por produto',
    permission: 'reports.financial',
    basis:
      'Data da entrega, agrupada pelo ID estável do produto. Valores e desconto proporcional já alocado vêm dos itens históricos. Categoria é a atual. Reembolsos integrais por pedido não são atribuídos artificialmente aos produtos.',
    columns: [
      c('code', 'Código atual'),
      c('label', 'Produto atual'),
      c('historical', 'Exemplo de nome histórico'),
      c('category', 'Categoria atual'),
      c('quantity', 'Unidades entregues', 'integer'),
      c('gross', 'Bruto histórico', 'money'),
      c('discount', 'Desconto alocado', 'money'),
      c('net', 'Antes de reembolsos', 'money'),
    ],
    sums: ['quantity', 'gross', 'discount', 'net'],
  },
  payments: {
    label: 'Pagamentos e reembolsos por meio',
    permission: 'reports.financial',
    basis:
      'Data de registro de cada pagamento ou reembolso, agrupados por dia e meio. Confirmação manual; não é liquidação bancária nem lucro. Troco e valor entregue pelo cliente não aumentam os recebimentos.',
    columns: [
      c('day', 'Dia do registro', 'date'),
      c('method', 'Meio'),
      c('paymentCount', 'Pagamentos', 'integer'),
      c('refundCount', 'Reembolsos', 'integer'),
      c('received', 'Brutos registrados', 'money'),
      c('refunded', 'Reembolsos registrados', 'money'),
      c('receiptsNet', 'Líquidos registrados', 'money'),
    ],
    sums: ['paymentCount', 'refundCount', 'received', 'refunded', 'receiptsNet'],
  },
  transactions: {
    label: 'Registros de pagamentos e reembolsos',
    permission: 'reports.financial',
    basis:
      'Instante de registro de cada fonte. Reembolso é linha separada, com valor positivo em reembolsos e negativo no líquido; confirmação é manual.',
    columns: [
      c('number', 'Pedido'),
      c('at', 'Registro', 'datetime'),
      c('type', 'Registro'),
      c('method', 'Meio'),
      c('received', 'Pagamento', 'money'),
      c('refunded', 'Reembolso', 'money'),
      c('receiptsNet', 'Recebimento líquido', 'money'),
      c('actor', 'Responsável'),
    ],
    sums: ['received', 'refunded', 'receiptsNet'],
  },
  alerts: {
    label: 'Fontes dos alertas atuais',
    permission: 'reports.dashboard',
    basis:
      'Situação atual no instante de geração, independente do período histórico. A janela de validade deve ser escolhida explicitamente. Atenção operacional não é falha de integridade.',
    columns: [
      c('label', 'Referência'),
      c('product', 'Produto atual'),
      c('quantity', 'Unidades físicas', 'integer'),
      c('expiry', 'Validade inserida', 'date'),
      c('at', 'Instante', 'datetime'),
    ],
    sums: [],
  },
  orders: {
    label: 'Entrada e situação de pedidos',
    permission: 'reports.financial',
    basis:
      'Data de criação do pedido, incluindo rascunhos e cancelados; confirmação e entrega são datas separadas. Situação de entrega/pagamento é a atual. Entrada não é somada a vendas entregues.',
    columns: [
      c('number', 'Pedido'),
      c('at', 'Criação', 'datetime'),
      c('confirmedAt', 'Confirmação', 'datetime'),
      c('fulfilledAt', 'Entrega', 'datetime'),
      c('source', 'Origem'),
      c('status', 'Situação atual'),
      c('payment', 'Pagamento atual'),
      c('net', 'Total do pedido (não é receita)', 'money'),
    ],
    sums: ['net'],
  },
  production: {
    label: 'Produção concluída',
    permission: 'reports.stock',
    basis:
      'Data de conclusão. Somente COMPLETED; planos em aberto não entram. Falta de rendimento = máximo(planejado − recebido, 0), separada de descarte de produto pronto.',
    columns: [
      c('label', 'Produto atual'),
      c('at', 'Conclusão', 'datetime'),
      c('planned', 'Planejado', 'integer'),
      c('actual', 'Recebido', 'integer'),
      c('shortfall', 'Falta de rendimento', 'integer'),
      c('batch', 'Lote'),
      c('actor', 'Responsável'),
    ],
    sums: ['planned', 'actual', 'shortfall'],
  },
  receipts: {
    label: 'Comprados prontos recebidos',
    permission: 'reports.financial',
    basis:
      'Data do recebimento. Custo opcional é snapshot da compra e não comprova despesa paga ou lucro. Sem identidade de fornecedor ou notas pessoais.',
    columns: [
      c('label', 'Produto atual'),
      c('at', 'Recebimento', 'datetime'),
      c('quantity', 'Unidades', 'integer'),
      c('batch', 'Lote'),
      c('actor', 'Responsável'),
    ],
    sums: ['quantity'],
  },
  waste: {
    label: 'Descarte de produtos prontos',
    permission: 'reports.stock',
    basis:
      'Data do movimento WASTE. Não inclui falta de rendimento. Sem estimativa inventada de custo; produção acessa somente lotes de origem de produção.',
    columns: [
      c('label', 'Produto atual'),
      c('at', 'Descarte', 'datetime'),
      c('quantity', 'Unidades', 'integer'),
      c('batch', 'Lote'),
      c('reason', 'Motivo'),
      c('actor', 'Responsável'),
    ],
    sums: ['quantity'],
  },
  inventory: {
    label: 'Movimentação e conciliação de estoque',
    permission: 'reports.stock',
    basis:
      'Físico inicial: movimentos anteriores ao início; final: movimentos anteriores ao fim exclusivo. Reservas, disponibilidade e validade são atuais, não reconstruções históricas. Sem reparo automático.',
    columns: [
      c('code', 'Código atual'),
      c('label', 'Produto atual'),
      c('opening', 'Físico inicial', 'integer'),
      c('inbound', 'Entradas', 'integer'),
      c('consumed', 'Consumo', 'integer'),
      c('wasted', 'Descarte', 'integer'),
      c('adjustment', 'Ajuste líquido', 'integer'),
      c('closing', 'Físico final', 'integer'),
      c('physical', 'Físico atual', 'integer'),
      c('reserved', 'Reservado atual', 'integer'),
      c('available', 'Disponível atual (produto ativo)', 'integer'),
      c('integrity', 'Integridade atual'),
    ],
    sums: [
      'opening',
      'inbound',
      'consumed',
      'wasted',
      'adjustment',
      'closing',
      'physical',
      'reserved',
      'available',
    ],
  },
  cash: {
    label: 'Histórico de sessões de caixa',
    permission: 'reports.cash',
    basis:
      'Data de abertura da sessão, que pode atravessar dias. Fontes e fechamento seguem a Fase 6; não equivalem ao movimento financeiro diário. Contagem legada ausente não é inventada.',
    columns: [
      c('at', 'Abertura', 'datetime'),
      c('closedAt', 'Fechamento', 'datetime'),
      c('actor', 'Aberto por'),
      c('float', 'Fundo inicial', 'money'),
      c('cashReceived', 'Recebimentos em dinheiro', 'money'),
      c('cashRefunded', 'Reembolsos em dinheiro', 'money'),
      c('additions', 'Suprimentos', 'money'),
      c('withdrawals', 'Sangrias', 'money'),
      c('expenses', 'Despesas', 'money'),
      c('corrections', 'Estornos vinculados', 'money'),
      c('integrity', 'Integridade das fontes'),
      c('expected', 'Físico esperado', 'money'),
      c('counted', 'Contado', 'money'),
      c('difference', 'Diferença', 'money'),
      c('review', 'Revisão'),
    ],
    sums: [],
  },
  customers: {
    label: 'Histórico de um cadastro',
    permission: 'reports.customers',
    basis:
      'Um único cadastro selecionado pelo perfil do cliente, por data de criação dos pedidos. Entregas, pagamentos e reembolsos têm datas próprias na lista e no perfil. Sem nome/contato/CPF/notas na exportação; não é crédito ou dívida.',
    columns: [
      c('number', 'Pedido'),
      c('at', 'Criação', 'datetime'),
      c('fulfilledAt', 'Entrega', 'datetime'),
      c('source', 'Origem'),
      c('status', 'Situação atual'),
      c('payment', 'Pagamento atual'),
      c('net', 'Total do pedido', 'money'),
      c('received', 'Pagamento vinculado', 'money'),
      c('paymentAt', 'Data do pagamento', 'datetime'),
      c('refunded', 'Reembolso vinculado', 'money'),
      c('refundAt', 'Data do reembolso', 'datetime'),
    ],
    sums: ['net', 'received', 'refunded'],
  },
};
export function permittedReports(role: Role) {
  return reportKind.options.filter((k) => hasPermission(role, reportDefinitions[k].permission));
}
export const reportQuery = z
  .object({
    alert: z
      .enum([
        'expired',
        'expiring',
        'unknown',
        'pending',
        'ready',
        'overdue',
        'unpaid',
        'invalidPaid',
        'inventoryIntegrity',
        'cashReview',
        'cashIntegrity',
      ])
      .optional(),
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    direction: z.enum(['asc', 'desc']).default('desc'),
    productId: z.uuid().optional(),
    customerId: z.uuid().optional(),
    source: z.enum(['COUNTER', 'WHATSAPP']).optional(),
    status: z
      .enum(['DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'FULFILLED', 'CANCELLED'])
      .optional(),
    method: z.enum(['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD']).optional(),
    recordType: z.enum(['PAYMENT', 'REFUND']).optional(),
    expiryDays: z.coerce.number().int().min(0).max(30).optional(),
  })
  .strict();
export type ReportQuery = z.infer<typeof reportQuery>;
export const reportProductQuery = z
  .object({
    q: z.string().trim().max(80).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const reportProductOptions = z.object({
  items: z.array(
    z.object({ id: z.uuid(), code: z.string(), name: z.string(), active: z.boolean() }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.literal(20),
});
export type ReportProductOption = z.infer<typeof reportProductOptions>['items'][number];
export function shiftBusinessDate(date: string, days: number) {
  businessDateSchema.parse(date);
  return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
export function reportPreset(today: string, preset: 'today' | 'yesterday' | 'seven' | 'month') {
  businessDateSchema.parse(today);
  return {
    from:
      preset === 'yesterday'
        ? shiftBusinessDate(today, -1)
        : preset === 'seven'
          ? shiftBusinessDate(today, -6)
          : preset === 'month'
            ? today.slice(0, 8) + '01'
            : today,
    to: preset === 'yesterday' ? shiftBusinessDate(today, -1) : today,
  };
}
export function reportPeriod(q: Pick<ReportQuery, 'from' | 'to'>, now: Date) {
  const today = businessDateOf(now);
  const from = q.from ?? today;
  const to = q.to ?? today;
  if (from > to || to > today || (Date.parse(to) - Date.parse(from)) / 86400000 > 365)
    throw new Error(
      'Escolha datas válidas até hoje em Fortaleza, do início ao fim, com no máximo 366 dias.',
    );
  return {
    from,
    to,
    start: businessDayRange(from).start.toISOString(),
    end: businessDayRange(to).end.toISOString(),
    timezone: BUSINESS_TIMEZONE,
  };
}
export const reportCell = z.string().max(2000).nullable();
export const reportRow = z.object({
  id: z.string(),
  cells: z.record(z.string(), reportCell),
  drill: z
    .object({ kind: z.enum(['order', 'product', 'batch', 'cash', 'production']), id: z.uuid() })
    .nullable(),
});
export const reportResult = z.object({
  kind: reportKind,
  label: z.string(),
  basis: z.string(),
  period: z.object({
    from: businessDateSchema,
    to: businessDateSchema,
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    timezone: z.literal(BUSINESS_TIMEZONE),
  }),
  generatedAt: z.iso.datetime(),
  businessDate: businessDateSchema,
  columns: z.array(z.object({ key: z.string(), label: z.string(), format: reportFormat })),
  items: z.array(reportRow),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.literal(20),
  totals: z.record(z.string(), z.string()),
  exportLimit: z.literal(1000),
});
export type ReportResult = z.infer<typeof reportResult>;
export const reportExportResult = z.object({
  csv: z.string(),
  filename: z.string().regex(/^le-pommier-[a-z]+-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/),
  rows: z.number().int(),
  generatedAt: z.iso.datetime(),
  businessDate: businessDateSchema,
});
export const dashboardResult = z.object({
  period: reportResult.shape.period,
  generatedAt: z.iso.datetime(),
  businessDate: businessDateSchema,
  metrics: z.object({
    rows: z.string(),
    intake: z.string(),
    confirmed: z.string(),
    fulfilled: z.string(),
    gross: z.string(),
    discount: z.string(),
    net: z.string(),
    received: z.string(),
    refunded: z.string(),
    receiptsNet: z.string(),
    produced: z.string(),
    purchased: z.string(),
    wasted: z.string(),
    pending: z.string(),
  }),
  alerts: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      count: z.string().nullable(),
      severity: z.enum(['attention', 'integrity']),
      report: reportKind,
      examples: z.array(reportRow),
    }),
  ),
  cash: z
    .object({
      id: z.uuid(),
      openedAt: z.iso.datetime(),
      expectedCents: z.string(),
      consistent: z.boolean(),
    })
    .nullable(),
  latestClosed: z
    .object({
      id: z.uuid(),
      closedAt: z.iso.datetime(),
      differenceCents: z.string().nullable(),
      review: z.string(),
      consistent: z.boolean(),
    })
    .nullable(),
});
