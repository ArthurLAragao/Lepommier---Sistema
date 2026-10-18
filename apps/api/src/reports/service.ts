import { Prisma } from '../generated/prisma/client.js';
import { AuthService, audit, type Principal } from '../auth/service.js';
import { CashService } from '../cash/service.js';
import { AppError } from '../errors.js';
import {
  businessDateOf,
  reportDefinitions,
  reportProductOptions,
  type reportProductQuery,
  nameKey,
  reportPeriod,
  reportResult,
  dashboardResult,
  reportExportResult,
  escapeCsvCell,
  hasPermission,
  type ReportKind,
  type ReportQuery,
  type Role,
  type ReportColumn,
} from '@pommier/shared';
import { reportBase, alertBase } from './queries.js';
type Tx = Prisma.TransactionClient;
type RawRow = Record<string, unknown>;
const fail = (code: string, message: string, status = 400) => new AppError(status, code, message);
export function columnsFor(kind: ReportKind, role: Role): ReportColumn[] {
  const cols = [...reportDefinitions[kind].columns];
  if (kind === 'daily')
    cols.splice(
      1,
      0,
      { key: 'intake', label: 'Pedidos criados', format: 'integer' },
      { key: 'confirmed', label: 'Pedidos confirmados nesta data', format: 'integer' },
    );
  if (kind === 'receipts' && hasPermission(role, 'reports.cost'))
    cols.push({
      key: 'unitCost',
      label: 'Custo unitário informado (não é despesa paga)',
      format: 'money',
    });
  if (kind === 'cash')
    for (const [prefix, label] of [
      ['pix', 'Pix'],
      ['debit', 'Débito'],
      ['credit', 'Crédito'],
    ] as const)
      for (const [suffix, name] of [
        ['Received', 'bruto'],
        ['Refunded', 'reembolsos'],
        ['Net', 'líquido'],
      ] as const)
        cols.push({ key: prefix + suffix, label: label + ' ' + name, format: 'money' });
  return cols;
}
const cell = (v: unknown) =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v);
function row(raw: RawRow, columns: ReportColumn[]) {
  return {
    id: String(raw.id),
    cells: Object.fromEntries(columns.map((c) => [c.key, cell(raw[c.key])])),
    drill:
      raw.drillKind && raw.drillId
        ? { kind: String(raw.drillKind), id: String(raw.drillId) }
        : null,
  };
}
export function validateReportFilters(kind: ReportKind, q: ReportQuery) {
  const allowed = {
    productId: [
      'sales',
      'products',
      'orders',
      'production',
      'receipts',
      'waste',
      'inventory',
      'customers',
    ],
    customerId: ['customers'],
    source: ['sales', 'products', 'orders', 'customers'],
    status: ['orders', 'customers'],
    method: ['payments', 'transactions'],
    recordType: ['transactions'],
    expiryDays: ['alerts'],
    alert: ['alerts'],
  } as Record<string, string[]>;
  for (const [field, kinds] of Object.entries(allowed))
    if (q[field as keyof ReportQuery] !== undefined && !kinds.includes(kind))
      throw fail('REPORT_FILTER', 'Este filtro não se aplica ao relatório escolhido.');
  if (kind === 'customers' && !q.customerId)
    throw fail(
      'REPORT_CUSTOMER_REQUIRED',
      'Abra o histórico pelo perfil de um único cliente; não há exportação geral de clientes por relatórios.',
    );
  if (kind === 'alerts' && q.alert === 'expiring' && q.expiryDays === undefined)
    throw fail('REPORT_FILTER', 'Escolha explicitamente a janela de validade entre 0 e 30 dias.');
}
export class ReportingService {
  constructor(
    readonly auth: AuthService,
    readonly clock: () => Date,
  ) {}
  products(p: Principal, q: import('zod').z.infer<typeof reportProductQuery>) {
    return this.snapshot(p, 'reports.stock', async (tx, a) => {
      const where: Prisma.ProductWhereInput = {
        AND: [
          ...(a.role === 'PRODUCTION'
            ? [{ OR: [{ active: true }, { batches: { some: {} } }] }]
            : []),
          ...(q.q
            ? [
                {
                  OR: [
                    { nameKey: { contains: nameKey(q.q) } },
                    { code: { contains: q.q.toUpperCase() } },
                  ],
                },
              ]
            : []),
        ],
      };
      return reportProductOptions.parse({
        items: await tx.product.findMany({
          where,
          select: { id: true, code: true, name: true, active: true },
          orderBy: [{ nameKey: 'asc' }, { id: 'asc' }],
          take: 20,
          skip: (q.page - 1) * 20,
        }),
        total: await tx.product.count({ where }),
        page: q.page,
        pageSize: 20,
      });
    });
  }
  period(q: ReportQuery, now: Date) {
    try {
      return reportPeriod(q, now);
    } catch {
      throw fail(
        'REPORT_PERIOD',
        'Escolha datas válidas até hoje em Fortaleza, início antes do fim e no máximo 366 dias.',
      );
    }
  }
  async snapshot<T>(
    p: Principal,
    permission: Parameters<AuthService['withReadSnapshot']>[1],
    fn: (tx: Tx, actor: { id: string; role: Role }) => Promise<T>,
  ) {
    try {
      return await this.auth.withReadSnapshot(p, permission, fn);
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw fail(
        'REPORT_UNAVAILABLE',
        'Não foi possível consultar as fontes. Tente novamente ou reduza o período; se persistir, solicite revisão técnica. Nenhum total foi inventado.',
        503,
      );
    }
  }
  async tableTx(
    tx: Tx,
    role: Role,
    kind: ReportKind,
    q: ReportQuery,
    now: Date,
    exporting = false,
  ) {
    validateReportFilters(kind, q);
    const period = this.period(q, now);
    if (
      kind === 'customers' &&
      !(await tx.customer.findUnique({ where: { id: q.customerId! }, select: { id: true } }))
    )
      throw fail('CUSTOMER_NOT_FOUND', 'Cadastro não encontrado.', 404);
    const columns = columnsFor(kind, role),
      base = reportBase(kind, q, period, role, now);
    const sums = [
      ...reportDefinitions[kind].sums,
      ...(kind === 'daily' ? ['intake', 'confirmed'] : []),
    ].filter((k) => !(kind === 'inventory' && k === 'available'));
    const fields = sums.map(
      (key) =>
        Prisma.sql`${key}::text,COALESCE(SUM((${Prisma.raw('"' + key + '"')})::numeric),0)::text`,
    );
    const extra =
      kind === 'orders'
        ? Prisma.sql`, 'counter',COUNT(*) FILTER(WHERE "sourceCode"='COUNTER')::text,'whatsapp',COUNT(*) FILTER(WHERE "sourceCode"='WHATSAPP')::text,'unpaid',COUNT(*) FILTER(WHERE payment='Não pago')::text,'paid',COUNT(*) FILTER(WHERE payment='Pago')::text,'refundedCount',COUNT(*) FILTER(WHERE payment='Reembolsado')::text,'ready',COUNT(*) FILTER(WHERE "statusCode"='READY')::text,'cancelled',COUNT(*) FILTER(WHERE "statusCode"='CANCELLED')::text,'fulfilled',COUNT(*) FILTER(WHERE "statusCode"='FULFILLED')::text`
        : Prisma.empty;
    const order =
      q.direction === 'asc' ? Prisma.sql`sort ASC,id ASC` : Prisma.sql`sort DESC,id DESC`;
    const size = exporting ? 1001 : 20,
      offset = exporting ? 0 : (q.page - 1) * 20;
    const [result] = await tx.$queryRaw<
      Array<{ items: RawRow[]; count: string; totals: Record<string, string> }>
    >(
      Prisma.sql`WITH r AS (${base}), page AS(SELECT * FROM r ORDER BY ${order} LIMIT ${size} OFFSET ${offset}), totals AS(SELECT COUNT(*)::text count,jsonb_build_object('rows',COUNT(*)::text ${fields.length ? Prisma.sql`,${Prisma.join(fields, ',')}` : Prisma.empty}${extra}) value FROM r) SELECT COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY ${order}) FROM page),'[]'::jsonb) items,count,totals.value totals FROM totals`,
    );
    const total = Number(result!.count);
    if (!Number.isSafeInteger(total))
      throw fail('REPORT_LIMIT', 'Consulta grande demais; reduza o período.', 413);
    if (exporting && total > 1000)
      throw fail(
        'REPORT_EXPORT_LIMIT',
        'O filtro contém mais de 1.000 linhas. Reduza o período/filtros; nenhum arquivo foi truncado.',
        413,
      );
    return reportResult.parse({
      kind,
      label: reportDefinitions[kind].label,
      basis: reportDefinitions[kind].basis,
      period,
      generatedAt: now.toISOString(),
      businessDate: businessDateOf(now),
      columns,
      items: result!.items.map((r) => row(r, columns)),
      total,
      page: exporting ? 1 : q.page,
      pageSize: 20,
      totals: result!.totals,
      exportLimit: 1000,
    });
  }
  table(p: Principal, kind: ReportKind, q: ReportQuery) {
    const now = this.clock();
    return this.snapshot(p, reportDefinitions[kind].permission, (tx, a) =>
      this.tableTx(tx, a.role, kind, q, now),
    );
  }
  async export(p: Principal, kind: ReportKind, q: ReportQuery, requestId: string) {
    const now = this.clock();
    const data = await this.snapshot(p, 'reports.export', async (tx, a) => {
      if (
        !hasPermission(a.role, reportDefinitions[kind].permission) ||
        (kind === 'customers' && !hasPermission(a.role, 'customers.export'))
      )
        throw fail('FORBIDDEN', 'Seu perfil não permite esta exportação.', 403);
      return this.tableTx(tx, a.role, kind, q, now, true);
    });
    const csv =
      '\uFEFF' +
      [
        data.columns
          .map((c) =>
            escapeCsvCell(
              c.label +
                (c.format === 'money'
                  ? ' (centavos)'
                  : c.format === 'datetime'
                    ? ' (ISO com fuso)'
                    : ''),
            ),
          )
          .join(';'),
        ...data.items.map((r) => data.columns.map((c) => escapeCsvCell(r.cells[c.key])).join(';')),
      ].join('\r\n') +
      '\r\n';
    // Only this short audit/write recheck takes the security lock, after the
    // consistent read is finished. Revoked export authority discards the bytes.
    await this.auth.withPermission(p, 'reports.export', async (tx, a) => {
      if (!hasPermission(a.role, reportDefinitions[kind].permission))
        throw fail('FORBIDDEN', 'A permissão mudou. O arquivo não foi entregue.', 403);
      await audit(tx, 'REPORT_EXPORTED', requestId, a.id, null, this.clock(), {
        scope: 'REPORT_' + kind,
        reason: [
          data.period.from + '..' + data.period.to,
          q.source,
          q.status,
          q.method,
          q.recordType,
          q.alert,
          q.expiryDays === undefined ? null : 'window:' + q.expiryDays,
          q.productId ? 'product:filtered' : null,
          q.customerId ? 'customer:single' : null,
        ]
          .filter(Boolean)
          .join('|'),
        count: data.total,
      });
    });
    return reportExportResult.parse({
      csv,
      filename: `le-pommier-${kind}-${data.period.from}-${data.period.to}.csv`,
      rows: data.total,
      generatedAt: data.generatedAt,
      businessDate: data.businessDate,
    });
  }
  dashboard(p: Principal, q: ReportQuery) {
    const now = this.clock();
    return this.snapshot(p, 'reports.dashboard', async (tx, a) => {
      if (q.productId || q.customerId || q.source || q.status || q.method)
        throw fail(
          'REPORT_FILTER',
          'O painel utiliza somente período e janela explícita de validade.',
        );
      const daily = await this.tableTx(tx, a.role, 'daily', { ...q, expiryDays: undefined }, now);
      const definitions = [
        ['expired', 'Lotes vencidos ainda fisicamente presentes', 'attention', 'inventory'],
        ['expiring', 'Validade até a janela escolhida', 'attention', 'inventory'],
        ['unknown', 'Validade não informada; confira os registros', 'attention', 'inventory'],
        ['pending', 'Pedidos aguardando retirada', 'attention', 'orders'],
        ['ready', 'Pedidos prontos aguardando retirada', 'attention', 'orders'],
        ['overdue', 'Retiradas agendadas em atraso', 'attention', 'orders'],
        ['unpaid', 'Próximas retiradas ainda não pagas', 'attention', 'orders'],
        ['invalidPaid', 'Pedidos pagos com alocação inelegível', 'attention', 'orders'],
        ['inventoryIntegrity', 'Falhas de integridade do estoque', 'integrity', 'inventory'],
      ] as const;
      const alerts = [];
      for (const [code, label, severity, report] of definitions) {
        if (code === 'expiring' && q.expiryDays === undefined) {
          alerts.push({ code, label, count: null, severity, report, examples: [] });
          continue;
        }
        const base = alertBase(code, now, q.expiryDays);
        const [v] = await tx.$queryRaw<Array<{ count: string; items: RawRow[] }>>(
          Prisma.sql`WITH r AS(${base}) SELECT (SELECT COUNT(*)::text FROM r) count,COALESCE((SELECT jsonb_agg(v) FROM (SELECT * FROM r ORDER BY id LIMIT 5) v),'[]'::jsonb) items`,
        );
        alerts.push({
          code,
          label,
          count: v!.count,
          severity,
          report,
          examples: v!.items.map((r) =>
            row(r, [
              { key: 'label', label: 'Referência', format: 'text' },
              { key: 'quantity', label: 'Unidades', format: 'integer' },
              { key: 'expiry', label: 'Validade', format: 'date' },
            ]),
          ),
        });
      }
      const active = await tx.cashSession.findFirst({
        where: { closedAt: null },
        select: { id: true, openedAt: true },
      });
      const closed = await tx.cashSession.findFirst({
        where: { closedAt: { not: null } },
        orderBy: [{ closedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          closedAt: true,
          closing: { select: { differenceCents: true } },
          reviews: { take: 1, orderBy: { version: 'desc' }, select: { decision: true } },
        },
      });
      const cash = new CashService(this.auth, this.clock);
      const currentSources = active ? await cash.sources(tx, active.id) : null;
      const closedSources = closed ? await cash.sources(tx, closed.id) : null;
      // Latest review is authoritative; older NEEDS_ATTENTION does not undo approval.
      const [needsReview] = await tx.$queryRaw<
        Array<{ count: string }>
      >`SELECT COUNT(*)::text count FROM "CashSession" s WHERE s."closedAt" IS NOT NULL AND NOT s."legacyClosed" AND COALESCE((SELECT r.decision::text FROM "CashReview" r WHERE r."sessionId"=s.id ORDER BY version DESC LIMIT 1),'PENDING_REVIEW')<>'APPROVED'`;
      alerts.push({
        code: 'cashReview',
        label: 'Sessões fechadas aguardando revisão ou atenção',
        count: needsReview!.count,
        severity: 'attention' as const,
        report: 'cash' as const,
        examples: [],
      });
      const cashIssues = [currentSources, closedSources].filter(
        (s) => s && !s.reconciliation.consistent,
      ).length;
      alerts.push({
        code: 'cashIntegrity',
        label: 'Falhas nas fontes do caixa atual/último fechado',
        count: String(cashIssues),
        severity: 'integrity' as const,
        report: 'cash' as const,
        examples: [],
      });
      return dashboardResult.parse({
        period: daily.period,
        generatedAt: daily.generatedAt,
        businessDate: daily.businessDate,
        metrics: daily.totals,
        alerts,
        cash:
          active && currentSources
            ? {
                id: active.id,
                openedAt: active.openedAt.toISOString(),
                expectedCents: currentSources.totals.expectedCents,
                consistent: currentSources.reconciliation.consistent,
              }
            : null,
        latestClosed: closed
          ? {
              id: closed.id,
              closedAt: closed.closedAt!.toISOString(),
              differenceCents: closed.closing ? String(closed.closing.differenceCents) : null,
              review: closed.reviews[0]?.decision ?? 'PENDING_REVIEW',
              consistent: closedSources!.reconciliation.consistent,
            }
          : null,
      });
    });
  }
}
