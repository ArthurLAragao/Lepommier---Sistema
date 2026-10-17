import { useRef, useState } from 'react';
import {
  operationResultSchema,
  operationLookupSchema,
  batchInput,
  type OperationResult,
} from '@pommier/shared';
import { authRequest, AuthError } from '../auth/api.js';
export const formatUnits = (value: string) => new Intl.NumberFormat('pt-BR').format(BigInt(value));
export function useStockCommand(
  route: string,
  onDone: (result: OperationResult) => void,
  lookupBase = '/inventory/operations',
) {
  const pending = useRef<{ key: string; payload: unknown } | null>(null);
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [key, setKey] = useState('');
  async function send(payload: unknown) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError('');
    if (!pending.current) pending.current = { key: crypto.randomUUID(), payload };
    setKey(pending.current.key);
    try {
      const result = await authRequest(route, operationResultSchema, {
        method: 'POST',
        body: pending.current,
      });
      pending.current = null;
      setUncertain(false);
      onDone(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar a operação.');
      if (
        cause instanceof AuthError &&
        [400, 403, 404, 409].includes(cause.status) &&
        cause.code !== 'IDEMPOTENCY_MISMATCH'
      ) {
        pending.current = null;
        setUncertain(false);
      } else setUncertain(true);
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  async function resolve() {
    if (!pending.current || active.current) return;
    active.current = true;
    setBusy(true);
    try {
      const response = await authRequest(
        `${lookupBase}/${pending.current.key}`,
        operationLookupSchema,
      );
      if (response.result) {
        pending.current = null;
        setUncertain(false);
        onDone(response.result);
      } else
        setError(
          'Resultado ainda não confirmado. Repita a mesma solicitação; não envie uma nova operação.',
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o resultado.');
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  function close(onClose: () => void) {
    if (active.current || uncertain) {
      setError(
        'Aguarde ou resolva o resultado desta solicitação antes de fechar. Não crie outra para tentar repetir.',
      );
      return;
    }
    onClose();
  }
  return {
    busy,
    uncertain,
    error,
    setError,
    key,
    send,
    resolve,
    retry: () => send(pending.current?.payload),
    close,
  };
}
export type StockCommand = ReturnType<typeof useStockCommand>;
export function useBatchFields() {
  const [reference, setReference] = useState('');
  const [expiresAt, setExpiry] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [unknownReason, setUnknownReason] = useState('');
  const [notes, setNotes] = useState('');
  return {
    reference,
    setReference,
    expiresAt,
    setExpiry,
    unknown,
    setUnknown,
    unknownReason,
    setUnknownReason,
    notes,
    setNotes,
    value: () =>
      batchInput.parse({
        reference,
        expiresAt: unknown ? null : expiresAt,
        expiryUnknownReason: unknown ? unknownReason : null,
        notes,
      }),
  };
}
export const stockReasonLabels: Record<string, string> = {
  INITIAL_COUNT: 'Contagem inicial',
  LEGACY_REFERENCE: 'Conferência anterior',
  FINISHED_PRODUCT_RECEIPT: 'Recebimento de produto pronto',
  PRODUCTION_COMPLETED: 'Conclusão de produção',
  EXPIRED: 'Vencido',
  DAMAGED: 'Danificado',
  PRODUCTION_FAILURE: 'Falha de produção já recebida',
  UNSOLD: 'Não vendido / descartado',
  OTHER: 'Outro motivo explicado',
  COUNT_DIFFERENCE: 'Diferença de contagem',
  RECORD_CORRECTION: 'Correção de registro',
  PRODUCTION_CORRECTION: 'Correção de produção concluída',
  RECEIPT_CORRECTION: 'Correção de recebimento',
  INTERNAL_ALLOCATION_CONSUMED: 'Consumo pelo serviço de origem',
};
