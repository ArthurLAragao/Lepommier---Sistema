import { z } from 'zod';
import { apiErrorSchema, CSRF_HEADER_VALUE } from '@pommier/shared';

// In-memory request ordering only; never an authentication credential.
let authRevision = 0;
export const currentAuthRevision = () => authRevision;
export const invalidateAuthRevision = () => ++authRevision;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function authRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: { method?: string; body?: unknown; signal?: AbortSignal; silent?: boolean } = {},
): Promise<T> {
  const revision = currentAuthRevision();
  let response: Response;
  try {
    const deadline = AbortSignal.timeout(15000);
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
      ...(options.body !== undefined
        ? {
            body: JSON.stringify(options.body),
            headers: { 'content-type': 'application/json', 'x-pommier-csrf': CSRF_HEADER_VALUE },
          }
        : {}),
    });
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new AuthError(
      'Não foi possível confirmar a resposta do sistema. Confira a conexão local antes de tentar novamente.',
      'CONNECTION_FAILED',
      0,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AuthError(
      'O sistema retornou uma resposta inesperada. Atualize a página.',
      'INVALID_RESPONSE',
      response.status,
    );
  }
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    const code = parsed.success ? parsed.data.error.code : 'INVALID_RESPONSE';
    if (code === 'SESSION_EXPIRED' && !options.silent && revision === currentAuthRevision())
      window.dispatchEvent(new Event('pommier-session-expired'));
    throw new AuthError(
      parsed.success
        ? `${parsed.data.error.message} Identificador: ${parsed.data.error.requestId}.`
        : 'Não foi possível concluir a solicitação.',
      code,
      response.status,
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new AuthError(
      'A interface e o sistema local não correspondem. Atualize a página ou procure o responsável.',
      'VERSION_MISMATCH',
      response.status,
    );
  return parsed.data;
}
export const successSchema = z.object({}).passthrough();
