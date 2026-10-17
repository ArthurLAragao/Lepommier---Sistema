import { useEffect, useState } from 'react';
import type { z } from 'zod';
import { authRequest } from '../auth/api.js';

export function useRegistryData<T>(url: string, schema: z.ZodType<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void authRequest(url, schema, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError('');
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(
            cause instanceof Error ? cause.message : 'Não foi possível carregar os cadastros.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setBusy(false);
          setLoadedUrl(url);
        }
      });
    return () => controller.abort();
  }, [url, schema, revision]);
  function refresh() {
    setBusy(true);
    setData(null);
    setRevision((v) => v + 1);
  }
  return {
    data: loadedUrl === url ? data : null,
    error: loadedUrl === url ? error : '',
    busy: busy || loadedUrl !== url,
    refresh,
  };
}
export function downloadCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const errorMessage = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : 'Não foi possível concluir. Confira a conexão e tente novamente.';
export const marketingLabels = {
  UNKNOWN: 'Não informado',
  OPTED_IN: 'Aceita contato promocional',
  OPTED_OUT: 'Não aceita contato promocional',
} as const;
export const preferenceSources: Record<string, string> = {
  IN_PERSON: 'Manifestação presencial',
  CUSTOMER_REQUEST: 'Solicitação do cliente',
  RECORD_REVIEW: 'Revisão de registro',
  ANONYMIZATION: 'Anonimização',
};
export const preferenceReasons: Record<string, string> = {
  CUSTOMER_REQUEST: 'Solicitação do cliente',
  CORRECTION: 'Correção confirmada',
  NO_EVIDENCE: 'Sem evidência de aceite',
  RETENTION_REVIEW: 'Revisão de retenção',
  DATA_MINIMIZATION: 'Redução de dados pessoais',
};
