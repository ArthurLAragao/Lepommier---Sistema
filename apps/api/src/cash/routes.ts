import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  cashHistoryQuery,
  cashDetailQuery,
  cashMovementInput,
  cashCloseInput,
  cashReviewInput,
  cashReverseInput,
  commandSchema,
  type Permission,
} from '@pommier/shared';
import type { AuthService } from '../auth/service.js';
import { requireAccess } from '../auth/routes.js';
import { CashService } from './service.js';
export async function registerCashRoutes(
  app: FastifyInstance,
  auth: AuthService | undefined,
  clock: () => Date,
) {
  const service = auth ? new CashService(auth, clock) : undefined;
  const access = async (r: FastifyRequest, p: Permission) =>
    (await requireAccess(auth, r, p)).principal;
  const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;
  app.get('/cash/current', async (r) => service!.current(await access(r, 'cash.current')));
  app.get('/cash/sessions', async (r) =>
    service!.history(await access(r, 'cash.read'), cashHistoryQuery.parse(r.query)),
  );
  app.get('/cash/sessions/:id', async (r) =>
    service!.detail(await access(r, 'cash.read'), id(r), cashDetailQuery.parse(r.query)),
  );
  app.get('/cash/sessions/:id/reconciliation', async (r) =>
    service!.reconcile(await access(r, 'cash.read'), id(r), r.id),
  );
  app.get('/cash/operations/:id', async (r) =>
    service!.operations.lookup(await access(r, 'cash.operations'), id(r), 'cash.operations'),
  );
  app.post('/cash/movements', async (r) => {
    const p = await access(r, 'cash.movements');
    const c = commandSchema(cashMovementInput).parse(r.body);
    return service!.movement(p, c.key, c.payload, r.id);
  });
  app.post('/cash/close', async (r) => {
    const p = await access(r, 'cash.close');
    const c = commandSchema(cashCloseInput).parse(r.body);
    return service!.close(p, c.key, c.payload, r.id);
  });
  app.post('/cash/review', async (r) => {
    const p = await access(r, 'cash.review');
    const c = commandSchema(cashReviewInput).parse(r.body);
    return service!.review(p, c.key, c.payload, r.id);
  });
  app.post('/cash/reverse', async (r) => {
    const p = await access(r, 'cash.correct');
    const c = commandSchema(cashReverseInput).parse(r.body);
    return service!.reverse(p, c.key, c.payload, r.id);
  });
}
