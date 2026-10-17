import { apiErrorSchema, systemStatusSchema, type SystemStatus } from '@pommier/shared';

export class RequestError extends Error {
  constructor(
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

export async function getSystemStatus(signal?: AbortSignal): Promise<SystemStatus> {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(8000);
    response = await fetch('/api/system/status', {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RequestError(
      'Não foi possível conectar ao sistema local. Confira se o aplicativo está aberto e tente novamente.',
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RequestError('O sistema local retornou uma resposta inesperada. Tente novamente.');
  }
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    throw new RequestError(
      parsed.success
        ? parsed.data.error.message
        : 'Não foi possível verificar a instalação. Tente novamente.',
      parsed.success ? parsed.data.error.requestId : undefined,
    );
  }
  const parsed = systemStatusSchema.safeParse(payload);
  if (!parsed.success)
    throw new RequestError(
      'A versão da interface não corresponde ao sistema local. Atualize a página ou procure o responsável.',
    );
  return parsed.data;
}
