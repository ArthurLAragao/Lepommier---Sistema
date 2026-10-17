import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  hasPermission,
  openingInput,
  receiptInput,
  adjustmentInput,
  wasteInput,
  parseMoney,
  type CurrentUser,
  type StockBatch,
} from '@pommier/shared';
import { Button, Field, Filter } from '../components/ui.js';
import { Modal } from '../auth/AccountSettings.js';
import { TextArea } from '../registry/ui.js';
import { errorMessage } from '../registry/data.js';
import {
  ProductPicker,
  BatchFields,
  BatchSummary,
  CommandFeedback,
  CommandButtons,
  type InventoryProduct,
} from './common.js';
import { useStockCommand, useBatchFields } from './data.js';
export type StockEntryKind = 'opening' | 'receipt' | 'adjust-new';
export function StockEntry({
  kind,
  current,
  initialProduct,
  onClose,
  onDone,
}: {
  kind: StockEntryKind;
  current: CurrentUser;
  initialProduct?: InventoryProduct;
  onClose: () => void;
  onDone: () => void;
}) {
  const [product, setProduct] = useState<InventoryProduct | null>(initialProduct ?? null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [supplier, setSupplier] = useState('');
  const [supplierBatch, setSupplierBatch] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const fields = useBatchFields();
  const route =
    kind === 'opening'
      ? '/inventory/opening'
      : kind === 'receipt'
        ? '/inventory/receipts'
        : '/inventory/adjustments';
  const command = useStockCommand(route, onDone);
  const title =
    kind === 'opening'
      ? 'Registrar saldo inicial'
      : kind === 'receipt'
        ? 'Receber produto comprado'
        : 'Ajuste positivo em novo lote';
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const base = { productId: product?.id, quantity: Number(quantity) };
      const batch = fields.value();
      const payload =
        kind === 'opening'
          ? openingInput.parse({ ...base, batch, reason })
          : kind === 'receipt'
            ? receiptInput.parse({
                ...base,
                batch,
                supplierReference: supplier,
                supplierBatch,
                notes,
                ...(hasPermission(current.user.role, 'inventory.cost')
                  ? { unitCostCents: cost ? parseMoney(cost) : null }
                  : {}),
              })
            : adjustmentInput.parse({
                ...base,
                newBatch: batch,
                direction: 'IN',
                reason: 'COUNT_DIFFERENCE',
                notes,
              });
      void command.send(payload);
    } catch (cause) {
      command.setError(
        cause instanceof z.ZodError
          ? (cause.issues[0]?.message ?? 'Revise os dados.')
          : errorMessage(cause),
      );
    }
  }
  return (
    <Modal title={title} onClose={() => command.close(onClose)}>
      <form className="auth-form" onSubmit={submit}>
        <p>
          Registra agora no horário do servidor; não permite retroagir datas. Use apenas contagens e
          referências confirmadas.
        </p>
        <fieldset className="stock-fieldset" disabled={command.busy || command.uncertain}>
          <legend>Entrada em unidades inteiras</legend>
          <ProductPicker
            value={product}
            onChange={setProduct}
            intent={kind === 'receipt' ? 'receive' : 'any'}
          />
          <Field
            label="Quantidade de entrada (unidades)"
            type="number"
            min={1}
            max={100000}
            step={1}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {kind === 'opening' && (
            <Filter
              label="Motivo do saldo inicial"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">Escolha</option>
              <option value="INITIAL_COUNT">Contagem física inicial</option>
              <option value="LEGACY_REFERENCE">Conferência de registro anterior</option>
            </Filter>
          )}
          {kind === 'receipt' && (
            <>
              <Field
                label="Fornecedor / referência da compra"
                value={supplier}
                maxLength={120}
                required
                onChange={(e) => setSupplier(e.target.value)}
              />
              <Field
                label="Lote do fornecedor (opcional)"
                value={supplierBatch}
                maxLength={80}
                onChange={(e) => setSupplierBatch(e.target.value)}
              />
              {hasPermission(current.user.role, 'inventory.cost') && (
                <Field
                  label="Custo unitário da compra em R$ (opcional)"
                  inputMode="decimal"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  hint="Snapshot desta compra; não altera custo do catálogo nem registra pagamento."
                />
              )}
            </>
          )}
          {kind !== 'opening' && (
            <TextArea
              label="Referência / observações da entrada (opcional)"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </fieldset>
        <BatchFields fields={fields} disabled={command.busy || command.uncertain} />
        {kind === 'opening' && (
          <p>
            Contagem antiga pode incluir lote vencido; continuará físico e bloqueado até descarte
            explícito. Não houve importação de saldos reais.
          </p>
        )}
        {kind === 'adjust-new' && (
          <p>Nova entrada rastreável por diferença de contagem; nunca edita um saldo anterior.</p>
        )}
        <CommandFeedback command={command} />
        <CommandButtons command={command} onClose={onClose} />
      </form>
    </Modal>
  );
}
export function BatchMutation({
  kind,
  batch,
  product,
  onClose,
  onDone,
}: {
  kind: 'waste' | 'adjust';
  batch: StockBatch;
  product: InventoryProduct;
  onClose: () => void;
  onDone: () => void;
}) {
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [direction, setDirection] = useState('OUT');
  const [original, setOriginal] = useState('');
  const [notes, setNotes] = useState('');
  const command = useStockCommand(
    kind === 'waste' ? '/inventory/waste' : '/inventory/adjustments',
    onDone,
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    const base = {
      productId: product.id,
      batchId: batch.id,
      version: batch.version,
      quantity: Number(quantity),
      reason,
      notes,
    };
    const parsed =
      kind === 'waste'
        ? wasteInput.safeParse(base)
        : adjustmentInput.safeParse({
            ...base,
            direction,
            ...(original ? { correctsMovementId: original } : {}),
          });
    if (!parsed.success) {
      command.setError(parsed.error.issues[0]?.message ?? 'Revise a movimentação.');
      return;
    }
    void command.send(parsed.data);
  }
  return (
    <Modal
      title={kind === 'waste' ? 'Registrar perda de estoque pronto' : 'Ajustar lote'}
      onClose={() => command.close(onClose)}
    >
      <form className="auth-form" onSubmit={submit}>
        <h3>{product.name}</h3>
        <BatchSummary batch={batch} />
        <fieldset className="stock-fieldset" disabled={command.busy || command.uncertain}>
          <legend>Movimento compensatório / perda</legend>
          {kind === 'adjust' && (
            <Filter
              label="Direção do ajuste"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="OUT">Saída / ajuste negativo</option>
              <option value="IN">Entrada / ajuste positivo</option>
            </Filter>
          )}
          <Field
            label={
              kind === 'waste'
                ? 'Quantidade de perda (unidades)'
                : 'Quantidade do ajuste (unidades)'
            }
            type="number"
            min={1}
            max={100000}
            step={1}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Filter
            label="Motivo da movimentação"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">Escolha</option>
            {kind === 'waste' ? (
              <>
                <option value="EXPIRED">Vencido</option>
                <option value="DAMAGED">Danificado</option>
                <option value="PRODUCTION_FAILURE">Falha de produção já recebida</option>
                <option value="UNSOLD">Não vendido / descartado</option>
                <option value="OTHER">Outro, com explicação</option>
              </>
            ) : (
              <>
                <option value="COUNT_DIFFERENCE">Diferença de contagem física</option>
                <option value="RECORD_CORRECTION">Correção de registro anterior</option>
                <option value="PRODUCTION_CORRECTION">Correção de conclusão de produção</option>
                <option value="RECEIPT_CORRECTION">Correção de recebimento comprado</option>
              </>
            )}
          </Filter>
          {kind === 'adjust' && (
            <Field
              label="Referência do movimento original"
              required={reason !== '' && reason !== 'COUNT_DIFFERENCE'}
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              hint="Nas correções, copie o ID em Movimentações → Ver referência. O original é preservado."
            />
          )}
          <TextArea
            label="Explicação / observações"
            required={kind === 'waste' && reason === 'OTHER'}
            value={notes}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
          />
        </fieldset>
        <p>
          Revise quantidade, lote e motivo. Nenhuma reserva será liberada automaticamente.{' '}
          {kind === 'waste'
            ? 'Perda de rendimento antes da conclusão não deve ser lançada aqui.'
            : 'A validade e a identidade do lote permanecem no histórico.'}
        </p>
        <CommandFeedback command={command} />
        <CommandButtons command={command} onClose={onClose} />
        <Button
          variant="ghost"
          disabled={command.busy || command.uncertain}
          onClick={() => command.close(onClose)}
        >
          Fechar e recarregar saldo para revisão
        </Button>
      </form>
    </Modal>
  );
}
