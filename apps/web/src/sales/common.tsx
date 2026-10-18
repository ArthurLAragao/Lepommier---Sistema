import { useState, type FormEvent } from 'react';
import {
  customerListSchema,
  cashCurrentSchema,
  cashOpenInput,
  formatOrderMoney,
  formatDateTime,
  hasPermission,
  parseMoney,
  methodLabels,
  type CurrentUser,
} from '@pommier/shared';
import { Button, Field, Filter, Search, Pagination } from '../components/ui.js';
import { Modal } from '../auth/AccountSettings.js';
import { DataStatus } from '../registry/ui.js';
import { useRegistryData, errorMessage } from '../registry/data.js';
import { useStockCommand } from '../inventory/data.js';
import { CommandFeedback, CommandButtons } from '../inventory/common.js';
import type { usePaymentFields } from './data.js';
export type CustomerChoiceValue = { id: string; name: string; active?: boolean };
export function CustomerChoice({
  value,
  onChange,
  required = false,
}: {
  value: CustomerChoiceValue | null;
  onChange: (value: CustomerChoiceValue | null) => void;
  required?: boolean;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const result = useRegistryData(
    `/customers?${new URLSearchParams({ q, page: String(page) })}`,
    customerListSchema,
  );
  const items = result.data?.items ?? [];
  return (
    <fieldset className="category-picker">
      <legend>
        {required ? 'Cliente identificado (obrigatório)' : 'Cliente (opcional no balcão)'}
      </legend>
      <Search
        label="Buscar cliente para o pedido"
        placeholder="Nome, matrícula ou telefone"
        value={q}
        maxLength={120}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <Filter
        label="Cliente do pedido"
        required={required}
        value={value?.id ?? ''}
        onChange={(e) =>
          onChange(
            items.find((i) => i.id === e.target.value) ??
              (value?.id === e.target.value ? value : null),
          )
        }
      >
        <option value="">
          {required ? 'Selecione um cliente ativo' : 'Venda anônima de balcão'}
        </option>
        {value && !items.some((i) => i.id === value.id) && (
          <option value={value.id}>
            {value.name}
            {value.active === false ? ' (inativo)' : ''}
          </option>
        )}
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.registration} · {i.name}
          </option>
        ))}
      </Filter>
      <DataStatus {...result} retry={result.refresh} />
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil((result.data?.total ?? 0) / 20))}
        onChange={setPage}
      />
    </fieldset>
  );
}
export function PaymentFields({
  fields,
  total,
}: {
  fields: ReturnType<typeof usePaymentFields>;
  total: string;
}) {
  let change: string | null = null;
  try {
    const tender = BigInt(parseMoney(fields.tender));
    if (tender >= BigInt(total)) change = String(tender - BigInt(total));
  } catch {
    /* Incomplete human input is validated before submit. */
  }
  return (
    <fieldset className="stock-fieldset">
      <legend>Registro de pagamento integral</legend>
      <p>
        Total a receber: <strong>{formatOrderMoney(total)}</strong>
      </p>
      <Filter
        label="Forma de pagamento"
        value={fields.method}
        onChange={(e) => {
          fields.setMethod(e.target.value as typeof fields.method);
          fields.setConfirmed(false);
        }}
      >
        {Object.entries(methodLabels).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Filter>
      {fields.method === 'CASH' ? (
        <>
          <Field
            label="Dinheiro recebido em R$"
            inputMode="decimal"
            required
            value={fields.tender}
            onChange={(e) => fields.setTender(e.target.value)}
          />
          <p>
            Troco: {change === null ? 'Informe valor suficiente' : formatOrderMoney(change)}. O
            recebimento registrado será o total da venda.
          </p>
        </>
      ) : (
        <p className="info-note">
          Confirmação manual do funcionário. O sistema não cobra cartão nem verifica Pix com banco.
          Não informe número de cartão ou CVV.
        </p>
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          required
          checked={fields.confirmed}
          onChange={(e) => fields.setConfirmed(e.target.checked)}
        />
        Confirmo que o valor integral foi recebido e conferido fora do sistema.
      </label>
    </fieldset>
  );
}
export function CashNotice({ current }: { current: CurrentUser }) {
  const result = useRegistryData('/cash-sessions/current', cashCurrentSchema);
  const [open, setOpen] = useState(false);
  return (
    <>
      <DataStatus {...result} retry={result.refresh} />
      {result.data && (
        <section className="info-note cash-foundation">
          <div>
            <strong>
              {result.data.session ? 'Sessão de caixa aberta' : 'Nenhuma sessão de caixa aberta'}
            </strong>
            <p>
              {result.data.session
                ? `Aberta em ${formatDateTime(result.data.session.openedAt)} por ${result.data.session.openedBy.displayName}.`
                : 'Pagamento e reembolso exigem abertura explícita por proprietário ou gerente.'}
            </p>
            <p>
              Confira movimentos, contagem, diferenças e fechamento no módulo Caixa. Pix e cartões
              não aumentam o dinheiro físico da gaveta.
            </p>
          </div>
          {!result.data.session && hasPermission(current.user.role, 'cash.open') && (
            <Button onClick={() => setOpen(true)}>Abrir sessão de caixa</Button>
          )}
        </section>
      )}
      {open && (
        <CashOpening
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            result.refresh();
          }}
        />
      )}
    </>
  );
}
export function CashOpening({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [float, setFloat] = useState('');
  const command = useStockCommand('/cash-sessions', onDone, '/sales/operations');
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      void command.send(cashOpenInput.parse({ openingFloatCents: String(parseMoney(float)) }));
    } catch (error) {
      command.setError(errorMessage(error));
    }
  }
  return (
    <Modal title="Abrir caixa" onClose={() => command.close(onClose)}>
      <form className="auth-form" onSubmit={submit}>
        <p>
          Informe o fundo físico contado agora. A abertura é explícita e há apenas uma sessão ativa
          compartilhada na loja. A sessão continua aberta ao virar o dia, até o fechamento com
          contagem.
        </p>
        <Field
          label="Fundo inicial contado em R$"
          inputMode="decimal"
          required
          value={float}
          disabled={command.busy || command.uncertain}
          onChange={(e) => setFloat(e.target.value)}
        />
        <CommandFeedback command={command} />
        <CommandButtons command={command} onClose={onClose} label="Confirmar abertura" />
      </form>
    </Modal>
  );
}
export function ManualPaymentNotice() {
  return (
    <p className="auth-help">
      Se já recebeu um valor e a gravação falhou, não peça um segundo pagamento. Resolva a
      solicitação original e confira o histórico; em falha confirmada, peça revisão ao responsável
      para registrar corretamente ou tratar a devolução externa. O sistema não executa
      cobranças/reembolsos.
    </p>
  );
}
