import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reportKind, reportQuery, reportDefinitions, reportProductQuery } from '@pommier/shared';
import type { AuthService } from '../auth/service.js';
import { requireAccess } from '../auth/routes.js';
import { ReportingService } from './service.js';
export async function registerReportingRoutes(
  app: FastifyInstance,
  auth: AuthService | undefined,
  clock: () => Date,
) {
  const service = auth ? new ReportingService(auth, clock) : undefined;
  app.get('/reports/product-options', async (r) =>
    service!.products(
      (await requireAccess(auth, r, 'reports.stock')).principal,
      reportProductQuery.parse(r.query),
    ),
  );
  app.get('/reports/dashboard', async (r) =>
    service!.dashboard(
      (await requireAccess(auth, r, 'reports.dashboard')).principal,
      reportQuery.parse(r.query),
    ),
  );
  app.get('/reports/:kind', async (r) => {
    const kind = z.object({ kind: reportKind }).parse(r.params).kind;
    return service!.table(
      (await requireAccess(auth, r, reportDefinitions[kind].permission)).principal,
      kind,
      reportQuery.parse(r.query),
    );
  });
  app.post('/reports/:kind/export', async (r) => {
    const kind = z.object({ kind: reportKind }).parse(r.params).kind;
    return service!.export(
      (await requireAccess(auth, r, 'reports.export')).principal,
      kind,
      reportQuery.parse(r.body),
      r.id,
    );
  });
}
