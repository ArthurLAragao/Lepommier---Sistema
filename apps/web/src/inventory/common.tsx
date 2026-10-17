import { useState } from 'react';
import { stockListSchema, type StockBatch, type stockItemSchema } from '@pommier/shared';
import type { z } from 'zod';
import { Button, Field, Filter, Search, Pagination } from '../components/ui.js';
import { DataStatus, TextArea } from '../registry/ui.js';
import { useRegistryData } from '../registry/data.js';
import type { StockCommand, useBatchFields } from './data.js';
export type InventoryProduct = z.infer<typeof stockItemSchema>['product'];
export function ProductPicker({
  value,
  onChange,
  intent = 'any',
  label = 'Produto',
  required = true,
  disabled = false,
}: {
  value: InventoryProduct | null;
  onChange: (product: InventoryProduct | null) => void;
  intent?: 'any' | 'produce' | 'receive';
  label?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const result = useRegistryData(
    `/inventory?${new URLSearchParams({ q, page: String(page) })}`,
    stockListSchema,
  );
  const rows = result.data?.items.map((i) => i.product) ?? [];
  const eligible = (p: InventoryProduct) =>
    intent === 'any' || (intent === 'produce' ? p.origin !== 'PURCHASED' : p.origin !== 'PRODUCED');
  return (
    <fieldset className="category-picker">
      <legend>{label}</legend>
      <Search
        label={`Buscar ${label.toLowerCase()}`}
        value={q}
        disabled={disabled}
        maxLength={120}
        placeholder="Nome ou código"
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <Filter
        label={`${label}${required ? ' (obrigatório)' : ''}`}
        value={value?.id ?? ''}
        disabled={disabled}
        required={required}
        onChange={(e) =>
          onChange(
            rows.find((p) => p.id === e.target.value) ??
              (value?.id === e.target.value ? value : null),
          )
        }
      >
        <option value="">{required ? 'Selecione um produto' : 'Todos os produtos'}</option>
        {value && !rows.some((p) => p.id === value.id) && (
          <option value={value.id}>
            {value.code} · {value.name}
            {!value.active ? ' (inativo)' : ''}
          </option>
        )}
        {rows.map((p) => (
          <option key={p.id} value={p.id} disabled={!eligible(p)}>
            {p.code} · {p.name}
            {!eligible(p) ? ' (origem não permitida)' : ''}
          </option>
        ))}
      </Filter>
      <DataStatus {...result} retry={result.refresh} />
      {result.data && result.data.total > 20 && (
        <Pagination page={page} pageCount={Math.ceil(result.data.total / 20)} onChange={setPage} />
      )}
    </fieldset>
  );
}
export function BatchFields({
  fields,
  disabled,
}: {
  fields: ReturnType<typeof useBatchFields>;
  disabled: boolean;
}) {
  return (
    <fieldset className="stock-fieldset" disabled={disabled}>
      <legend>Identificação e validade do lote</legend>
      <Field
        label="Referência do lote"
        value={fields.reference}
        maxLength={80}
        required
        autoComplete="off"
        onChange={(e) => fields.setReference(e.target.value)}
        hint="Única para este produto; a matrícula LOT é gerada pelo sistema."
      />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={fields.unknown}
          onChange={(e) => fields.setUnknown(e.target.checked)}
        />
        Sem validade informada
      </label>
      {fields.unknown ? (
        <>
          <Filter
            label="Motivo da validade desconhecida"
            required
            value={fields.unknownReason}
            onChange={(e) => fields.setUnknownReason(e.target.value)}
          >
            <option value="">Selecione</option>
            <option value="NOT_PROVIDED">Não fornecida / ainda não definida</option>
            <option value="LEGACY_COUNT">Contagem de lote anterior</option>
          </Filter>
          <p className="info-note">
            Validade desconhecida não garante segurança. Unidades sem data ficam depois das datadas
            na alocação; confirme a política da loja.
          </p>
        </>
      ) : (
        <Field
          label="Data de validade"
          type="date"
          value={fields.expiresAt}
          required
          onChange={(e) => fields.setExpiry(e.target.value)}
          hint="Válido até o fim desta data em Fortaleza. Não é calculado a partir do texto do catálogo."
        />
      )}
      <TextArea
        label="Observações do lote (opcional)"
        value={fields.notes}
        maxLength={500}
        onChange={(e) => fields.setNotes(e.target.value)}
      />
    </fieldset>
  );
}
export function CommandFeedback({ command }: { command: StockCommand }) {
  return (
    <>
      {command.error && (
        <p className="form-error" role="alert">
          {command.error}
        </p>
      )}
      {command.uncertain && (
        <section className="duplicate-review" aria-label="Resultado da solicitação">
          <h3>Resultado ainda não confirmado</h3>
          <p>
            Os dados estão preservados nesta tela. Consulte ou repita a mesma solicitação para
            evitar duplicidade.
          </p>
          <p className="plain-text">Referência: {command.key}</p>
          <div className="form-actions">
            <Button
              variant="secondary"
              busy={command.busy}
              onClick={() => {
                void command.resolve();
              }}
            >
              Verificar resultado
            </Button>
            <Button
              busy={command.busy}
              onClick={() => {
                void command.retry();
              }}
            >
              Repetir mesma solicitação
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
export function CommandButtons({
  command,
  onClose,
  label = 'Confirmar movimentação',
  disabled = false,
}: {
  command: StockCommand;
  onClose: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="form-actions">
      <Button
        variant="secondary"
        disabled={command.busy || command.uncertain}
        onClick={() => command.close(onClose)}
      >
        Cancelar
      </Button>
      <Button type="submit" busy={command.busy} disabled={command.uncertain || disabled}>
        {label}
      </Button>
    </div>
  );
}
export function BatchSummary({ batch }: { batch: StockBatch }) {
  return (
    <p className="info-note">
      Lote LOT-{String(batch.number).padStart(6, '0')} · {batch.reference}. Físico: {batch.physical}{' '}
      un. · Reservado: {batch.reserved} un. · versão {batch.version}. Reservas não podem ser
      retiradas por perda ou ajuste.
    </p>
  );
}
