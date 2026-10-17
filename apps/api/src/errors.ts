import { ZodError } from 'zod';
import type { FastifyError, FastifyInstance } from 'fastify';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function installErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | ZodError | AppError, request, reply) => {
    const requestId = request.id;
    if (error instanceof ZodError) {
      const fields: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const key = issue.path.map(String).join('.') || 'form';
        (fields[key] ??= []).push('Confira o valor informado.');
      }
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Confira os campos informados e tente novamente.',
          requestId,
          fields,
        },
      });
    }
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message, requestId } });
    }
    if ('statusCode' in error && error.statusCode === 413) {
      return reply.status(413).send({
        error: {
          code: 'REQUEST_TOO_LARGE',
          message: 'Os dados enviados ultrapassam o tamanho permitido.',
          requestId,
        },
      });
    }
    if ('statusCode' in error && error.statusCode === 400) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Não foi possível ler os dados enviados. Confira e tente novamente.',
          requestId,
        },
      });
    }
    // Do not log raw errors: connection errors can contain credentials or personal data.
    request.log.error(
      { event: 'request_failed', errorType: error.name, requestId },
      'Falha ao processar solicitação',
    );
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Não foi possível concluir. Tente novamente ou procure o responsável pela loja.',
        requestId,
      },
    });
  });
}
