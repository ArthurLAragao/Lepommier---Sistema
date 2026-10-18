import { useState } from 'react';
import {
  reportKind,
  reportDefinitions,
  permittedReports,
  reportResult,
  reportExportResult,
  formatBusinessDate,
  formatDateTime,
  hasPermission,
  sourceLabels,
  orderLabels,
  methodLabels,
  type ReportKind,
  type CurrentUser,
  type ReportResult,
  type ReportProductOption,
} from '@pommier/shared';
import {
  Button,
  Filter,
  Field,
  Table,
  Pagination,
  EmptyState,
  ErrorState,
  Loading,
} from '../components/ui.js';
import { useRegistryData, downloadCsv, errorMessage } from '../registry/data.js';
import { authRequest } from '../auth/api.js';
import { Modal } from '../auth/AccountSettings.js';
import { ReportProductFilter } from './ProductFilter.js';
import { PeriodControls } from './common.js';
import { reportHref, reportValue } from './format.js';
import { ReportSource } from './Sources.js';
const alertLabels = {
  expired: 'Vencidos presentes',
  expiring: 'Próximos da validade escolhida',
  unknown: 'Validade desconhecida',
  pending: 'Todos os pedidos aguardando retirada',
  ready: 'Prontos para retirada',
  overdue: 'Retiradas atrasadas',
  unpaid: 'Próximas retiradas não pagas',
  invalidPaid: 'Pagos com alocação inelegível',
  inventoryIntegrity: 'Integridade do estoque',
  cashReview: 'Caixas para revisão',
  cashIntegrity: 'Integridade do caixa',
};
export default function Reports({
  current,
  today,
}: {
  current: CurrentUser;
  today: string | null;
}) {
  const allowed = permittedReports(current.user.role);
  if (!allowed.length)
    return (
      <EmptyState
        title="Acesso restrito"
        description="Seu perfil utiliza as operações autorizadas; não acessa relatórios financeiros."
      />
    );
  return today ? (
    <Workspace key={current.user.role} current={current} today={today} allowed={allowed} />
  ) : (
    <Loading label="Aguardando a data da loja." />
  );
}
function Workspace({
  current,
  today,
  allowed,
}: {
  current: CurrentUser;
  today: string;
  allowed: ReportKind[];
}) {
  const initial = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const wanted = reportKind.safeParse(initial.get('kind'));
  const [kind, setKind] = useState<ReportKind>(
    wanted.success && allowed.includes(wanted.data) ? wanted.data : allowed[0]!,
  );
  const [from, setFrom] = useState(initial.get('from') ?? today),
    [to, setTo] = useState(initial.get('to') ?? today),
    [page, setPage] = useState(1),
    [direction, setDirection] = useState('desc');
  const [source, setSource] = useState(''),
    [status, setStatus] = useState(''),
    [method, setMethod] = useState(initial.get('method') ?? ''),
    [alert, setAlert] = useState(initial.get('alert') ?? 'expired'),
    [expiryDays, setExpiryDays] = useState(initial.get('expiryDays') ?? ''),
    [product, setProduct] = useState<ReportProductOption | null>(null);
  const customerId = initial.get('customerId') ?? '';
  const [recordType, setRecordType] = useState(initial.get('recordType') ?? '');
  const supportsProduct = [
    'sales',
    'products',
    'orders',
    'production',
    'receipts',
    'waste',
    'inventory',
    'customers',
  ].includes(kind);
  const filters: Record<string, string> = { from, to, direction };
  if (supportsProduct && product) filters.productId = product.id;
  if (['sales', 'products', 'orders', 'customers'].includes(kind) && source)
    filters.source = source;
  if (['orders', 'customers'].includes(kind) && status) filters.status = status;
  if (['payments', 'transactions'].includes(kind) && method) filters.method = method;
  if (kind === 'customers' && customerId) filters.customerId = customerId;
  if (kind === 'alerts') {
    filters.alert = alert;
    if (alert === 'expiring' && expiryDays) filters.expiryDays = expiryDays;
  }
  if (kind === 'transactions' && recordType) filters.recordType = recordType;
  const needsCustomer = kind === 'customers' && !customerId;
  return (
    <section className="registry-page report-page">
      <div className="registry-toolbar">
        <div>
          <h2>Relatórios operacionais</h2>
          <p>
            Fontes registradas, bases de data explícitas e totais conferíveis. Não é contabilidade
            ou lucro.
          </p>
        </div>
      </div>
      <Filter
        label="Relatório"
        value={kind}
        onChange={(e) => {
          setKind(e.target.value as ReportKind);
          setPage(1);
          setSource('');
          setStatus('');
          setMethod('');
          setProduct(null);
        }}
      >
        {allowed.map((k) => (
          <option key={k} value={k}>
            {reportDefinitions[k].label}
          </option>
        ))}
      </Filter>
      <PeriodControls
        today={today}
        from={from}
        to={to}
        onChange={(a, b) => {
          setFrom(a);
          setTo(b);
          setPage(1);
        }}
      />
      <div className="report-filters">
        {kind === 'transactions' && (
          <Filter
            label="Tipo de registro financeiro"
            value={recordType}
            onChange={(e) => {
              setRecordType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Pagamentos e reembolsos</option>
            <option value="PAYMENT">Somente pagamentos</option>
            <option value="REFUND">Somente reembolsos</option>
          </Filter>
        )}
        {['sales', 'products', 'orders', 'customers'].includes(kind) && (
          <Filter
            label="Origem do pedido"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {Object.entries(sourceLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Filter>
        )}
        {['orders', 'customers'].includes(kind) && (
          <Filter
            label="Situação atual do pedido"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {Object.entries(orderLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Filter>
        )}
        {['payments', 'transactions'].includes(kind) && (
          <Filter
            label="Meio de pagamento"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {Object.entries(methodLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Filter>
        )}
        {kind === 'alerts' && (
          <>
            <Filter
              label="Alerta atual"
              value={alert}
              onChange={(e) => {
                setAlert(e.target.value);
                setPage(1);
              }}
            >
              {Object.entries(alertLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Filter>
            {alert === 'expiring' && (
              <Field
                label="Janela de validade escolhida (dias)"
                type="number"
                min="0"
                max="30"
                value={expiryDays}
                onChange={(e) => {
                  setExpiryDays(e.target.value);
                  setPage(1);
                }}
              />
            )}
          </>
        )}
        <Filter
          label="Ordenação estável"
          value={direction}
          onChange={(e) => {
            setDirection(e.target.value);
            setPage(1);
          }}
        >
          <option value="desc">Decrescente</option>
          <option value="asc">Crescente</option>
        </Filter>
      </div>
      {supportsProduct && (
        <details>
          <summary>Filtrar produto, incluindo histórico inativo</summary>
          <ReportProductFilter
            value={product}
            onChange={(p) => {
              setProduct(p);
              setPage(1);
            }}
          />
        </details>
      )}
      {needsCustomer ? (
        <EmptyState
          title="Selecione um único cadastro"
          description="Abra Clientes, o perfil e o vínculo de relatório. Nenhum diretório de clientes é exportado por aqui."
          action={
            <a className="button button-secondary" href="#customers">
              Abrir clientes
            </a>
          }
        />
      ) : (
        <ReportContent
          key={kind + '-' + new URLSearchParams(filters)}
          kind={kind}
          filters={filters}
          page={page}
          onPage={setPage}
          current={current}
        />
      )}
    </section>
  );
}
const totalLabels: Record<string, string> = {
  rows: 'Linhas do filtro completo',
  counter: 'Pedidos de balcão',
  whatsapp: 'Pedidos WhatsApp',
  unpaid: 'Não pagos da entrada selecionada',
  paid: 'Pagos da entrada selecionada',
  refundedCount: 'Reembolsados da entrada selecionada',
  ready: 'Prontos da entrada selecionada',
  cancelled: 'Cancelados da entrada selecionada',
  fulfilled: 'Entregas',
  intake: 'Pedidos criados',
  confirmed: 'Pedidos confirmados nesta data',
};
function ReportContent({
  kind,
  filters,
  page,
  onPage,
  current,
}: {
  kind: ReportKind;
  filters: Record<string, string>;
  page: number;
  onPage: (p: number) => void;
  current: CurrentUser;
}) {
  const result = useRegistryData(
    `/reports/${kind}?${new URLSearchParams({ ...filters, page: String(page) })}`,
    reportResult,
  );
  const [selected, setSelected] = useState<ReportResult['items'][number] | null>(null),
    [exporting, setExporting] = useState(false);
  const data = result.data;
  const [exportMessage, setExportMessage] = useState('');
  return (
    <section className="report-result" aria-label={reportDefinitions[kind].label}>
      {result.busy && <Loading label="Consultando fontes do relatório." />}
      {exportMessage && <p role="status">{exportMessage}</p>}
      {result.error && (
        <ErrorState
          title="Relatório indisponível"
          message={result.error}
          action={
            <Button variant="secondary" onClick={result.refresh}>
              Tentar novamente
            </Button>
          }
        />
      )}
      {data && (
        <>
          <div className="registry-toolbar">
            <div>
              <h3>{data.label}</h3>
              <p>
                {formatBusinessDate(data.period.from)} a {formatBusinessDate(data.period.to)} ·
                America/Fortaleza
              </p>
              <p>
                Gerado em {formatDateTime(data.generatedAt)}. Retrato consistente das fontes;
                atualizar consulta novamente.
              </p>
            </div>
            <div className="registry-actions">
              <Button variant="secondary" onClick={result.refresh}>
                Atualizar relatório
              </Button>
              {hasPermission(current.user.role, 'reports.export') && (
                <Button onClick={() => setExporting(true)}>Exportar CSV</Button>
              )}
            </div>
          </div>
          <p className="report-basis">{data.basis}</p>
          <dl className="report-totals">
            {Object.entries(data.totals).map(([key, value]) => {
              const col = data.columns.find((c) => c.key === key);
              return (
                <div key={key}>
                  <dt>{col?.label ?? totalLabels[key] ?? key}</dt>
                  <dd>{reportValue(value, col?.format ?? 'integer')}</dd>
                </div>
              );
            })}
          </dl>
          <p>
            {data.total} linhas no filtro completo · {data.items.length} nesta página · Exportação
            integral limitada a 1.000 linhas, sem truncamento.
          </p>
          {data.items.length ? (
            <Table
              caption={data.label}
              rows={data.items}
              rowKey={(r) => r.id}
              columns={[
                ...data.columns.map((c) => ({
                  key: c.key,
                  label: c.label,
                  render: (r: ReportResult['items'][number]) =>
                    reportValue(
                      r.cells[c.key],
                      c.format,
                      c.key === 'available' ? 'Indisponível' : 'Não informado',
                    ),
                })),
                {
                  key: 'sourceRecord',
                  label: 'Fontes',
                  render: (r) =>
                    r.drill ? (
                      r.drill.kind === 'cash' ? (
                        <a href={'#cash?sessionId=' + r.drill.id}>Ver sessão</a>
                      ) : (
                        <Button variant="ghost" onClick={() => setSelected(r)}>
                          Ver{' '}
                          {r.drill.kind === 'order'
                            ? 'pedido'
                            : r.drill.kind === 'product'
                              ? 'lotes'
                              : 'lote'}
                        </Button>
                      )
                    ) : kind === 'payments' ? (
                      <a
                        href={reportHref('transactions', {
                          from: r.cells.day!,
                          to: r.cells.day!,
                          method:
                            Object.entries(methodLabels).find(
                              ([, label]) => label === r.cells.method,
                            )?.[0] ??
                            filters.method ??
                            '',
                        })}
                      >
                        Ver registros do dia
                      </a>
                    ) : kind === 'daily' ? (
                      <a href={reportHref('sales', { from: r.cells.day!, to: r.cells.day! })}>
                        Ver entregas do dia
                      </a>
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
          ) : (
            <EmptyState
              title="Nenhum registro no filtro"
              description="Não há registros que correspondam a esta consulta. Não foram criadas operações de exemplo."
            />
          )}
          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(data.total / 20))}
            onChange={onPage}
          />
          {exporting && (
            <ExportDialog
              kind={kind}
              filters={filters}
              count={data.total}
              onClose={() => setExporting(false)}
              onDone={(message) => {
                setExporting(false);
                setExportMessage(message);
              }}
            />
          )}
        </>
      )}
      {selected && (
        <ReportSource row={selected} current={current} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
function ExportDialog({
  kind,
  filters,
  count,
  onClose,
  onDone,
}: {
  kind: ReportKind;
  filters: Record<string, string>;
  count: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function execute() {
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      const file = await authRequest(`/reports/${kind}/export`, reportExportResult, {
        method: 'POST',
        body: filters,
      });
      downloadCsv(file.csv, file.filename);
      onDone(
        `Arquivo gerado em ${formatDateTime(file.generatedAt)} com ${file.rows} linhas. Valores monetários exportados em centavos.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Exportar relatório"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="auth-form">
        <p>
          {reportDefinitions[kind].label}: {filters.from} a {filters.to}, com os filtros
          selecionados. A tela contém {count} linhas. O arquivo usa um novo snapshot e informa seu
          instante de geração; novas operações podem mudar a quantidade.
        </p>
        <p>
          Até 1.000 linhas, UTF-8, dinheiro em centavos e instantes ISO com fuso, sem diretório de
          clientes, CPF, contato, notas, senhas ou chaves. Acima do limite, reduza os filtros; nada
          será truncado.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Confirmo o escopo completo e o uso autorizado deste arquivo.
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="registry-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!confirmed} busy={busy} onClick={() => void execute()}>
            Confirmar e baixar CSV
          </Button>
        </div>
      </div>
    </Modal>
  );
}
