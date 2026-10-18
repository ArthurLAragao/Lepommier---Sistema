import { useState } from 'react';
import {
  dashboardResult,
  formatOrderMoney,
  formatBusinessDate,
  formatDateTime,
  hasPermission,
  type CurrentUser,
  type ReportKind,
} from '@pommier/shared';
import { useRegistryData } from '../registry/data.js';
import { Button, Card, Filter, Loading, ErrorState } from '../components/ui.js';
import { PeriodControls } from './common.js';
import { reportHref } from './format.js';
import { ReportSource } from './Sources.js';
import type { ReportResult } from '@pommier/shared';
export default function Dashboard({
  current,
  today,
}: {
  current: CurrentUser;
  today: string | null;
}) {
  if (!hasPermission(current.user.role, 'reports.dashboard'))
    return <StaffStart current={current} />;
  return today ? (
    <OwnerDashboard today={today} current={current} />
  ) : (
    <Loading label="Aguardando a data da loja." />
  );
}
function StaffStart({ current }: { current: CurrentUser }) {
  return (
    <section className="registry-page">
      <h2>Seu espaço de trabalho</h2>
      <p>
        Olá, {current.user.displayName}. Abra as operações disponíveis para seu perfil. O painel
        financeiro é reservado ao proprietário.
      </p>
      <div className="report-shortcuts">
        {hasPermission(current.user.role, 'orders.read') && (
          <>
            <a className="button button-primary" href="#sales">
              Abrir vendas
            </a>
            <a className="button button-secondary" href="#orders">
              Abrir pedidos
            </a>
          </>
        )}
        {hasPermission(current.user.role, 'production.manage') && (
          <a className="button button-primary" href="#production">
            Abrir produção
          </a>
        )}
        <a className="button button-secondary" href="#inventory">
          Consultar estoque permitido
        </a>
        {hasPermission(current.user.role, 'reports.stock') && (
          <a className="button button-secondary" href={reportHref('production')}>
            Relatórios de produção e estoque
          </a>
        )}
      </div>
    </section>
  );
}
function OwnerDashboard({ current, today }: { current: CurrentUser; today: string }) {
  const [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [expiryDays, setExpiryDays] = useState(''),
    [selected, setSelected] = useState<ReportResult['items'][number] | null>(null);
  const filters = { from, to };
  const query = new URLSearchParams({ ...filters, ...(expiryDays ? { expiryDays } : {}) });
  const result = useRegistryData('/reports/dashboard?' + query, dashboardResult),
    data = result.data;
  const isToday = from === (data?.businessDate ?? today) && to === (data?.businessDate ?? today);
  const cards: ['net' | 'received' | 'refunded' | 'receiptsNet', string, ReportKind][] = [
    ['net', isToday ? 'Vendas entregues hoje' : 'Vendas entregues no período', 'sales'],
    [
      'received',
      isToday ? 'Pagamentos recebidos hoje' : 'Pagamentos recebidos no período',
      'payments',
    ],
    [
      'refunded',
      isToday ? 'Reembolsos registrados hoje' : 'Reembolsos registrados no período',
      'transactions',
    ],
    [
      'receiptsNet',
      isToday ? 'Recebimentos líquidos hoje' : 'Recebimentos líquidos no período',
      'payments',
    ],
  ];
  return (
    <section className="registry-page owner-dashboard">
      <div className="registry-toolbar">
        <div>
          <h2>O dia da loja</h2>
          <p>
            Entregas, recebimentos e pendências a partir dos registros reais. Sem metas inventadas
            ou promessa de lucro.
          </p>
        </div>
        <Button variant="secondary" onClick={result.refresh}>
          Atualizar painel
        </Button>
      </div>
      <PeriodControls
        today={today}
        from={from}
        to={to}
        onChange={(a, b) => {
          setFrom(a);
          setTo(b);
        }}
      />
      {result.busy && <Loading label="Conferindo as fontes do painel." />}
      {result.error && (
        <ErrorState
          title="Painel indisponível"
          message={result.error}
          action={<Button onClick={result.refresh}>Tentar novamente</Button>}
        />
      )}
      {data && (
        <>
          <p className="report-freshness">
            {formatBusinessDate(data.period.from)} a {formatBusinessDate(data.period.to)} ·
            America/Fortaleza · Gerado em {formatDateTime(data.generatedAt)}. Atualize para novas
            operações.
          </p>
          <div className="dashboard-metrics">
            {cards.map(([key, label, report]) => (
              <Card className="dashboard-metric" key={key}>
                <h3>
                  <a
                    href={reportHref(report, {
                      ...filters,
                      ...(key === 'refunded' ? { recordType: 'REFUND' } : {}),
                    })}
                  >
                    {label}
                  </a>
                </h3>
                <strong>{formatOrderMoney(data.metrics[key])}</strong>
                <p>
                  {key === 'net'
                    ? 'Antes de reembolsos, pela data da entrega.'
                    : key === 'received'
                      ? 'Pela data do pagamento; inclui retiradas futuras.'
                      : key === 'refunded'
                        ? 'Pela data do reembolso; pode ser venda anterior.'
                        : 'Pagamentos menos reembolsos registrados; não é lucro.'}
                </p>
              </Card>
            ))}
          </div>
          <div className="dashboard-secondary">
            <Card>
              <h3>
                <a href={reportHref('production', filters)}>Produção concluída no período</a>
              </h3>
              <strong>{data.metrics.produced} unidades recebidas</strong>
              <p>Planos não concluídos não entram.</p>
            </Card>
            <Card>
              <h3>
                <a href={reportHref('waste', filters)}>Descarte no período</a>
              </h3>
              <strong>{data.metrics.wasted} unidades prontas</strong>
              <p>Falta de rendimento de produção é separada.</p>
            </Card>
            <Card>
              <h3>Sessão de caixa atual</h3>
              {data.cash ? (
                <>
                  <a href={'#cash?sessionId=' + data.cash.id}>
                    Aberta desde {formatDateTime(data.cash.openedAt)}
                  </a>
                  <p>Dinheiro físico esperado: {formatOrderMoney(data.cash.expectedCents)}</p>
                  {!data.cash.consistent && (
                    <p className="form-error">
                      Falha de integridade nas fontes; não é diferença de contagem.
                    </p>
                  )}
                </>
              ) : (
                <p>Nenhuma sessão aberta. A abertura é explícita no módulo Caixa.</p>
              )}
            </Card>
            <Card>
              <h3>Último caixa fechado</h3>
              {data.latestClosed ? (
                <>
                  <a href={'#cash?sessionId=' + data.latestClosed.id}>
                    Fechado em {formatDateTime(data.latestClosed.closedAt)}
                  </a>
                  <p>
                    Diferença:{' '}
                    {data.latestClosed.differenceCents === null
                      ? 'Contagem legada indisponível'
                      : formatOrderMoney(data.latestClosed.differenceCents)}
                  </p>
                  <p>
                    Revisão:{' '}
                    {
                      (
                        {
                          PENDING_REVIEW: 'Pendente',
                          APPROVED: 'Aprovada',
                          NEEDS_ATTENTION: 'Requer atenção',
                        } as Record<string, string>
                      )[data.latestClosed.review]
                    }
                  </p>
                  {!data.latestClosed.consistent && (
                    <p className="form-error">
                      Fontes ou contagem histórica sem conciliação verificável.
                    </p>
                  )}
                </>
              ) : (
                <p>Nenhuma sessão fechada registrada.</p>
              )}
            </Card>
          </div>
          <div className="registry-toolbar">
            <div>
              <h3>Atenção operacional e integridade atuais</h3>
              <p>
                Alertas usam o estado atual, independentemente do período escolhido acima. Nenhum
                limite de estoque baixo foi inventado.
              </p>
            </div>
            <Filter
              label="Janela explícita de validade"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
            >
              <option value="">Escolha uma janela</option>
              <option value="0">Vencem hoje</option>
              <option value="1">Até amanhã</option>
              <option value="3">Até 3 dias</option>
              <option value="7">Até 7 dias</option>
              <option value="30">Até 30 dias</option>
            </Filter>
          </div>
          <div className="dashboard-alerts">
            {data.alerts.map((alert) => (
              <Card
                key={alert.code}
                className={alert.severity === 'integrity' ? 'integrity-alert' : 'attention-alert'}
              >
                <h4>{alert.label}</h4>
                <p>
                  {alert.severity === 'integrity' ? 'Integridade dos dados' : 'Atenção operacional'}
                </p>
                {alert.count === null ? (
                  <p>Escolha a janela de observação. Não há regra de proximidade presumida.</p>
                ) : (
                  <>
                    <strong>{BigInt(alert.count).toLocaleString('pt-BR')} ocorrências</strong>
                    <p>
                      <a
                        href={reportHref('alerts', {
                          ...filters,
                          alert: alert.code,
                          ...(alert.code === 'expiring' ? { expiryDays } : {}),
                        })}
                      >
                        Consultar todas as fontes
                      </a>
                    </p>
                    {alert.examples.map((r) => (
                      <div key={r.id}>
                        {r.drill?.kind === 'cash' ? (
                          <a href={'#cash?sessionId=' + r.drill.id}>{r.cells.label}</a>
                        ) : (
                          <Button variant="ghost" onClick={() => setSelected(r)}>
                            {r.cells.label}
                          </Button>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </Card>
            ))}
          </div>
          <p>
            Validade é a data inserida no lote; o sistema não garante segurança alimentar.
            Confirmações de Pix/cartão são manuais. Conferência operacional não é conciliação
            bancária.
          </p>
        </>
      )}
      {selected && (
        <ReportSource row={selected} current={current} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
