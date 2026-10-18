import { useState } from 'react';
import {
  cashCurrentDto,
  cashHistoryDto,
  cashDetailDto,
  cashMovementLabels,
  expenseLabels,
  methodLabels,
  formatOrderMoney,
  formatDateTime,
  hasPermission,
  type CurrentUser,
  type cashMovementDto,
} from '@pommier/shared';
import type { z } from 'zod';
import {
  Button,
  Field,
  Filter,
  Search,
  Table,
  Pagination,
  EmptyState,
  Badge,
} from '../components/ui.js';
import { DataStatus } from '../registry/ui.js';
import { useRegistryData } from '../registry/data.js';
import { CashOpening } from '../sales/common.js';
import { OrderPanel } from '../sales/Orders.js';
import { CashActionForm, CashReversalForm, type CashAction } from './CashForms.js';
const reviewLabels = {
  PENDING_REVIEW: 'Pendente de revisão',
  APPROVED: 'Aprovado',
  NEEDS_ATTENTION: 'Requer atenção',
} as const;
const integrityLabels: Record<string, string> = {
  ACTIVITY_VERSION_DRIFT: 'A atividade não confere com os movimentos.',
  NEGATIVE_EXPECTED_LEGACY: 'O saldo esperado anterior é negativo e exige análise.',
  LEGACY_CLOSING_UNAVAILABLE: 'O fechamento anterior não tem contagem verificável.',
  CLOSING_DRIFT: 'O fechamento não confere com as fontes financeiras.',
  REVIEW_VERSION_DRIFT: 'O histórico de revisão não confere.',
  FINANCIAL_SOURCE_MISMATCH: 'Há registro financeiro incompatível com sua origem.',
};
export default function Cash({ current }: { current: CurrentUser }) {
  const result = useRegistryData('/cash/current', cashCurrentDto);
  const [opening, setOpening] = useState(false);
  const initialId =
    new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('sessionId') ?? '';
  const [tab, setTab] = useState<'current' | 'history'>(initialId ? 'history' : 'current');
  const [selected, setSelected] = useState(initialId);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const manage = hasPermission(current.user.role, 'cash.read');
  const changed = (id?: string) => {
    result.refresh();
    setRevision((v) => v + 1);
    setMessage('Operação de caixa confirmada.');
    if (id) {
      setSelected(id);
      setTab('history');
    }
  };
  return (
    <section className="registry-page cash-page">
      <div className="registry-toolbar">
        <div>
          <h2>Caixa da loja</h2>
          <p>
            Dinheiro físico, recebimentos por meio e fechamento contado. Controle operacional; não é
            contabilidade nem conciliação bancária.
          </p>
        </div>
        {result.data && !result.data.session && hasPermission(current.user.role, 'cash.open') && (
          <Button onClick={() => setOpening(true)}>Abrir caixa</Button>
        )}
      </div>
      <DataStatus {...result} retry={result.refresh} />
      {message && <p role="status">{message}</p>}
      {manage && (
        <div className="registry-tabs" role="group" aria-label="Visões do caixa">
          <Button
            variant={tab === 'current' ? 'primary' : 'secondary'}
            aria-pressed={tab === 'current'}
            onClick={() => setTab('current')}
          >
            Sessão atual
          </Button>
          <Button
            variant={tab === 'history' ? 'primary' : 'secondary'}
            aria-pressed={tab === 'history'}
            onClick={() => setTab('history')}
          >
            Histórico de caixas
          </Button>
        </div>
      )}
      {result.data &&
        tab === 'current' &&
        (result.data.session ? (
          manage ? (
            <CashDetail
              key={`${result.data.session.id}-${revision}`}
              id={result.data.session.id}
              currentId={result.data.session.id}
              current={current}
              onChanged={changed}
            />
          ) : (
            <section className="info-note">
              <h3>Sessão de caixa aberta</h3>
              <p>
                Aberta em {formatDateTime(result.data.session.openedAt)} por{' '}
                {result.data.session.openedBy.displayName}.
              </p>
              <p>
                Seu perfil pode registrar pagamentos em Vendas/Pedidos. Fundo inicial, totais da
                loja, movimentos, histórico e fechamento são restritos aos responsáveis.
              </p>
            </section>
          )
        ) : (
          <EmptyState
            title="Nenhuma sessão de caixa aberta"
            description="O proprietário ou gerente deve conferir o fundo inicial e abrir explicitamente o caixa. Pedidos não pagos poderão ser recebidos depois da abertura."
          />
        ))}
      {manage &&
        tab === 'history' &&
        (selected ? (
          <>
            <Button onClick={() => setSelected('')}>Voltar ao histórico de caixas</Button>
            <CashDetail
              key={`${selected}-${revision}`}
              id={selected}
              currentId={result.data?.session?.id ?? null}
              current={current}
              onChanged={changed}
            />
          </>
        ) : (
          <CashHistory onSelect={setSelected} revision={revision} />
        ))}
      {opening && (
        <CashOpening
          onClose={() => setOpening(false)}
          onDone={() => {
            setOpening(false);
            changed();
            setTab('current');
          }}
        />
      )}
    </section>
  );
}
function CashHistory({ onSelect, revision }: { onSelect: (id: string) => void; revision: number }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ q, state, page: String(page) });
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const result = useRegistryData(`/cash/sessions?${query}`, cashHistoryDto);
  void revision;
  return (
    <section className="registry-table">
      <div className="registry-filters">
        <Search
          label="Buscar caixa pelo ID completo"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Filter
          label="Situação da sessão de caixa"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Todas</option>
          <option value="open">Aberta</option>
          <option value="closed">Fechada</option>
        </Filter>
        <Field
          type="date"
          label="Abertura desde (Fortaleza)"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <Field
          type="date"
          label="Abertura até (Fortaleza)"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <DataStatus {...result} retry={result.refresh} />
      {result.data &&
        (result.data.items.length ? (
          <>
            <Table
              caption="Histórico de sessões de caixa"
              rows={result.data.items}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: 'id',
                  label: 'Sessão',
                  render: (r) => (
                    <Button variant="ghost" onClick={() => onSelect(r.id)}>
                      Abrir caixa {r.id}
                    </Button>
                  ),
                },
                {
                  key: 'opened',
                  label: 'Abertura',
                  render: (r) => (
                    <>
                      {formatDateTime(r.openedAt)}
                      <br />
                      {r.openedBy.displayName}
                    </>
                  ),
                },
                {
                  key: 'closed',
                  label: 'Fechamento',
                  render: (r) =>
                    r.closedAt ? (
                      <>
                        {formatDateTime(r.closedAt)}
                        <br />
                        {r.closing?.actor.displayName ?? 'Registro anterior sem contagem'}
                      </>
                    ) : (
                      'Aberta'
                    ),
                },
                {
                  key: 'count',
                  label: 'Esperado / contado',
                  render: (r) =>
                    r.closing ? (
                      <>
                        {formatOrderMoney(r.closing.expectedCents)} /{' '}
                        {formatOrderMoney(r.closing.countedCents)}
                      </>
                    ) : (
                      'Não fechado com contagem'
                    ),
                },
                {
                  key: 'diff',
                  label: 'Diferença física',
                  render: (r) =>
                    r.closing ? formatOrderMoney(r.closing.differenceCents) : 'Não apurada',
                },
                {
                  key: 'review',
                  label: 'Revisão',
                  render: (r) => (r.closedAt ? reviewLabels[r.reviewStatus] : 'Após fechamento'),
                },
              ]}
            />
            <Pagination
              page={page}
              pageCount={Math.max(1, Math.ceil(result.data.total / 20))}
              onChange={setPage}
            />
          </>
        ) : (
          <EmptyState
            title="Nenhuma sessão encontrada"
            description="Revise o ID completo ou o período da abertura. Sessões podem atravessar a meia-noite e não são divididas automaticamente."
          />
        ))}
    </section>
  );
}
function CashDetail({
  id,
  currentId,
  current,
  onChanged,
}: {
  id: string;
  currentId: string | null;
  current: CurrentUser;
  onChanged: (id?: string) => void;
}) {
  const [movementsPage, setMovementsPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [refundsPage, setRefundsPage] = useState(1);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [action, setAction] = useState<CashAction | null>(null);
  const [reverse, setReverse] = useState<z.infer<typeof cashMovementDto> | null>(null);
  const [order, setOrder] = useState('');
  const query = new URLSearchParams({
    movementsPage: String(movementsPage),
    paymentsPage: String(paymentsPage),
    refundsPage: String(refundsPage),
    reviewsPage: String(reviewsPage),
  });
  const result = useRegistryData(`/cash/sessions/${id}?${query}`, cashDetailDto);
  const d = result.data;
  return (
    <section className="cash-detail">
      <DataStatus {...result} retry={result.refresh} />
      {d && (
        <>
          <div className="registry-toolbar">
            <div>
              <h3>Conferência da sessão de caixa</h3>
              <p className="cash-id">{d.session.id}</p>
              <p>
                Aberta em {formatDateTime(d.session.openedAt)} por {d.session.openedBy.displayName}.{' '}
                {d.session.closedAt
                  ? `Fechada em ${formatDateTime(d.session.closedAt)} por ${d.session.closing?.actor.displayName ?? 'responsável do registro anterior'}.`
                  : 'Continua aberta, inclusive se atravessar a meia-noite.'}
              </p>
              <Badge>{d.session.closedAt ? 'Fechada' : 'Aberta'}</Badge>
              {d.session.closedAt && <Badge>{reviewLabels[d.session.reviewStatus]}</Badge>}
            </div>
            <Button onClick={result.refresh}>Atualizar e revisar caixa</Button>
          </div>
          <section aria-label="Conciliação das fontes do caixa" className="info-note">
            <h4>Integridade dos dados</h4>
            {d.reconciliation.consistent ? (
              <p>
                Fontes financeiras conciliadas. Isso não confirma banco, maquininha ou contagem
                física.
              </p>
            ) : (
              <div role="alert">
                <strong>Falha na conciliação dos dados</strong>
                <p>
                  {d.reconciliation.findings
                    .map((f) => integrityLabels[f] ?? 'Fontes não conciliadas.')
                    .join(' ')}{' '}
                  Interrompa as alterações e solicite revisão técnica. Nenhum saldo foi reparado
                  automaticamente.
                </p>
              </div>
            )}
          </section>
          <dl className="cash-totals" aria-label="Valores físicos do caixa">
            {[
              ['Fundo inicial', d.totals.openingFloatCents],
              ['Pagamentos em dinheiro', d.totals.methods.CASH.grossCents],
              ['Devoluções em dinheiro', d.totals.methods.CASH.refundCents],
              ['Suprimentos', d.totals.additionsCents],
              ['Sangrias', d.totals.withdrawalsCents],
              ['Despesas', d.totals.expensesCents],
              ['Estornos de movimentação', d.totals.correctionsCents],
              ['Dinheiro físico esperado', d.totals.expectedCents],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{formatOrderMoney(value!)}</dd>
              </div>
            ))}
          </dl>
          {d.session.closing && (
            <section className="cash-closing-summary" aria-label="Contagem e diferença operacional">
              <h4>Fechamento preservado</h4>
              <dl className="cash-count-summary">
                <div>
                  <dt>Dinheiro contado</dt>
                  <dd>{formatOrderMoney(d.session.closing.countedCents)}</dd>
                </div>
                <div>
                  <dt>Diferença física: contado menos esperado</dt>
                  <dd>{formatOrderMoney(d.session.closing.differenceCents)}</dd>
                </div>
              </dl>
              <p>Justificativa: {d.session.closing.explanation ?? 'Contagem sem diferença.'}</p>
              <p>
                A diferença operacional é separada da integridade dos dados acima e não representa
                lucro/prejuízo.
              </p>
            </section>
          )}
          <Table
            caption="Recebimentos e devoluções por meio de pagamento"
            rows={Object.entries(d.totals.methods).map(([method, v]) => ({
              method: method as keyof typeof methodLabels,
              ...v,
            }))}
            rowKey={(r) => r.method}
            columns={[
              { key: 'method', label: 'Meio', render: (r) => methodLabels[r.method] },
              {
                key: 'gross',
                label: 'Recebimentos brutos',
                render: (r) => formatOrderMoney(r.grossCents),
              },
              {
                key: 'refund',
                label: 'Devoluções',
                render: (r) => formatOrderMoney(r.refundCents),
              },
              {
                key: 'net',
                label: 'Recebimentos líquidos',
                render: (r) => formatOrderMoney(r.netCents),
              },
            ]}
          />
          <p>
            Pix, débito e crédito não aumentam a gaveta. Devoluções de vendas antigas pertencem à
            sessão atual em que foram registradas. Fundo inicial não é receita.
          </p>
          <div className="cash-actions">
            {!d.session.closedAt &&
              hasPermission(current.user.role, 'cash.movements') &&
              (['CASH_ADDITION', 'CASH_WITHDRAWAL', 'CASH_EXPENSE'] as const).map((kind) => (
                <Button
                  key={kind}
                  disabled={!d.reconciliation.consistent}
                  onClick={() => setAction(kind)}
                >
                  Registrar{' '}
                  {kind === 'CASH_ADDITION'
                    ? 'suprimento'
                    : kind === 'CASH_WITHDRAWAL'
                      ? 'sangria'
                      : 'despesa'}
                </Button>
              ))}
            {!d.session.closedAt && hasPermission(current.user.role, 'cash.close') && (
              <Button disabled={!d.reconciliation.consistent} onClick={() => setAction('close')}>
                Fechar caixa
              </Button>
            )}
            {d.session.closing && hasPermission(current.user.role, 'cash.review') && (
              <Button disabled={!d.reconciliation.consistent} onClick={() => setAction('review')}>
                Revisar fechamento
              </Button>
            )}
          </div>
          <section className="registry-table">
            <h4>Movimentações de dinheiro</h4>
            {d.movements.items.length ? (
              <Table
                caption="Movimentações da sessão de caixa"
                rows={d.movements.items}
                rowKey={(r) => r.id}
                columns={[
                  {
                    key: 'kind',
                    label: 'Tipo / valor',
                    render: (r) => (
                      <>
                        {cashMovementLabels[r.kind]}
                        <br />
                        {formatOrderMoney(r.direction === -1 ? `-${r.amountCents}` : r.amountCents)}
                      </>
                    ),
                  },
                  {
                    key: 'reason',
                    label: 'Motivo / referência',
                    render: (r) => (
                      <>
                        {r.reason}
                        <br />
                        {r.category ? expenseLabels[r.category] : ''} {r.reference ?? ''}
                        {r.reversesId && (
                          <p>
                            Original {r.reversesId}, sessão {r.originalSessionId}.
                          </p>
                        )}
                      </>
                    ),
                  },
                  {
                    key: 'actor',
                    label: 'Responsável / instante',
                    render: (r) => (
                      <>
                        {r.actor.displayName}
                        <br />
                        {formatDateTime(r.recordedAt)}
                      </>
                    ),
                  },
                  {
                    key: 'action',
                    label: 'Correção',
                    render: (r) =>
                      r.reversalId ? (
                        'Estorno vinculado registrado'
                      ) : r.kind === 'CASH_REVERSAL' ? (
                        'Compensação preservada'
                      ) : hasPermission(current.user.role, 'cash.correct') && currentId ? (
                        <Button onClick={() => setReverse(r)}>Estornar movimentação</Button>
                      ) : (
                        'Sem ação autorizada'
                      ),
                  },
                ]}
              />
            ) : (
              <p>Nenhuma movimentação avulsa nesta sessão.</p>
            )}
            <Pagination
              page={movementsPage}
              pageCount={Math.max(1, Math.ceil(d.movements.total / 20))}
              onChange={setMovementsPage}
            />
          </section>
          {(['payments', 'refunds'] as const).map((kind) => (
            <section className="registry-table" key={kind}>
              <h4>{kind === 'payments' ? 'Pagamentos vinculados' : 'Devoluções vinculadas'}</h4>
              {d[kind].items.length ? (
                <Table
                  caption={
                    kind === 'payments' ? 'Pagamentos desta sessão' : 'Devoluções desta sessão'
                  }
                  rows={d[kind].items}
                  rowKey={(r) => r.id}
                  columns={[
                    {
                      key: 'order',
                      label: 'Pedido',
                      render: (r) => (
                        <Button variant="ghost" onClick={() => setOrder(r.orderId)}>
                          PED-{String(r.orderNumber).padStart(6, '0')}
                        </Button>
                      ),
                    },
                    {
                      key: 'method',
                      label: 'Meio / valor',
                      render: (r) => (
                        <>
                          {methodLabels[r.method]} — {formatOrderMoney(r.amountCents)}
                        </>
                      ),
                    },
                    {
                      key: 'who',
                      label: 'Responsável / instante',
                      render: (r) => (
                        <>
                          {r.actor.displayName}
                          <br />
                          {formatDateTime(r.recordedAt)}
                        </>
                      ),
                    },
                  ]}
                />
              ) : (
                <p>Nenhum registro vinculado.</p>
              )}
              <Pagination
                page={kind === 'payments' ? paymentsPage : refundsPage}
                pageCount={Math.max(1, Math.ceil(d[kind].total / 20))}
                onChange={kind === 'payments' ? setPaymentsPage : setRefundsPage}
              />
            </section>
          ))}
          <section className="registry-table">
            <h4>Histórico de revisão</h4>
            {d.reviews.items.length ? (
              <Table
                caption="Revisões do fechamento"
                rows={d.reviews.items}
                rowKey={(r) => r.id}
                columns={[
                  {
                    key: 'decision',
                    label: 'Decisão / nota',
                    render: (r) => (
                      <>
                        {reviewLabels[r.decision]}
                        <p>{r.note}</p>
                      </>
                    ),
                  },
                  {
                    key: 'actor',
                    label: 'Responsável / instante',
                    render: (r) => (
                      <>
                        {r.actor.displayName}
                        <br />
                        {formatDateTime(r.recordedAt)}
                      </>
                    ),
                  },
                ]}
              />
            ) : (
              <p>Nenhuma revisão registrada. Aprovação não altera o fechamento.</p>
            )}
            <Pagination
              page={reviewsPage}
              pageCount={Math.max(1, Math.ceil(d.reviews.total / 20))}
              onChange={setReviewsPage}
            />
          </section>
          {action && (
            <CashActionForm
              action={action}
              detail={d}
              onClose={() => {
                setAction(null);
                result.refresh();
              }}
              onDone={() => {
                setAction(null);
                onChanged(d.session.id);
              }}
            />
          )}
          {reverse && currentId && (
            <CashReversalForm
              movement={reverse}
              currentId={currentId}
              onClose={() => setReverse(null)}
              onDone={() => {
                setReverse(null);
                onChanged(d.session.id);
              }}
            />
          )}
          {order && (
            <OrderPanel
              id={order}
              current={current}
              onClose={() => setOrder('')}
              onChanged={() => {
                result.refresh();
                onChanged();
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
