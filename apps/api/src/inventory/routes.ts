import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  commandSchema,
  openingInput,
  receiptInput,
  planInput,
  productionTransition,
  completeInput,
  wasteInput,
  adjustmentInput,
  stockQuery,
  productionQuery,
  pageQuery,
  type Permission,
} from '@pommier/shared';
import type { AuthService } from '../auth/service.js';
import { requireAccess } from '../auth/routes.js';
import { InventoryService } from './service.js';
export async function registerInventoryRoutes(
  app: FastifyInstance,
  auth: AuthService | undefined,
  clock: () => Date,
) {
  const inventory = auth ? new InventoryService(auth, clock) : undefined;
  async function access(request: FastifyRequest, permission: Permission) {
    const { principal } = await requireAccess(auth, request, permission);
    return { principal, service: inventory! };
  }
  const id = (request: FastifyRequest) => z.object({ id: z.uuid() }).parse(request.params).id;
  app.get('/inventory', async (request) => {
    const { principal, service } = await access(request, 'inventory.availability');
    return service.list(principal, stockQuery.parse(request.query));
  });
  app.get('/inventory/products/:id/batches', async (request) => {
    const { principal, service } = await access(request, 'inventory.read');
    return service.batches(principal, id(request), pageQuery.parse(request.query).page);
  });
  app.get('/inventory/batches/:id', async (request) => {
    const { principal, service } = await access(request, 'inventory.read');
    return service.batch(principal, id(request));
  });
  app.get('/inventory/products/:id/movements', async (request) => {
    const { principal, service } = await access(request, 'inventory.read');
    return service.history(principal, id(request), pageQuery.parse(request.query).page);
  });
  app.get('/inventory/operations/:id', async (request) => {
    const { principal, service } = await access(request, 'inventory.operations');
    return service.lookup(principal, id(request));
  });
  app.get('/inventory/products/:id/reconciliation', async (request) => {
    const { principal, service } = await access(request, 'inventory.reconcile');
    return service.reconcile(principal, id(request), request.id);
  });
  app.post('/inventory/opening', async (request) => {
    const { principal, service } = await access(request, 'inventory.opening');
    const input = commandSchema(openingInput).parse(request.body);
    return service.opening(principal, input.key, input.payload, request.id);
  });
  app.post('/inventory/receipts', async (request) => {
    const { principal, service } = await access(request, 'inventory.receive');
    const input = commandSchema(receiptInput).parse(request.body);
    return service.receipt(principal, input.key, input.payload, request.id);
  });
  app.post('/inventory/waste', async (request) => {
    const { principal, service } = await access(request, 'inventory.waste');
    const input = commandSchema(wasteInput).parse(request.body);
    return service.waste(principal, input.key, input.payload, request.id);
  });
  app.post('/inventory/adjustments', async (request) => {
    const { principal, service } = await access(request, 'inventory.adjust');
    const input = commandSchema(adjustmentInput).parse(request.body);
    return service.adjust(principal, input.key, input.payload, request.id);
  });
  app.get('/production', async (request) => {
    const { principal, service } = await access(request, 'production.manage');
    return service.productions(principal, productionQuery.parse(request.query));
  });
  app.post('/production', async (request) => {
    const { principal, service } = await access(request, 'production.manage');
    const input = commandSchema(planInput).parse(request.body);
    return service.plan(principal, input.key, input.payload, request.id);
  });
  app.post('/production/:id/transition', async (request) => {
    const { principal, service } = await access(request, 'production.manage');
    const input = commandSchema(productionTransition).parse(request.body);
    return service.transition(principal, input.key, id(request), input.payload, request.id);
  });
  app.post('/production/:id/complete', async (request) => {
    const { principal, service } = await access(request, 'production.manage');
    const input = commandSchema(completeInput).parse(request.body);
    return service.complete(principal, input.key, id(request), input.payload, request.id);
  });
  // Reservations/consumption have deliberately no public HTTP routes in Phase 4.
}
