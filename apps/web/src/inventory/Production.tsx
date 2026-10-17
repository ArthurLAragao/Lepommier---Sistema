import { useState, type FormEvent } from 'react';
import {
  productionListSchema,
  productionLabels,
  planInput,
  productionTransition,
  completeInput,
  hasPermission,
  formatBusinessDate,
  formatDateTime,
  businessDateOf,
  yieldShortfall,
  type ProductionDto,
  type CurrentUser,
} from '@pommier/shared';
import {
  Button,
  Field,
  Filter,
  Search,
  Table,
  Pagination,
  Badge,
  EmptyState,
} from '../components/ui.js';
import { Modal } from '../auth/AccountSettings.js';
import { DataStatus, TextArea } from '../registry/ui.js';
import { useRegistryData } from '../registry/data.js';
import {
  ProductPicker,
  BatchFields,
  CommandFeedback,
  CommandButtons,
  type InventoryProduct,
} from './common.js';
import { useStockCommand, useBatchFields } from './data.js';
export default function Production({ current }: { current: CurrentUser }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [product, setProduct] = useState<InventoryProduct | null>(null);
  const [page, setPage] = useState(1);
  const [create, setCreate] = useState(false);
  const [detail, setDetail] = useState<ProductionDto | null>(null);
  const [action, setAction] = useState<{
    record: ProductionDto;
    kind: 'START' | 'CANCEL' | 'COMPLETE';
  } | null>(null);
  const [message, setMessage] = useState('');
  const query = new URLSearchParams({ q, page: String(page) });
  if (status) query.set('status', status);
  if (date) query.set('date', date);
  if (product) query.set('productId', product.id);
  const result = useRegistryData(`/production?${query}`, productionListSchema);
  if (!hasPermission(current.user.role, 'production.manage'))
    return (
      <EmptyState title="Acesso restrito" description="Seu perfil não administra a produção." />
    );
  const done = () => {
    setCreate(false);
    setAction(null);
    result.refresh();
    setMessage('Produção atualizada e confirmada.');
  };
  return (
    <section className="registry-page">
      <div className="registry-toolbar">
        <div>
          <h2>Produção de unidades prontas</h2>
          <p>
            Planeje primeiro. Somente a conclusão recebe a quantidade realmente pronta no estoque.
          </p>
        </div>
        <Button onClick={() => setCreate(true)}>Planejar produção</Button>
      </div>
      <p className="info-note">
        Ingredientes, receitas, custo de receita e vendas não são movimentados nesta etapa.
        Diferença de rendimento não é perda de unidades que já estavam em estoque.
      </p>
      {message && <p role="status">{message}</p>}
      <div className="card registry-filters">
        <Search
          label="Buscar produção por produto"
          value={q}
          maxLength={120}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Filter
          label="Situação da produção"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas</option>
          {Object.entries(productionLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Filter>
        <Field
          label="Data planejada"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPage(1);
          }}
        />
        <ProductPicker
          label="Filtrar produto da produção"
          required={false}
          value={product}
          onChange={(p) => {
            setProduct(p);
            setPage(1);
          }}
        />
      </div>
      <DataStatus {...result} retry={result.refresh} />
      {result.data && (
        <section className="card registry-table">
          {result.data.items.length ? (
            <Table
              caption="Fila de produção"
              rows={result.data.items}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: 'product',
                  label: 'Produto',
                  render: (r) => (
                    <>
                      <strong>{r.product.name}</strong>
                      <small className="current-role">
                        {r.product.code}
                        {!r.product.active ? ' · inativo' : ''}
                      </small>
                    </>
                  ),
                },
                {
                  key: 'date',
                  label: 'Planejada para',
                  render: (r) => formatBusinessDate(r.plannedDate),
                },
                { key: 'planned', label: 'Planejado (un.)', render: (r) => r.plannedQuantity },
                {
                  key: 'actual',
                  label: 'Recebido pronto (un.)',
                  render: (r) => r.actualQuantity ?? 'Ainda não recebido',
                },
                {
                  key: 'status',
                  label: 'Situação',
                  render: (r) => <Badge>{productionLabels[r.status]}</Badge>,
                },
                {
                  key: 'actions',
                  label: 'Ações',
                  render: (r) => (
                    <div className="registry-actions">
                      <Button
                        variant="ghost"
                        aria-label={`Detalhes da produção de ${r.product.name}`}
                        onClick={() => setDetail(r)}
                      >
                        Detalhes
                      </Button>
                      {r.status === 'PLANNED' && (
                        <Button
                          variant="secondary"
                          aria-label={`Iniciar produção de ${r.product.name}`}
                          onClick={() => setAction({ record: r, kind: 'START' })}
                        >
                          Iniciar
                        </Button>
                      )}
                      {r.status === 'IN_PROGRESS' && (
                        <Button
                          aria-label={`Concluir produção de ${r.product.name}`}
                          onClick={() => setAction({ record: r, kind: 'COMPLETE' })}
                        >
                          Concluir
                        </Button>
                      )}
                      {['PLANNED', 'IN_PROGRESS'].includes(r.status) && (
                        <Button
                          variant="ghost"
                          aria-label={`Cancelar produção de ${r.product.name}`}
                          onClick={() => setAction({ record: r, kind: 'CANCEL' })}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          ) : (
            <EmptyState
              title="Nenhuma produção encontrada"
              description="Nenhum registro corresponde aos filtros. Planejar não cria saldo automaticamente."
            />
          )}
          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(result.data.total / 20))}
            onChange={setPage}
          />
        </section>
      )}
      {create && <ProductionPlan onClose={() => setCreate(false)} onDone={done} />}
      {detail && (
        <Modal title="Detalhes da produção" onClose={() => setDetail(null)}>
          <dl className="profile-details">
            <dt>Produto</dt>
            <dd>
              {detail.product.name} · {detail.product.code}
            </dd>
            <dt>Situação</dt>
            <dd>{productionLabels[detail.status]}</dd>
            <dt>Planejada para</dt>
            <dd>{formatBusinessDate(detail.plannedDate)}</dd>
            <dt>Quantidade planejada</dt>
            <dd>{detail.plannedQuantity} unidades</dd>
            <dt>Quantidade recebida pronta</dt>
            <dd>
              {detail.actualQuantity === null
                ? 'Ainda não recebida'
                : `${detail.actualQuantity} unidades`}
            </dd>
            <dt>Registrada por</dt>
            <dd>{detail.actor.displayName}</dd>
            <dt>Registrada em</dt>
            <dd>{formatDateTime(detail.createdAt)}</dd>
            <dt>Iniciada em</dt>
            <dd>{detail.startedAt ? formatDateTime(detail.startedAt) : 'Ainda não iniciada'}</dd>
            <dt>Concluída em</dt>
            <dd>
              {detail.completedAt ? formatDateTime(detail.completedAt) : 'Ainda não concluída'}
            </dd>
            {detail.cancelledAt && (
              <>
                <dt>Cancelada em</dt>
                <dd>{formatDateTime(detail.cancelledAt)}</dd>
                <dt>Motivo</dt>
                <dd>
                  {(
                    {
                      PLAN_CHANGE: 'Mudança de planejamento',
                      FAILED_BEFORE_FINISH: 'Falha antes de receber unidades prontas',
                      PRODUCT_UNAVAILABLE: 'Produto indisponível / origem alterada',
                    } as Record<string, string>
                  )[detail.cancelReason ?? ''] ?? 'Não informado'}
                </dd>
              </>
            )}
            <dt>Observações</dt>
            <dd className="plain-text">{detail.notes || 'Não informadas'}</dd>
          </dl>
          {detail.batchId && (
            <p>
              Consulte a referência e as movimentações do lote em Estoque. O registro concluído é
              preservado; correções exigem ajuste compensatório autorizado.
            </p>
          )}
          <Button variant="secondary" onClick={() => setDetail(null)}>
            Fechar
          </Button>
        </Modal>
      )}
      {action && (
        <ProductionAction
          record={action.record}
          kind={action.kind}
          onClose={() => setAction(null)}
          onDone={done}
        />
      )}
    </section>
  );
}
function ProductionPlan({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [product, setProduct] = useState<InventoryProduct | null>(null);
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(businessDateOf(new Date()));
  const [notes, setNotes] = useState('');
  const command = useStockCommand('/production', onDone);
  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = planInput.safeParse({
      productId: product?.id,
      plannedQuantity: Number(quantity),
      plannedDate: date,
      notes,
    });
    if (!parsed.success) {
      command.setError(parsed.error.issues[0]?.message ?? 'Revise os campos.');
      return;
    }
    void command.send(parsed.data);
  }
  return (
    <Modal title="Planejar produção" onClose={() => command.close(onClose)}>
      <form className="auth-form" onSubmit={submit}>
        <fieldset className="stock-fieldset" disabled={command.busy || command.uncertain}>
          <legend>Planejamento</legend>
          <ProductPicker value={product} onChange={setProduct} intent="produce" />
          <Field
            label="Quantidade planejada (unidades)"
            type="number"
            min={1}
            max={100000}
            step={1}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Field
            label="Data planejada"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <TextArea
            label="Observações da produção (opcional)"
            value={notes}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
          />
        </fieldset>
        <p>Este planejamento não recebe estoque nem consome ingredientes.</p>
        <CommandFeedback command={command} />
        <CommandButtons command={command} onClose={onClose} label="Confirmar planejamento" />
      </form>
    </Modal>
  );
}
function ProductionAction({
  record,
  kind,
  onClose,
  onDone,
}: {
  record: ProductionDto;
  kind: 'START' | 'CANCEL' | 'COMPLETE';
  onClose: () => void;
  onDone: () => void;
}) {
  const fields = useBatchFields();
  const [actual, setActual] = useState('');
  const [reason, setReason] = useState('');
  const command = useStockCommand(
    `/production/${record.id}/${kind === 'COMPLETE' ? 'complete' : 'transition'}`,
    onDone,
  );
  const title =
    kind === 'COMPLETE'
      ? 'Concluir produção'
      : kind === 'START'
        ? 'Iniciar produção'
        : 'Cancelar produção';
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const input =
        kind === 'COMPLETE'
          ? completeInput.parse({
              version: record.version,
              actualQuantity: Number(actual),
              batch: fields.value(),
            })
          : productionTransition.parse({
              version: record.version,
              action: kind,
              ...(kind === 'CANCEL' ? { reason } : {}),
            });
      void command.send(input);
    } catch (cause) {
      command.setError(
        cause instanceof Error && 'issues' in cause
          ? String((cause as { issues: Array<{ message: string }> }).issues[0]?.message)
          : 'Revise os campos antes de confirmar.',
      );
    }
  }
  return (
    <Modal title={title} onClose={() => command.close(onClose)}>
      <form className="auth-form" onSubmit={submit}>
        <p>
          <strong>{record.product.name}</strong> · Planejado: {record.plannedQuantity} unidades.
        </p>
        {kind === 'COMPLETE' ? (
          <>
            <Field
              label="Quantidade realmente concluída (unidades)"
              type="number"
              min={1}
              max={100000}
              step={1}
              required
              value={actual}
              disabled={command.busy || command.uncertain}
              onChange={(e) => setActual(e.target.value)}
            />
            {actual && Number(actual) > 0 && (
              <p className="info-note">
                Diferença não recebida para o planejado:{' '}
                {yieldShortfall(record.plannedQuantity, Number(actual))} unidades. Isso não retira
                estoque pronto. Sem unidade pronta, cancele a produção.
              </p>
            )}
            <BatchFields fields={fields} disabled={command.busy || command.uncertain} />
            <p>
              Ao confirmar, lote, entrada e conclusão são gravados juntos. Uma produção concluída é
              corrigida por ajuste compensatório autorizado.
            </p>
          </>
        ) : kind === 'CANCEL' ? (
          <>
            <Filter
              label="Motivo do cancelamento"
              required
              disabled={command.busy || command.uncertain}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">Escolha</option>
              <option value="PLAN_CHANGE">Mudança de planejamento</option>
              <option value="FAILED_BEFORE_FINISH">Falha antes de receber unidades prontas</option>
              <option value="PRODUCT_UNAVAILABLE">Produto indisponível / origem alterada</option>
            </Filter>
            <p>Cancelar antes da conclusão não acrescenta nem subtrai estoque pronto.</p>
          </>
        ) : (
          <p>Iniciar registra o início do trabalho; nenhum saldo de estoque é recebido agora.</p>
        )}
        <CommandFeedback command={command} />
        <CommandButtons
          command={command}
          onClose={onClose}
          label={
            kind === 'COMPLETE'
              ? 'Confirmar conclusão'
              : kind === 'START'
                ? 'Confirmar início'
                : 'Confirmar cancelamento'
          }
        />
      </form>
    </Modal>
  );
}
