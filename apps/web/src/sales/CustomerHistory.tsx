import { useState } from 'react';
import {
  customerHistorySchema,
  orderLabels,
  paymentLabels,
  sourceLabels,
  formatOrderMoney,
  formatDateTime,
  hasPermission,
  type CurrentUser,
} from '@pommier/shared';
import { Button, Table, Pagination, EmptyState } from '../components/ui.js';
import { DataStatus } from '../registry/ui.js';
import { useRegistryData } from '../registry/data.js';
import { OrderPanel } from './Orders.js';
import { orderNumber } from './data.js';
export default function CustomerHistory({ id, current }: { id: string; current: CurrentUser }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const result = useRegistryData(
    `/customers/${id}/order-history?page=${page}`,
    customerHistorySchema,
  );
  return (
    <section className="card profile-card">
      <h2>Pedidos, compras e pagamentos registrados</h2>
      {hasPermission(current.user.role, 'reports.customers') && (
        <a className="button button-secondary" href={'#reports?kind=customers&customerId=' + id}>
          Relatório deste cadastro por período
        </a>
      )}
      <p className="auth-help">
        Somente operações deste sistema. Histórico anterior em papel não foi importado. Entrada de
        pedido, entrega, pagamento e reembolso têm significados distintos; não há crédito ou dívida
        de cliente.
      </p>
      <DataStatus {...result} retry={result.refresh} />
      {result.data && (
        <>
          <dl className="profile-details">
            <div>
              <dt>Compras entregues antes de reembolsos</dt>
              <dd>{formatOrderMoney(result.data.fulfilledTotalCents)}</dd>
            </div>
            <div>
              <dt>Pagamentos recebidos de todos os pedidos</dt>
              <dd>{formatOrderMoney(result.data.paymentsReceivedCents)}</dd>
            </div>
            <div>
              <dt>Reembolsos registrados de todos os pedidos</dt>
              <dd>{formatOrderMoney(result.data.refundsCents)}</dd>
            </div>
            <div>
              <dt>Última entrega de compra</dt>
              <dd>
                {result.data.lastFulfilledAt
                  ? formatDateTime(result.data.lastFulfilledAt)
                  : 'Nenhuma entrega registrada'}
              </dd>
            </div>
          </dl>
          {result.data.orders.items.length ? (
            <Table
              caption="Histórico de pedidos do cliente"
              rows={result.data.orders.items}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: 'number',
                  label: 'Pedido',
                  render: (r) => (
                    <Button variant="ghost" onClick={() => setSelected(r.id)}>
                      {orderNumber(r.number)}
                    </Button>
                  ),
                },
                { key: 'source', label: 'Origem', render: (r) => sourceLabels[r.source] },
                { key: 'state', label: 'Entrega', render: (r) => orderLabels[r.status] },
                {
                  key: 'payment',
                  label: 'Pagamento/reembolso',
                  render: (r) => paymentLabels[r.paymentState],
                },
                {
                  key: 'total',
                  label: 'Total confirmado',
                  render: (r) => formatOrderMoney(r.totalCents),
                },
              ]}
            />
          ) : (
            <EmptyState
              title="Nenhum pedido registrado para este cliente"
              description="O histórico aparecerá quando houver operações conectadas a este cadastro."
            />
          )}
          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(result.data.orders.total / 20))}
            onChange={setPage}
          />
        </>
      )}
      {selected && (
        <OrderPanel
          id={selected}
          current={current}
          onClose={() => setSelected('')}
          onChanged={result.refresh}
        />
      )}
    </section>
  );
}
