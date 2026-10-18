import { useState, type FormEvent } from 'react';
import {
  cashMovementInput,
  cashCloseInput,
  cashReviewInput,
  cashReverseInput,
  cashMovementLabels,
  closingDifference,
  parseCashCounted,
  parseMoney,
  formatOrderMoney,
  type cashDetailDto,
  type cashMovementDto,
} from '@pommier/shared';
import type { z } from 'zod';
import { Modal } from '../auth/AccountSettings.js';
import { Field, Filter } from '../components/ui.js';
import { TextArea } from '../registry/ui.js';
import { errorMessage } from '../registry/data.js';
import { useStockCommand } from '../inventory/data.js';
import { CommandFeedback, CommandButtons } from '../inventory/common.js';
type Detail = z.infer<typeof cashDetailDto>;
export type CashAction = 'CASH_ADDITION' | 'CASH_WITHDRAWAL' | 'CASH_EXPENSE' | 'close' | 'review';
export function CashActionForm({
  action,
  detail,
  onClose,
  onDone,
}: {
  action: CashAction;
  detail: Detail;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('SUPPLIES');
  const [reference, setReference] = useState('');
  const [decision, setDecision] = useState('NEEDS_ATTENTION');
  const [confirmed, setConfirmed] = useState(false);
  const route =
    action === 'close' ? '/cash/close' : action === 'review' ? '/cash/review' : '/cash/movements';
  const command = useStockCommand(route, onDone, '/cash/operations');
  const blocked = command.busy || command.uncertain;
  let difference: string | null = null;
  if (action === 'close' && amount)
    try {
      difference = closingDifference(parseCashCounted(amount), detail.totals.expectedCents);
    } catch {
      /* Form validation supplies the actionable error on submit. */
    }
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const payload =
        action === 'close'
          ? cashCloseInput.parse({
              sessionId: detail.session.id,
              activityVersion: detail.session.activityVersion,
              countedCents: parseCashCounted(amount),
              explanation: reason.trim() || null,
              confirmed,
            })
          : action === 'review'
            ? cashReviewInput.parse({
                sessionId: detail.session.id,
                reviewVersion: detail.session.reviewVersion,
                decision,
                note: reason,
              })
            : cashMovementInput.parse({
                sessionId: detail.session.id,
                kind: action,
                amountCents: String(parseMoney(amount)),
                reason,
                category: action === 'CASH_EXPENSE' ? category : null,
                reference: reference || null,
              });
      void command.send(payload);
    } catch (error) {
      command.setError(errorMessage(error));
    }
  }
  const title =
    action === 'close'
      ? 'Fechar caixa'
      : action === 'review'
        ? 'Revisar fechamento'
        : `Registrar ${action === 'CASH_ADDITION' ? 'suprimento' : action === 'CASH_WITHDRAWAL' ? 'sangria' : 'despesa'}`;
  return (
    <Modal title={title} onClose={() => command.close(onClose)}>
      <form className="auth-form cash-form" onSubmit={submit}>
        <p>Sessão {detail.session.id}. Os valores são conferidos novamente pelo servidor.</p>
        {action === 'close' && (
          <>
            <p>
              O fechamento preserva os valores e não poderá ser reaberto. Contar dinheiro não
              encerra seu login. Se houver nova atividade, recarregue e revise antes de confirmar.
            </p>
            <dl className="cash-count-summary">
              <div>
                <dt>Dinheiro físico esperado</dt>
                <dd>{formatOrderMoney(detail.totals.expectedCents)}</dd>
              </div>
              <div>
                <dt>Diferença: contado menos esperado</dt>
                <dd>
                  <span role="status">
                    {difference === null ? 'Informe o valor contado' : formatOrderMoney(difference)}
                  </span>
                </dd>
              </div>
            </dl>
          </>
        )}
        {action === 'review' ? (
          <>
            <p>
              A revisão acrescenta uma anotação. Não altera contagem, pagamentos, devoluções ou o
              fechamento original e não é conciliação bancária.
            </p>
            <Filter
              label="Decisão da revisão"
              value={decision}
              disabled={blocked}
              onChange={(e) => setDecision(e.target.value)}
            >
              <option value="NEEDS_ATTENTION">Requer atenção</option>
              <option value="APPROVED">Aprovado</option>
            </Filter>
          </>
        ) : (
          <Field
            label={action === 'close' ? 'Valor contado em R$' : 'Valor da movimentação em R$'}
            inputMode="decimal"
            required
            value={amount}
            disabled={blocked}
            onChange={(e) => setAmount(e.target.value)}
          />
        )}
        {action === 'CASH_EXPENSE' && (
          <Filter
            label="Categoria da despesa"
            value={category}
            disabled={blocked}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="SUPPLIES">Materiais de uso</option>
            <option value="MAINTENANCE">Manutenção</option>
            <option value="TRANSPORT">Transporte</option>
            <option value="OTHER">Outra</option>
          </Filter>
        )}
        <TextArea
          label={
            action === 'close'
              ? 'Justificativa da diferença'
              : action === 'review'
                ? 'Nota da revisão'
                : 'Motivo da movimentação'
          }
          required={action !== 'close' || (difference !== null && BigInt(difference) !== 0n)}
          minLength={5}
          maxLength={action === 'close' || action === 'review' ? 500 : 240}
          value={reason}
          disabled={blocked}
          onChange={(e) => setReason(e.target.value)}
        />
        {action !== 'close' && action !== 'review' && (
          <>
            <p>
              Registre somente dinheiro realmente colocado ou retirado da gaveta. Evite nomes de
              destinatários e dados pessoais. Despesa não cria compra, estoque ou conta a pagar.
            </p>
            <Field
              label="Referência interna sem dados pessoais (opcional)"
              maxLength={64}
              value={reference}
              disabled={blocked}
              onChange={(e) => setReference(e.target.value)}
            />
          </>
        )}
        {action === 'close' && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              required
              checked={confirmed}
              disabled={blocked}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Confirmo a contagem e o fechamento definitivo desta sessão.
          </label>
        )}
        <CommandFeedback command={command} />
        <CommandButtons
          command={command}
          onClose={onClose}
          label={
            action === 'close'
              ? 'Confirmar fechamento'
              : action === 'review'
                ? 'Registrar revisão'
                : 'Confirmar movimentação'
          }
        />
      </form>
    </Modal>
  );
}
export function CashReversalForm({
  movement,
  currentId,
  onClose,
  onDone,
}: {
  movement: z.infer<typeof cashMovementDto>;
  currentId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const command = useStockCommand('/cash/reverse', onDone, '/cash/operations');
  const blocked = command.busy || command.uncertain;
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      void command.send(
        cashReverseInput.parse({
          sessionId: currentId,
          movementId: movement.id,
          reason,
          physicalMovementConfirmed: confirmed,
        }),
      );
    } catch (error) {
      command.setError(errorMessage(error));
    }
  }
  return (
    <Modal title="Estornar movimentação de caixa" onClose={() => command.close(onClose)}>
      <form className="auth-form cash-form" onSubmit={submit}>
        <p>
          {cashMovementLabels[movement.kind]} de {formatOrderMoney(movement.amountCents)}. O
          original permanece na sessão {movement.sessionId}. A movimentação inversa integral será
          registrada na sessão atual {currentId}.
        </p>
        <p>
          Use somente quando houver o movimento físico inverso correspondente. Não use para corrigir
          pagamento/Pix/cartão, inventar saldo ou mudar uma contagem fechada. Anotações sem efeito
          financeiro pertencem à revisão.
        </p>
        <TextArea
          label="Motivo do estorno de movimentação"
          minLength={5}
          maxLength={240}
          required
          disabled={blocked}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <label className="checkbox-label">
          <input
            type="checkbox"
            required
            checked={confirmed}
            disabled={blocked}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Confirmo a movimentação física inversa integral no caixa atual.
        </label>
        <CommandFeedback command={command} />
        <CommandButtons
          command={command}
          onClose={onClose}
          label="Confirmar estorno de movimentação"
        />
      </form>
    </Modal>
  );
}
