import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  customerCreateSchema,
  customerEditSchema,
  customerQuerySchema,
  statusChangeSchema,
  anonymizeSchema,
  marketingSchema,
  categorySchema,
  categoryEditSchema,
  categoryQuerySchema,
  productCreateSchema,
  productEditSchema,
  productQuerySchema,
  csvInputSchema,
  importPreviewInput,
  importConfirmSchema,
  type Permission,
} from '@pommier/shared';
import { requireAccess } from '../auth/routes.js';
import type { AuthService } from '../auth/service.js';
import { RegistryService } from './service.js';
import { CustomerImports } from './imports.js';

export async function registerRegistryRoutes(
  app: FastifyInstance,
  auth: AuthService | undefined,
  clock: () => Date,
) {
  const registry = auth ? new RegistryService(auth, clock) : undefined;
  const imports = registry ? new CustomerImports(registry) : undefined;
  async function access(request: FastifyRequest, permission: Permission) {
    const identity = await requireAccess(auth, request, permission);
    return { ...identity, registry: registry!, imports: imports! };
  }
  const id = (request: FastifyRequest) => z.object({ id: z.uuid() }).parse(request.params).id;
  app.get('/customers', async (request) => {
    const { principal, registry } = await access(request, 'customers.read');
    return registry.listCustomers(principal, customerQuerySchema.parse(request.query));
  });
  app.get('/customers/:id', async (request) => {
    const { principal, registry } = await access(request, 'customers.read');
    return registry.detailCustomer(principal, id(request));
  });
  app.post('/customers/review', async (request) => {
    const { principal, registry } = await access(request, 'customers.write');
    const input = customerCreateSchema
      .extend({ excludeId: z.uuid().optional() })
      .parse(request.body);
    const { excludeId, ...fields } = input;
    return registry.review(principal, fields, excludeId);
  });
  app.post('/customers', async (request, reply) => {
    const { principal, registry } = await access(request, 'customers.write');
    return reply
      .code(201)
      .send(
        await registry.createCustomer(
          principal,
          customerCreateSchema.parse(request.body),
          request.id,
        ),
      );
  });
  app.patch('/customers/:id', async (request) => {
    const { principal, registry } = await access(request, 'customers.write');
    return registry.editCustomer(
      principal,
      id(request),
      customerEditSchema.parse(request.body),
      request.id,
    );
  });
  app.post('/customers/:id/status', async (request) => {
    const { principal, registry } = await access(request, 'customers.manage');
    return registry.statusCustomer(
      principal,
      id(request),
      statusChangeSchema.parse(request.body),
      request.id,
    );
  });
  app.post('/customers/:id/marketing', async (request) => {
    const { principal, registry } = await access(request, 'customers.marketing');
    return registry.marketing(
      principal,
      id(request),
      marketingSchema.parse(request.body),
      request.id,
    );
  });
  app.post('/customers/:id/anonymize', async (request) => {
    const { principal, registry } = await access(request, 'customers.anonymize');
    return registry.anonymize(
      principal,
      id(request),
      anonymizeSchema.parse(request.body),
      request.id,
    );
  });
  app.post('/customers/export', async (request) => {
    const { principal, registry } = await access(request, 'customers.export');
    return registry.exportCustomers(principal, customerQuerySchema.parse(request.body), request.id);
  });
  app.get('/categories', async (request) => {
    const { principal, registry } = await access(request, 'catalog.read');
    return registry.listCategories(principal, categoryQuerySchema.parse(request.query));
  });
  app.post('/categories', async (request, reply) => {
    const { principal, registry } = await access(request, 'catalog.manage');
    return reply
      .code(201)
      .send(
        await registry.saveCategory(
          principal,
          null,
          categorySchema.parse(request.body),
          request.id,
        ),
      );
  });
  app.patch('/categories/:id', async (request) => {
    const { principal, registry } = await access(request, 'catalog.manage');
    return registry.saveCategory(
      principal,
      id(request),
      categoryEditSchema.parse(request.body),
      request.id,
    );
  });
  app.get('/products', async (request) => {
    const { principal, registry } = await access(request, 'catalog.read');
    return registry.listProducts(principal, productQuerySchema.parse(request.query));
  });
  app.get('/products/:id', async (request) => {
    const { principal, registry } = await access(request, 'catalog.read');
    return registry.detailProduct(principal, id(request));
  });
  app.post('/products', async (request, reply) => {
    const { principal, registry } = await access(request, 'catalog.manage');
    return reply
      .code(201)
      .send(
        await registry.saveProduct(
          principal,
          null,
          productCreateSchema.parse(request.body),
          request.id,
        ),
      );
  });
  app.patch('/products/:id', async (request) => {
    const { principal, registry } = await access(request, 'catalog.manage');
    return registry.saveProduct(
      principal,
      id(request),
      productEditSchema.parse(request.body),
      request.id,
    );
  });
  app.get('/customer-imports/template', async (request) => {
    const { principal, imports } = await access(request, 'customers.import');
    return imports.template(principal);
  });
  app.post('/customer-imports/inspect', { bodyLimit: 1048576 }, async (request) => {
    const { principal, imports } = await access(request, 'customers.import');
    const input = csvInputSchema.parse(request.body);
    return imports.inspect(principal, input.csv, input.delimiter);
  });
  app.post('/customer-imports/preview', { bodyLimit: 1048576 }, async (request) => {
    const { principal, imports } = await access(request, 'customers.import');
    return imports.preview(principal, importPreviewInput.parse(request.body), request.id);
  });
  app.get('/customer-imports/:id', async (request) => {
    const { principal, imports } = await access(request, 'customers.import');
    return imports.status(principal, id(request));
  });
  app.post('/customer-imports/:id/cancel', async (request) => {
    const { principal, imports } = await access(request, 'customers.import');
    return imports.cancel(principal, id(request));
  });
  app.post('/customer-imports/:id/confirm', async (request) => {
    const { principal, imports } = await access(request, 'customers.import');
    return imports.confirm(
      principal,
      id(request),
      importConfirmSchema.parse(request.body),
      request.id,
    );
  });
  if (imports) {
    const cleanup = () => {
      void imports
        .cleanup()
        .catch(() =>
          app.log.warn(
            { event: 'import_cleanup_failed' },
            'Não foi possível limpar as revisões expiradas.',
          ),
        );
    };
    app.addHook('onReady', async () => {
      cleanup();
    });
    const timer = setInterval(cleanup, 60000);
    timer.unref();
    app.addHook('onClose', async () => {
      clearInterval(timer);
      imports.dispose();
    });
  }
}
