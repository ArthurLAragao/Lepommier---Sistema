import { useState } from 'react';
import {
  batchListSchema,
  formatBusinessDate,
  type CurrentUser,
  type ReportResult,
} from '@pommier/shared';
import { Modal } from '../auth/AccountSettings.js';
import { BatchDetails } from '../inventory/Inventory.js';
import { OrderPanel } from '../sales/Orders.js';
import { useRegistryData } from '../registry/data.js';
import { DataStatus } from '../registry/ui.js';
import { Button, Table, Pagination, EmptyState } from '../components/ui.js';
type Row = ReportResult['items'][number];
export function ReportSource({
  row,
  current,
  onClose,
}: {
  row: Row;
  current: CurrentUser;
  onClose: () => void;
}) {
  const drill = row.drill;
  if (!drill) return null;
  if (drill.kind === 'order')
    return <OrderPanel id={drill.id} current={current} onClose={onClose} onChanged={() => {}} />;
  if (drill.kind === 'batch' || drill.kind === 'production')
    return (
      <BatchDetails
        id={drill.id}
        current={current}
        readOnly
        onClose={onClose}
        onAction={() => {}}
      />
    );
  return (
    <ProductSources
      id={drill.id}
      label={row.cells.label ?? 'Produto'}
      current={current}
      onClose={onClose}
    />
  );
}
function ProductSources({
  id,
  label,
  current,
  onClose,
}: {
  id: string;
  label: string;
  current: CurrentUser;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState('');
  const result = useRegistryData(`/inventory/products/${id}/batches?page=${page}`, batchListSchema);
  if (selected)
    return (
      <BatchDetails
        id={selected}
        current={current}
        readOnly
        onClose={() => setSelected('')}
        onAction={() => {}}
      />
    );
  return (
    <Modal title="Lotes e fontes do produto" onClose={onClose}>
      <p>
        {label} · Identidade {id}. Posição atual; o relatório histórico permanece separado.
      </p>
      <DataStatus {...result} retry={result.refresh} />
      {result.data &&
        (result.data.items.length ? (
          <>
            <Table
              caption="Lotes de origem do produto"
              rows={result.data.items}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: 'batch',
                  label: 'Lote',
                  render: (r) => (
                    <Button variant="ghost" onClick={() => setSelected(r.id)}>
                      Lote {r.number}
                    </Button>
                  ),
                },
                { key: 'reference', label: 'Referência', render: (r) => r.reference },
                { key: 'physical', label: 'Físico atual', render: (r) => r.physical },
                { key: 'reserved', label: 'Reservado atual', render: (r) => r.reserved },
                {
                  key: 'expiry',
                  label: 'Validade inserida',
                  render: (r) => (r.expiresAt ? formatBusinessDate(r.expiresAt) : 'Não informada'),
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
            title="Nenhum lote para este produto"
            description="A identidade do catálogo permanece; não há lote registrado."
          />
        ))}
      <Button onClick={onClose}>Fechar fontes</Button>
    </Modal>
  );
}
