import { useState, type FormEvent } from 'react';
import {
  orderListSchema,
  orderDetailSchema,
  orderLabels,
  sourceLabels,
  paymentLabels,
  methodLabels,
  reasonLabels,
  formatOrderMoney,
  formatDateTime,
  hasPermission,
  confirmInput,
  progressInput,
  orderPaymentInput,
  versionInput,
  cancelInput,
  refundInput,
  type OrderDetail,
  type CurrentUser,
} from '@pommier/shared';
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
import { Modal } from '../auth/AccountSettings.js';
import { DataStatus } from '../registry/ui.js';
import { useRegistryData, errorMessage } from '../registry/data.js';
import { useStockCommand } from '../inventory/data.js';
import { CommandFeedback, CommandButtons } from '../inventory/common.js';
import OrderEditor from './OrderEditor.js';
import { CashNotice, PaymentFields, ManualPaymentNotice } from './common.js';
import { orderNumber, usePaymentFields } from './data.js';
export default function Orders({
  current,
  sales = false,
}: {
  current: CurrentUser;
  sales?: boolean;
}) {
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [payment, setPayment] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const query = new URLSearchParams({ q, page: String(page) });
  if (sales) {
    query.set('source', 'COUNTER');
    query.set('status', 'FULFILLED');
  } else {
    if (source) query.set('source', source);
    if (status) query.set('status', status);
    if (from) query.set('pickupFrom', from);
    if (to) query.set('pickupTo', to);
  }
  if (payment) query.set('payment', payment);
  const result = useRegistryData(`/orders?${query}`, orderListSchema);
  const changed = () => {
    result.refresh();
    setMessage('Operação confirmada no sistema.');
  };
  return (
    <section className="registry-page">
      <div className="registry-toolbar">
        <div>
          <h2>{sales ? 'Vendas de balcão registradas' : 'Pedidos e retiradas'}</h2>
          <p>
            {sales
              ? 'Carrinho, recebimento manual e entrega com estoque em uma confirmação.'
              : 'WhatsApp é digitado pelo funcionário. Sem envio automático, entrega da loja ou crédito.'}
          </p>
        </div>
        <Button onClick={() => setCreate(true)}>
          {sales ? 'Nova venda de balcão' : 'Novo pedido manual'}
        </Button>
      </div>
      <CashNotice current={current} />
      {message && <p role="status">{message}</p>}
      <div className="card registry-filters">
        <Search
          label={
            sales ? 'Buscar venda por número ou cliente' : 'Buscar pedido por número ou cliente'
          }
          value={q}
          maxLength={120}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        {!sales && (
          <>
            <Filter
              label="Origem do filtro de pedidos"
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
            <Filter
              label="Situação da entrega"
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
            <Field
              label="Retirada desde (Fortaleza)"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
            <Field
              label="Retirada até (Fortaleza)"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </>
        )}
        <Filter
          label="Situação do pagamento"
          value={payment}
          onChange={(e) => {
            setPayment(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas</option>
          {Object.entries(paymentLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Filter>
      </div>
      <DataStatus {...result} retry={result.refresh} />
      {result.data && (
        <section className="card registry-table">
          {result.data.items.length ? (
            <Table
              caption={sales ? 'Histórico de vendas de balcão' : 'Lista de pedidos'}
              rows={result.data.items}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: 'number',
                  label: 'Número',
                  render: (r) => (
                    <Button
                      variant="ghost"
                      aria-label={`Abrir pedido ${orderNumber(r.number)}`}
                      onClick={() => setSelected(r.id)}
                    >
                      {orderNumber(r.number)}
                    </Button>
                  ),
                },
                { key: 'source', label: 'Origem', render: (r) => sourceLabels[r.source] },
                {
                  key: 'customer',
                  label: 'Cliente',
                  render: (r) => r.customer?.name ?? 'Balcão sem cliente',
                },
                {
                  key: 'status',
                  label: 'Entrega',
                  render: (r) => <Badge>{orderLabels[r.status]}</Badge>,
                },
                {
                  key: 'payment',
                  label: 'Pagamento',
                  render: (r) => (
                    <Badge
                      tone={
                        r.paymentState === 'PAID'
                          ? 'success'
                          : r.paymentState === 'REFUNDED'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {paymentLabels[r.paymentState]}
                    </Badge>
                  ),
                },
                {
                  key: 'total',
                  label: 'Total integral',
                  render: (r) => formatOrderMoney(r.totalCents),
                },
                {
                  key: 'pickup',
                  label: 'Retirada em Fortaleza',
                  render: (r) => (r.pickupAt ? formatDateTime(r.pickupAt) : 'Balcão'),
                },
              ]}
            />
          ) : (
            <EmptyState
              title={sales ? 'Nenhuma venda encontrada' : 'Nenhum pedido encontrado'}
              description="Nenhum registro corresponde aos filtros. Não há transações fictícias ou histórico anterior importado."
            />
          )}
          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(result.data.total / 20))}
            onChange={setPage}
          />
        </section>
      )}
      {create && (
        <OrderEditor
          mode={sales ? 'checkout' : 'draft'}
          current={current}
          onClose={() => setCreate(false)}
          onDone={(id) => {
            setCreate(false);
            setSelected(id);
            changed();
          }}
        />
      )}
      {selected && (
        <OrderPanel
          id={selected}
          current={current}
          onClose={() => setSelected('')}
          onChanged={changed}
        />
      )}
    </section>
  );
}
type Action = 'confirm' | 'prepare' | 'ready' | 'payment' | 'handover' | 'cancel' | 'refund';
const actionLabels: Record<Action, string> = {
  confirm: 'Confirmar pedido e reservar',
  prepare: 'Iniciar preparação',
  ready: 'Marcar como pronto',
  payment: 'Registrar pagamento integral',
  handover: 'Entregar pedido',
  cancel: 'Cancelar pedido',
  refund: 'Registrar reembolso integral',
};
export function OrderPanel({
  id,
  current,
  onClose,
  onChanged,
}: {
  id: string;
  current: CurrentUser;
  onClose: () => void;
  onChanged: () => void;
}) {
  const result = useRegistryData(`/orders/${id}`, orderDetailSchema);
  const [action, setAction] = useState<Action | null>(null);
  const [editing, setEditing] = useState(false);
  const order = result.data?.order;
  const done = () => {
    setAction(null);
    setEditing(false);
    result.refresh();
    onChanged();
  };
  if (editing && order)
    return (
      <OrderEditor
        current={current}
        mode="edit"
        initial={order}
        onClose={() => {
          setEditing(false);
          result.refresh();
        }}
        onDone={done}
      />
    );
  if (action && order)
    return (
      <OrderAction
        kind={action}
        order={order}
        onClose={() => {
          setAction(null);
          result.refresh();
        }}
        onDone={done}
      />
    );
  return (
    <Modal
      title={order ? `Pedido ${orderNumber(order.number)}` : 'Carregar pedido'}
      onClose={onClose}
    >
      <DataStatus {...result} retry={result.refresh} />
      {order && (
        <div className="auth-form">
          <p>
            <Badge>{orderLabels[order.status]}</Badge>{' '}
            <Badge tone={order.paymentState === 'REFUNDED' ? 'warning' : 'neutral'}>
              {paymentLabels[order.paymentState]}
            </Badge>
          </p>
          <dl className="profile-details">
            <div>
              <dt>Origem</dt>
              <dd>{sourceLabels[order.source]}</dd>
            </div>
            <div>
              <dt>Cliente atual</dt>
              <dd>{order.customer?.name ?? 'Balcão sem cliente'}</dd>
            </div>
            <div>
              <dt>Registrado por</dt>
              <dd>
                {order.creator.displayName} · {formatDateTime(order.createdAt)}
              </dd>
            </div>
            <div>
              <dt>Retirada agendada</dt>
              <dd>{order.pickupAt ? formatDateTime(order.pickupAt) : 'Balcão'}</dd>
            </div>
            <div>
              <dt>Pessoa que retira</dt>
              <dd>{order.pickupPerson ?? 'Não informada'}</dd>
            </div>
            <div>
              <dt>Orientação de coleta</dt>
              <dd className="plain-text">{order.collectionNote ?? 'Não informada'}</dd>
            </div>
            <div>
              <dt>Observações</dt>
              <dd className="plain-text">{order.notes ?? 'Não informadas'}</dd>
            </div>
            {order.fulfilledAt && (
              <div>
                <dt>Entrega registrada</dt>
                <dd>{formatDateTime(order.fulfilledAt)}</dd>
              </div>
            )}
            {order.cancelledAt && (
              <div>
                <dt>Cancelamento registrado</dt>
                <dd>
                  {formatDateTime(order.cancelledAt)} ·{' '}
                  {reasonLabels[order.cancelReason as keyof typeof reasonLabels] ??
                    'Motivo registrado'}
                </dd>
              </div>
            )}
          </dl>
          <Table
            caption="Itens e preços preservados do pedido"
            rows={order.items}
            rowKey={(r) => r.id}
            columns={[
              {
                key: 'product',
                label: 'Produto',
                render: (r) => (
                  <>
                    <strong>{r.productName}</strong>
                    <small className="current-role">{r.productCode}</small>
                  </>
                ),
              },
              { key: 'qty', label: 'Unidades', render: (r) => r.quantity },
              {
                key: 'price',
                label: 'Preço unitário',
                render: (r) => formatOrderMoney(String(r.unitPriceCents)),
              },
              {
                key: 'discount',
                label: 'Desconto alocado',
                render: (r) => formatOrderMoney(r.discountCents),
              },
              {
                key: 'total',
                label: 'Total da linha',
                render: (r) => formatOrderMoney(r.totalCents),
              },
            ]}
          />
          <p className="pos-total">
            Subtotal {formatOrderMoney(order.subtotalCents)} · Desconto{' '}
            {formatOrderMoney(order.discountCents)} ·{' '}
            <strong>Total {formatOrderMoney(order.totalCents)}</strong>
          </p>
          <section>
            <h3>Pagamento e reembolso</h3>
            {order.payment ? (
              <>
                <p>
                  {methodLabels[order.payment.method]} ·{' '}
                  {formatOrderMoney(order.payment.amountCents)} ·{' '}
                  {formatDateTime(order.payment.recordedAt)} · {order.payment.actor.displayName}
                </p>
                <p>Recebimento confirmado manualmente; não verificado por banco/provedor.</p>
                {order.payment.method === 'CASH' && (
                  <p>
                    Dinheiro recebido: {formatOrderMoney(order.payment.tenderedCents!)} · Troco:{' '}
                    {formatOrderMoney(order.payment.changeCents!)}
                  </p>
                )}
              </>
            ) : (
              <p>Nenhum pagamento registrado. Não é permitido entregar sem pagamento integral.</p>
            )}
            {order.refund && (
              <p className="info-note">
                Reembolso integral registrado: {formatOrderMoney(order.refund.amountCents)} ·{' '}
                {methodLabels[order.refund.method]} · {formatDateTime(order.refund.recordedAt)} ·{' '}
                {order.refund.actor.displayName}. Não houve reposição automática de alimento nem
                reversão da entrega histórica.
              </p>
            )}
          </section>
          <section>
            <h3>Reservas e elegibilidade</h3>
            {order.reservationIssues.length ? (
              <>
                <p className="form-error">
                  Entrega bloqueada: há exceções nas reservas. Cancele e recrie com unidades
                  elegíveis; pedido pago exige reembolso integral pelo proprietário. Nenhum lote
                  será trocado silenciosamente.
                </p>
                <ul>
                  {order.reservationIssues.map((issue) => (
                    <li key={issue.productId}>
                      {order.items.find((i) => i.productId === issue.productId)?.productName}:{' '}
                      {issue.quantity} un. —{' '}
                      {
                        {
                          EXPIRED: 'Lote vencido para a retirada',
                          PRODUCT_INACTIVE: 'Produto desativado',
                          INCONSISTENT: 'Conciliação necessária',
                        }[issue.code]
                      }
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                {order.status === 'DRAFT'
                  ? 'Rascunho sem reserva.'
                  : order.status === 'FULFILLED'
                    ? 'Reserva consumida na entrega.'
                    : order.status === 'CANCELLED'
                      ? 'Sem reservas pendentes deste pedido.'
                      : 'Reservas verificadas; a elegibilidade será conferida novamente na entrega.'}
              </p>
            )}
          </section>
          <div className="registry-actions">
            {order.status === 'DRAFT' && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Editar rascunho
                </Button>
                <Button onClick={() => setAction('confirm')}>{actionLabels.confirm}</Button>
              </>
            )}
            {order.status === 'CONFIRMED' && (
              <Button onClick={() => setAction('prepare')}>{actionLabels.prepare}</Button>
            )}
            {order.status === 'PREPARING' && (
              <Button onClick={() => setAction('ready')}>{actionLabels.ready}</Button>
            )}
            {['CONFIRMED', 'PREPARING', 'READY'].includes(order.status) &&
              order.paymentState === 'UNPAID' && (
                <Button variant="secondary" onClick={() => setAction('payment')}>
                  {actionLabels.payment}
                </Button>
              )}
            {order.status === 'READY' && (
              <Button
                disabled={order.paymentState !== 'PAID' || order.reservationIssues.length > 0}
                onClick={() => setAction('handover')}
              >
                {actionLabels.handover}
              </Button>
            )}
            {!['FULFILLED', 'CANCELLED'].includes(order.status) &&
              (order.paymentState === 'UNPAID' ||
                hasPermission(current.user.role, 'orders.refund')) && (
                <Button variant="ghost" onClick={() => setAction('cancel')}>
                  {order.paymentState === 'PAID'
                    ? 'Cancelar e registrar reembolso'
                    : actionLabels.cancel}
                </Button>
              )}
            {order.status === 'FULFILLED' &&
              order.paymentState === 'PAID' &&
              hasPermission(current.user.role, 'orders.refund') && (
                <Button variant="secondary" onClick={() => setAction('refund')}>
                  {actionLabels.refund}
                </Button>
              )}
          </div>
          <section>
            <h3>Histórico de responsáveis e horários</h3>
            <ul className="history-list">
              {order.events.map((event) => (
                <li key={event.id}>
                  {(
                    {
                      ORDER_CREATED: 'Rascunho criado',
                      ORDER_EDITED: 'Rascunho revisado',
                      ORDER_CONFIRMED: 'Pedido confirmado',
                      ORDER_PREPARING: 'Preparação iniciada',
                      ORDER_READY: 'Pronto para retirada',
                      PAYMENT_RECORDED: 'Pagamento integral registrado',
                      ORDER_FULFILLED: 'Entrega registrada',
                      ORDER_CANCELLED: 'Pedido cancelado',
                      REFUND_RECORDED: 'Reembolso integral registrado',
                    } as Record<string, string>
                  )[event.type] ?? 'Operação registrada'}{' '}
                  · {formatDateTime(event.createdAt)} · {event.actor.displayName}
                  {event.reason
                    ? ` · ${reasonLabels[event.reason as keyof typeof reasonLabels] ?? 'Motivo registrado'}`
                    : ''}
                </li>
              ))}
            </ul>
          </section>
          <p className="auth-help">
            Comprovante interno não fiscal. Não emite documento fiscal. Valores e itens confirmados
            são preservados; dados de coleta de cliente anonimizado são removidos.
          </p>
          <Button variant="secondary" onClick={onClose}>
            Fechar pedido
          </Button>
        </div>
      )}
    </Modal>
  );
}
function OrderAction({
  kind,
  order,
  onClose,
  onDone,
}: {
  kind: Action;
  order: OrderDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const payment = usePaymentFields();
  const [reason, setReason] = useState('');
  const [refundConfirmed, setRefundConfirmed] = useState(false);
  const path = kind === 'prepare' || kind === 'ready' ? 'progress' : kind;
  const command = useStockCommand(`/orders/${order.id}/${path}`, onDone, '/sales/operations');
  const paidCancellation = kind === 'cancel' && order.paymentState === 'PAID';
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const payload =
        kind === 'confirm'
          ? confirmInput.parse({ version: order.version, expectedTotalCents: order.totalCents })
          : kind === 'prepare' || kind === 'ready'
            ? progressInput.parse({
                version: order.version,
                to: kind === 'ready' ? 'READY' : 'PREPARING',
              })
            : kind === 'payment'
              ? orderPaymentInput.parse({
                  version: order.version,
                  payment: payment.value(order.totalCents),
                })
              : kind === 'cancel'
                ? cancelInput.parse({
                    version: order.version,
                    reason,
                    ...(paidCancellation ? { externalRefundConfirmed: refundConfirmed } : {}),
                  })
                : kind === 'refund'
                  ? refundInput.parse({
                      version: order.version,
                      reason,
                      externalRefundConfirmed: refundConfirmed,
                    })
                  : versionInput.parse({ version: order.version });
      void command.send(payload);
    } catch (cause) {
      command.setError(errorMessage(cause));
    }
  }
  return (
    <Modal
      title={paidCancellation ? 'Cancelar com reembolso integral' : actionLabels[kind]}
      onClose={() => command.close(onClose)}
    >
      <form className="auth-form" onSubmit={submit}>
        <p>
          <strong>{orderNumber(order.number)}</strong> ·{' '}
          {order.customer?.name ?? 'Balcão sem cliente'} · Total{' '}
          {formatOrderMoney(order.totalCents)}
        </p>
        <fieldset className="stock-fieldset" disabled={command.busy || command.uncertain}>
          <legend>Conferência da operação</legend>
          {kind === 'confirm' && (
            <p>
              Confirma os itens/preços revisados e reserva todas as unidades elegíveis para a data
              de retirada. Se faltar qualquer item, nenhuma reserva será confirmada.
            </p>
          )}
          {kind === 'handover' && (
            <p>
              Confira o pedido e a pessoa que retira. A entrega consome toda a reserva e exige
              pagamento integral e lotes elegíveis. Não há entrega parcial.
            </p>
          )}
          {(kind === 'prepare' || kind === 'ready') && (
            <p>
              Registra apenas a etapa de atendimento. A reserva será consumida somente na entrega
              paga.
            </p>
          )}
          {kind === 'payment' && <PaymentFields fields={payment} total={order.totalCents} />}
          {(kind === 'cancel' || kind === 'refund') && (
            <>
              <Filter
                label="Motivo da operação"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="">Escolha um motivo</option>
                {Object.entries(reasonLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Filter>
              <p>
                {kind === 'refund'
                  ? 'A entrega histórica permanece. O reembolso não devolve alimentos ao estoque.'
                  : 'O cancelamento preserva o pedido e libera reservas não consumidas. Alterar itens/preço após confirmação exige cancelar e recriar.'}
              </p>
              {(kind === 'refund' || paidCancellation) && (
                <>
                  <p>
                    Reembolso integral de {formatOrderMoney(order.payment!.amountCents)} por{' '}
                    {methodLabels[order.payment!.method]}, vinculado à sessão de caixa aberta agora.
                    O sistema não executa a devolução.
                  </p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      required
                      checked={refundConfirmed}
                      onChange={(e) => setRefundConfirmed(e.target.checked)}
                    />
                    Confirmo que o reembolso integral externo foi realizado pelo método original.
                  </label>
                </>
              )}
            </>
          )}
        </fieldset>
        {(kind === 'payment' || kind === 'refund' || paidCancellation) && <ManualPaymentNotice />}
        <CommandFeedback command={command} />
        {command.error && !command.uncertain && (
          <p>
            Se a versão ou o preço mudou, feche esta conferência para recarregar e revisar o pedido.
            Não repita um pagamento externo.
          </p>
        )}
        <CommandButtons
          command={command}
          onClose={onClose}
          label={
            paidCancellation ? 'Confirmar cancelamento e registro do reembolso' : actionLabels[kind]
          }
        />
      </form>
    </Modal>
  );
}
