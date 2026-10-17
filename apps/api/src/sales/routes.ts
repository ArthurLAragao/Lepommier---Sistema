import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  commandSchema,
  draftInput,
  draftEdit,
  checkoutInput,
  cashOpenInput,
  confirmInput,
  progressInput,
  orderPaymentInput,
  versionInput,
  cancelInput,
  refundInput,
  orderQuery,
  stockQuery,
  pageQuery,
  type Permission,
} from '@pommier/shared';
import type { AuthService } from '../auth/service.js';
import { requireAccess } from '../auth/routes.js';
import { SalesService } from './service.js';
export async function registerSalesRoutes(
  app: FastifyInstance,
  auth: AuthService | undefined,
  clock: () => Date,
) {
  const service = auth ? new SalesService(auth, clock) : undefined;
  const access = async (r: FastifyRequest, p: Permission) =>
    (await requireAccess(auth, r, p)).principal;
  const id = (r: FastifyRequest) => z.object({ id: z.uuid() }).parse(r.params).id;
  app.get('/sales/catalog', async (r) =>
    service!.catalog(await access(r, 'orders.read'), stockQuery.parse(r.query)),
  );
  app.get('/sales/products/:id', async (r) =>
    service!.product(await access(r, 'orders.read'), id(r)),
  );
  app.get('/sales/operations/:id', async (r) =>
    service!.inventory.lookup(await access(r, 'orders.operations'), id(r), 'orders.operations'),
  );
  app.get('/cash-sessions/current', async (r) => service!.cash(await access(r, 'orders.read')));
  app.post('/cash-sessions', async (r) => {
    const p = await access(r, 'cash.open');
    const c = commandSchema(cashOpenInput).parse(r.body);
    return service!.openCash(p, c.key, c.payload, r.id);
  });
  app.get('/orders', async (r) =>
    service!.list(await access(r, 'orders.read'), orderQuery.parse(r.query)),
  );
  app.get('/orders/:id', async (r) => service!.detail(await access(r, 'orders.read'), id(r)));
  app.get('/customers/:id/order-history', async (r) =>
    service!.customerHistory(await access(r, 'orders.read'), id(r), pageQuery.parse(r.query).page),
  );
  app.post('/orders', async (r) => {
    const p = await access(r, 'orders.write');
    const c = commandSchema(draftInput).parse(r.body);
    return service!.create(p, c.key, c.payload, r.id);
  });
  app.post('/sales/checkout', async (r) => {
    const p = await access(r, 'orders.checkout');
    const c = commandSchema(checkoutInput).parse(r.body);
    return service!.checkout(p, c.key, c.payload, r.id);
  });
  app.post('/orders/:id/edit', async (r) => {
    const p = await access(r, 'orders.write');
    const c = commandSchema(draftEdit).parse(r.body);
    return service!.edit(p, c.key, id(r), c.payload, r.id);
  });
  app.post('/orders/:id/confirm', async (r) => {
    const p = await access(r, 'orders.write');
    const c = commandSchema(confirmInput).parse(r.body);
    return service!.confirm(p, c.key, id(r), c.payload, r.id);
  });
  app.post('/orders/:id/progress', async (r) => {
    const p = await access(r, 'orders.write');
    const c = commandSchema(progressInput).parse(r.body);
    return service!.progress(p, c.key, id(r), c.payload, r.id);
  });
  app.post('/orders/:id/payment', async (r) => {
    const p = await access(r, 'orders.pay');
    const c = commandSchema(orderPaymentInput).parse(r.body);
    return service!.pay(p, c.key, id(r), c.payload, r.id);
  });
  app.post('/orders/:id/handover', async (r) => {
    const p = await access(r, 'orders.handover');
    const c = commandSchema(versionInput).parse(r.body);
    return service!.handover(p, c.key, id(r), c.payload, r.id);
  });
  app.post('/orders/:id/cancel', async (r) => {
    const p = await access(r, 'orders.cancel');
    const c = commandSchema(cancelInput).parse(r.body);
    return service!.cancel(p, c.key, id(r), c.payload, r.id);
  });
  app.post('/orders/:id/refund', async (r) => {
    const p = await access(r, 'orders.refund');
    const c = commandSchema(refundInput).parse(r.body);
    return service!.refund(p, c.key, id(r), c.payload, r.id);
  });
}
