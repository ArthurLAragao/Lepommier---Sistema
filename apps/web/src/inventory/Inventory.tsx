import { useState } from 'react';
import { z } from 'zod';
import {
  hasPermission,
  stockListSchema,
  batchListSchema,
  batchDetailSchema,
  movementListSchema,
  reconciliationSchema,
  formatBusinessDate,
  formatDateTime,
  formatMoney,
  movementLabels,
  type CurrentUser,
  type CategoryDto,
  type StockBatch,
} from '@pommier/shared';
import { Button, Filter, Search, Table, Pagination, Badge, EmptyState } from '../components/ui.js';
import { Modal } from '../auth/AccountSettings.js';
import { authRequest } from '../auth/api.js';
import { DataStatus } from '../registry/ui.js';
import { useRegistryData, errorMessage } from '../registry/data.js';
import { CategoryChoice } from '../registry/Catalog.js';
import { BatchSummary, type InventoryProduct } from './common.js';
import { formatUnits, stockReasonLabels } from './data.js';
import { StockEntry, BatchMutation, type StockEntryKind } from './StockForms.js';
const sourceLabels = {
  OPENING: 'Saldo inicial',
  PRODUCTION: 'Produção interna',
  PURCHASED: 'Compra de produto pronto',
  ADJUSTMENT: 'Ajuste positivo',
};
type StockItem = z.infer<typeof stockListSchema>['items'][number];
export default function Inventory({ current }: { current: CurrentUser }) {
  const detailed = hasPermission(current.user.role, 'inventory.read');
  const [q, setQ] = useState('');
  const [state, setState] = useState('active');
  const [origin, setOrigin] = useState('');
  const [category, setCategory] = useState<CategoryDto | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<InventoryProduct | null>(null);
  const [entry, setEntry] = useState<StockEntryKind | null>(null);
  const [message, setMessage] = useState('');
  const query = new URLSearchParams({ q, state, page: String(page) });
  if (origin) query.set('origin', origin);
  if (category) query.set('categoryId', category.id);
  const result = useRegistryData(`/inventory?${query}`, stockListSchema);
  const done = () => {
    setEntry(null);
    result.refresh();
    setMessage('Movimentação confirmada no histórico.');
  };
  return (
    <section className="registry-page">
      {selected ? (
        <StockPanel
          product={selected}
          current={current}
          onBack={() => {
            setSelected(null);
            result.refresh();
          }}
          onChanged={() => result.refresh()}
        />
      ) : (
        <>
          <div className="registry-toolbar">
            <div>
              <h2>Estoque de produtos prontos</h2>
              <p>Unidades inteiras, uma loja e rastreabilidade por lote.</p>
            </div>
            <div className="registry-actions">
              {hasPermission(current.user.role, 'inventory.opening') && (
                <Button variant="secondary" onClick={() => setEntry('opening')}>
                  Registrar saldo inicial
                </Button>
              )}
              {hasPermission(current.user.role, 'inventory.receive') && (
                <Button onClick={() => setEntry('receipt')}>Receber produto comprado</Button>
              )}
              {hasPermission(current.user.role, 'inventory.adjust') && (
                <Button variant="secondary" onClick={() => setEntry('adjust-new')}>
                  Ajuste positivo em novo lote
                </Button>
              )}
            </div>
          </div>
          <p className="info-note">
            Físico inclui unidades vencidas ainda presentes. Vendável exclui lotes vencidos e
            reservas. Reservas exibidas são o estado registrado; pedidos, vendas e pagamentos ainda
            não estão implementados.
          </p>
          {message && <p role="status">{message}</p>}
          <div className="card registry-filters">
            <Search
              label="Buscar estoque"
              placeholder="Nome ou código"
              value={q}
              maxLength={120}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            {detailed && (
              <Filter
                label="Situação do produto no estoque"
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setPage(1);
                }}
              >
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
                <option value="all">Todos</option>
              </Filter>
            )}
            <Filter
              label="Origem no estoque"
              value={origin}
              onChange={(e) => {
                setOrigin(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              <option value="PRODUCED">Produzido</option>
              <option value="PURCHASED">Comprado pronto</option>
              <option value="BOTH">Ambas</option>
            </Filter>
            <CategoryChoice
              value={category}
              onChange={(c) => {
                setCategory(c);
                setPage(1);
              }}
            />
          </div>
          <DataStatus {...result} retry={result.refresh} />
          {result.data && (
            <section className="card registry-table">
              {result.data.items.length ? (
                <Table
                  caption="Saldos atuais de estoque"
                  rows={result.data.items}
                  rowKey={(r) => r.product.id}
                  columns={[
                    {
                      key: 'product',
                      label: 'Produto',
                      render: (r) => (
                        <>
                          {detailed ? (
                            <Button
                              variant="ghost"
                              aria-label={`Ver lotes de ${r.product.name}`}
                              onClick={() => setSelected(r.product)}
                            >
                              {r.product.name}
                            </Button>
                          ) : (
                            <strong>{r.product.name}</strong>
                          )}
                          <small className="current-role">
                            {r.product.code}
                            {!r.product.active ? ' · inativo' : ''}
                          </small>
                        </>
                      ),
                    },
                    ...(detailed
                      ? [
                          {
                            key: 'physical',
                            label: 'Físico (un.)',
                            render: (r: StockItem) => formatUnits(r.physical ?? '0'),
                          },
                          {
                            key: 'reserved',
                            label: 'Reservado (un.)',
                            render: (r: StockItem) => formatUnits(r.reserved ?? '0'),
                          },
                          {
                            key: 'blocked',
                            label: 'Bloqueado / vencido (un.)',
                            render: (r: StockItem) => formatUnits(r.blocked ?? '0'),
                          },
                        ]
                      : []),
                    {
                      key: 'available',
                      label: 'Disponível vendável (un.)',
                      render: (r) =>
                        r.consistent ? (
                          formatUnits(r.available)
                        ) : (
                          <Badge tone="warning">Conciliação necessária</Badge>
                        ),
                    },
                    ...(detailed
                      ? [
                          {
                            key: 'exception',
                            label: 'Exceção de reserva vencida',
                            render: (r: StockItem) =>
                              r.expiredReserved !== '0' && r.expiredReserved ? (
                                <Badge tone="warning">
                                  {formatUnits(r.expiredReserved)} un. exigem revisão
                                </Badge>
                              ) : (
                                'Nenhuma registrada'
                              ),
                          },
                        ]
                      : []),
                  ]}
                />
              ) : (
                <EmptyState
                  title="Nenhum produto encontrado no estoque"
                  description="Cadastre produtos no catálogo ou ajuste os filtros. Nenhuma quantidade foi inventada."
                />
              )}
              <Pagination
                page={page}
                pageCount={Math.max(1, Math.ceil(result.data.total / 20))}
                onChange={setPage}
              />
            </section>
          )}
        </>
      )}
      {entry && (
        <StockEntry kind={entry} current={current} onClose={() => setEntry(null)} onDone={done} />
      )}
    </section>
  );
}
function StockPanel({
  product,
  current,
  onBack,
  onChanged,
}: {
  product: InventoryProduct;
  current: CurrentUser;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<'batches' | 'history'>('batches');
  const [batchPage, setBatchPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [mutation, setMutation] = useState<{ kind: 'waste' | 'adjust'; batch: StockBatch } | null>(
    null,
  );
  const [entry, setEntry] = useState<StockEntryKind | null>(null);
  const [report, setReport] = useState<z.infer<typeof reconciliationSchema> | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const batches = useRegistryData(
    `/inventory/products/${product.id}/batches?page=${batchPage}`,
    batchListSchema,
  );
  const history = useRegistryData(
    `/inventory/products/${product.id}/movements?page=${historyPage}`,
    movementListSchema,
  );
  function done() {
    setMutation(null);
    setEntry(null);
    batches.refresh();
    history.refresh();
    setReport(null);
    setMessage('Movimentação confirmada. Saldos e histórico atualizados.');
    onChanged();
  }
  async function reconcile() {
    setChecking(true);
    setError('');
    try {
      setReport(
        await authRequest(`/inventory/products/${product.id}/reconciliation`, reconciliationSchema),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <Button variant="secondary" onClick={onBack}>
        Voltar para estoque
      </Button>
      <section className="card profile-card">
        <div className="registry-toolbar">
          <div>
            <p className="small-label">{product.code}</p>
            <h2>{product.name}</h2>
          </div>
          <div className="registry-actions">
            {hasPermission(current.user.role, 'inventory.opening') && (
              <Button variant="secondary" onClick={() => setEntry('opening')}>
                Saldo inicial deste produto
              </Button>
            )}
            {hasPermission(current.user.role, 'inventory.receive') &&
              product.origin !== 'PRODUCED' && (
                <Button onClick={() => setEntry('receipt')}>Receber compra deste produto</Button>
              )}
            {hasPermission(current.user.role, 'inventory.reconcile') && (
              <Button
                variant="secondary"
                busy={checking}
                onClick={() => {
                  void reconcile();
                }}
              >
                Conferir conciliação
              </Button>
            )}
          </div>
        </div>
        <p>
          Conciliação é somente leitura. Divergências bloqueiam novas movimentações; não há reparo
          automático.
        </p>
      </section>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {report && (
        <section className="card profile-card">
          <h3>{report.consistent ? 'Histórico e saldos conferem' : 'Divergência encontrada'}</h3>
          {report.findings.map((f, i) => (
            <p key={`${f.batchId}-${f.code}-${i}`}>
              Lote {f.batchId}:{' '}
              {f.code === 'PHYSICAL_DRIFT'
                ? 'Saldo físico'
                : f.code === 'RESERVED_DRIFT'
                  ? 'Reserva projetada'
                  : 'Integridade de alocação'}{' '}
              · esperado {f.expected} · registrado {f.actual}.
            </p>
          ))}
        </section>
      )}
      <div className="registry-actions">
        <Button
          variant={tab === 'batches' ? 'primary' : 'secondary'}
          aria-pressed={tab === 'batches'}
          onClick={() => setTab('batches')}
        >
          Lotes
        </Button>
        <Button
          variant={tab === 'history' ? 'primary' : 'secondary'}
          aria-pressed={tab === 'history'}
          onClick={() => setTab('history')}
        >
          Movimentações
        </Button>
      </div>
      {tab === 'batches' ? (
        <>
          <DataStatus {...batches} retry={batches.refresh} />
          {batches.data && (
            <section className="card registry-table">
              {batches.data.items.length ? (
                <Table
                  caption="Lotes do produto"
                  rows={batches.data.items}
                  rowKey={(r) => r.id}
                  columns={[
                    {
                      key: 'batch',
                      label: 'Lote',
                      render: (r) => (
                        <Button
                          variant="ghost"
                          aria-label={`Abrir lote ${r.reference}`}
                          onClick={() => setDetailId(r.id)}
                        >
                          LOT-{String(r.number).padStart(6, '0')} · {r.reference}
                        </Button>
                      ),
                    },
                    {
                      key: 'source',
                      label: 'Origem da entrada',
                      render: (r) => sourceLabels[r.source],
                    },
                    {
                      key: 'expiry',
                      label: 'Validade',
                      render: (r) =>
                        r.expiresAt ? (
                          <>
                            <span>{formatBusinessDate(r.expiresAt)}</span>
                            {r.expired && <Badge tone="warning">Vencido / bloqueado</Badge>}
                          </>
                        ) : (
                          <Badge tone="warning">Validade desconhecida</Badge>
                        ),
                    },
                    {
                      key: 'physical',
                      label: 'Físico (un.)',
                      render: (r) => formatUnits(r.physical),
                    },
                    {
                      key: 'reserved',
                      label: 'Reservado (un.)',
                      render: (r) => formatUnits(r.reserved),
                    },
                    {
                      key: 'available',
                      label: 'Vendável (un.)',
                      render: (r) =>
                        r.consistent ? formatUnits(r.available) : 'Conciliação necessária',
                    },
                  ]}
                />
              ) : (
                <EmptyState
                  title="Nenhum lote registrado"
                  description="Registre uma contagem inicial, conclua produção ou receba produtos comprados conforme seu perfil."
                />
              )}
              <Pagination
                page={batchPage}
                pageCount={Math.max(1, Math.ceil(batches.data.total / 20))}
                onChange={setBatchPage}
              />
            </section>
          )}
        </>
      ) : (
        <>
          <DataStatus {...history} retry={history.refresh} />
          {history.data && (
            <section className="card registry-table">
              {history.data.items.length ? (
                <Table
                  caption="Histórico de movimentações"
                  rows={history.data.items}
                  rowKey={(r) => r.id}
                  columns={[
                    {
                      key: 'type',
                      label: 'Movimento',
                      render: (r) => (
                        <>
                          <strong>{movementLabels[r.type]}</strong>
                          <small className="current-role">
                            {stockReasonLabels[r.reason] ?? 'Motivo registrado'}
                          </small>
                        </>
                      ),
                    },
                    {
                      key: 'quantity',
                      label: 'Efeito físico (un.)',
                      render: (r) => `${r.direction === 'IN' ? '+' : '−'}${r.quantity}`,
                    },
                    { key: 'batch', label: 'Lote', render: (r) => r.batch.reference },
                    {
                      key: 'time',
                      label: 'Registrado em Fortaleza',
                      render: (r) => formatDateTime(r.createdAt),
                    },
                    { key: 'actor', label: 'Responsável', render: (r) => r.actor.displayName },
                    {
                      key: 'reference',
                      label: 'Referência',
                      render: (r) => (
                        <details>
                          <summary>Ver referência e observação</summary>
                          <p className="plain-text">Movimento: {r.id}</p>
                          <p className="plain-text">Operação de origem: {r.operationId}</p>
                          {r.correctsMovementId && (
                            <p className="plain-text">Compensa: {r.correctsMovementId}</p>
                          )}
                          <p className="plain-text">{r.notes ?? 'Sem observação.'}</p>
                        </details>
                      ),
                    },
                  ]}
                />
              ) : (
                <EmptyState
                  title="Nenhuma movimentação registrada"
                  description="O histórico é acrescentado apenas por operações confirmadas."
                />
              )}
              <Pagination
                page={historyPage}
                pageCount={Math.max(1, Math.ceil(history.data.total / 20))}
                onChange={setHistoryPage}
              />
            </section>
          )}
        </>
      )}
      {detailId && (
        <BatchDetails
          id={detailId}
          current={current}
          onClose={() => setDetailId(null)}
          onAction={(kind, batch) => {
            setDetailId(null);
            setMutation({ kind, batch });
          }}
        />
      )}
      {mutation && (
        <BatchMutation
          kind={mutation.kind}
          batch={mutation.batch}
          product={product}
          onClose={() => {
            setMutation(null);
            batches.refresh();
          }}
          onDone={done}
        />
      )}
      {entry && (
        <StockEntry
          kind={entry}
          initialProduct={product}
          current={current}
          onClose={() => setEntry(null)}
          onDone={done}
        />
      )}
    </>
  );
}
function BatchDetails({
  id,
  current,
  onClose,
  onAction,
}: {
  id: string;
  current: CurrentUser;
  onClose: () => void;
  onAction: (kind: 'waste' | 'adjust', batch: StockBatch) => void;
}) {
  const result = useRegistryData(`/inventory/batches/${id}`, batchDetailSchema);
  const b = result.data?.batch;
  const r = result.data?.receipt;
  return (
    <Modal title="Detalhes do lote" onClose={onClose}>
      <DataStatus {...result} retry={result.refresh} />
      {b && (
        <div className="auth-form">
          <BatchSummary batch={b} />
          <dl className="profile-details">
            <div>
              <dt>Origem</dt>
              <dd>{sourceLabels[b.source]}</dd>
            </div>
            <div>
              <dt>Responsável pela entrada</dt>
              <dd>{b.actor.displayName}</dd>
            </div>
            <div>
              <dt>Validade</dt>
              <dd>
                {b.expiresAt
                  ? `${formatBusinessDate(b.expiresAt)}${b.expired ? ' · vencido / bloqueado' : ''}`
                  : 'Validade desconhecida; não é garantia de segurança'}
              </dd>
            </div>
            <div>
              <dt>Registrado em</dt>
              <dd>{formatDateTime(b.recordedAt)}</dd>
            </div>
            <div>
              <dt>Observações</dt>
              <dd className="plain-text">{b.notes ?? 'Não informadas'}</dd>
            </div>
          </dl>
          {r && (
            <section>
              <h3>Recebimento de produto pronto</h3>
              <p>Fornecedor/referência: {r.supplierReference}</p>
              <p>Lote do fornecedor: {r.supplierBatch ?? 'Não informado'}</p>
              <p className="plain-text">Observações da entrada: {r.notes ?? 'Não informadas'}</p>
              {Object.hasOwn(r, 'unitCostCents') && (
                <p>
                  Custo unitário da compra:{' '}
                  {r.unitCostCents === null ? 'Não informado' : formatMoney(r.unitCostCents!)}
                </p>
              )}
              <p className="auth-help">
                Snapshot da entrada. Não registra pagamento ou despesa em caixa e não altera o custo
                estimado do catálogo.
              </p>
            </section>
          )}
          {b.expiredReserved !== '0' && (
            <p className="form-error">
              Há {b.expiredReserved} unidades reservadas em lote vencido. Exigem liberação/revisão
              explícita pelo serviço de origem; não serão consumidas nem realocadas automaticamente.
            </p>
          )}
          <div className="registry-actions">
            {hasPermission(current.user.role, 'inventory.waste') &&
              (current.user.role !== 'PRODUCTION' || b.source === 'PRODUCTION') && (
                <Button
                  variant="secondary"
                  disabled={!b.consistent}
                  onClick={() => onAction('waste', b)}
                >
                  Registrar perda
                </Button>
              )}
            {hasPermission(current.user.role, 'inventory.adjust') && (
              <Button
                variant="secondary"
                disabled={!b.consistent}
                onClick={() => onAction('adjust', b)}
              >
                Ajustar lote
              </Button>
            )}
            <Button onClick={onClose}>Fechar lote</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
