import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { CSRF_HEADER_VALUE } from '@pommier/shared';
import { AppError } from '../errors.js';

export const tokenDigest = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
export const secretMatches = (supplied: string, expected: string): boolean =>
  timingSafeEqual(
    Buffer.from(tokenDigest(supplied), 'hex'),
    Buffer.from(tokenDigest(expected), 'hex'),
  );
export function isLoopback(address: string): boolean {
  return (
    address === '127.0.0.1' || address === '::1' || address.toLowerCase() === '::ffff:127.0.0.1'
  );
}
export function protectRequest(request: FastifyRequest, origin: string, apiHost: string) {
  if (![new URL(origin).host, apiHost].includes(request.headers.host ?? '')) {
    throw new AppError(403, 'HOST_REJECTED', 'Abra o sistema pelo endereço local configurado.');
  }
  if (['GET', 'HEAD'].includes(request.method)) return;
  if (request.headers.origin !== origin || request.headers['sec-fetch-site'] === 'cross-site') {
    throw new AppError(
      403,
      'ORIGIN_REJECTED',
      'A origem da solicitação não foi autorizada. Abra novamente o endereço da loja.',
    );
  }
  if (
    request.headers['x-pommier-csrf'] !== CSRF_HEADER_VALUE ||
    request.headers['content-type']?.split(';')[0]?.trim() !== 'application/json'
  ) {
    throw new AppError(
      403,
      'CSRF_REJECTED',
      'A proteção da solicitação não foi confirmada. Atualize a página e tente novamente.',
    );
  }
}

/** Explicit allowlist; never spread request bodies into an audit event. */
export function safeAuditMetadata(
  input: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  for (const key of [
    'reason',
    'previousRole',
    'role',
    'active',
    'version',
    'permission',
    'method',
  ]) {
    const value = input[key];
    if (typeof value === 'string') safe[key] = value.slice(0, 200);
    else if (
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isSafeInteger(value))
    )
      safe[key] = value;
  }
  return safe;
}
