import { randomBytes, randomUUID } from 'node:crypto';
import {
  businessDateOf,
  escapeCsvCell,
  importFields,
  importResultSchema,
  type ImportRow,
  type importPreviewInput,
  type importConfirmSchema,
} from '@pommier/shared';
import type { z } from 'zod';
import { RegistryService } from './service.js';
import { parseCustomerCsv, mapCsvRows, fileDuplicates } from './csv.js';
import { audit, type Principal } from '../auth/service.js';
import { tokenDigest } from '../auth/security.js';
import { AppError } from '../errors.js';

interface Preview {
  actorId: string;
  expiresAt: Date;
  rows: ImportRow[];
  dbMatches: string[];
}
export class CustomerImports {
  dispose() {
    this.previews.clear();
  }
  private readonly previews = new Map<string, Preview>();
  constructor(readonly registry: RegistryService) {
    registry.onAnonymize = () => this.previews.clear();
  }
  private prune() {
    for (const [id, preview] of this.previews)
      if (preview.expiresAt <= this.registry.clock()) this.previews.delete(id);
  }
  inspect(principal: Principal, csv: string, delimiter: ',' | ';') {
    return this.registry.run(principal, 'customers.import', async () => {
      const parsed = parseCustomerCsv(csv, delimiter);
      return {
        headers: parsed.headers,
        count: parsed.records.length,
        sample: parsed.records.slice(0, 5),
      };
    });
  }
  template(principal: Principal) {
    return this.registry.run(principal, 'customers.import', async () => ({
      csv: '\ufeff' + importFields.map(escapeCsvCell).join(';') + '\r\n',
      count: 0,
    }));
  }
  async preview(
    principal: Principal,
    input: z.infer<typeof importPreviewInput>,
    requestId: string,
  ) {
    this.prune();
    return this.registry.run(principal, 'customers.import', async (tx, actor) => {
      if (
        this.previews.size >= 5 ||
        [...this.previews.values()].filter((p) => p.actorId === actor.id).length >= 2
      )
        throw new AppError(
          429,
          'IMPORT_PREVIEW_LIMIT',
          'Há prévias em revisão. Cancele uma ou aguarde até 15 minutos.',
        );
      const rows = mapCsvRows(
        parseCustomerCsv(input.csv, input.delimiter),
        input.mapping,
        businessDateOf(this.registry.clock()),
      );
      if (!rows.length)
        throw new AppError(400, 'CSV_EMPTY', 'O arquivo não contém linhas de dados.');
      fileDuplicates(rows);
      const dbMatches: string[] = [];
      for (const row of rows) {
        const matches = row.customer
          ? await this.registry.duplicates(tx, row.customer, actor.role)
          : [];
        dbMatches.push(JSON.stringify(matches));
        row.duplicates.push(...matches);
      }
      const now = this.registry.clock();
      const expiresAt = new Date(now.getTime() + 900000);
      const id = randomUUID();
      const reviewToken = randomBytes(32).toString('base64url');
      await tx.importJob.create({
        data: {
          id,
          actorId: actor.id,
          tokenDigest: tokenDigest(reviewToken),
          rowCount: rows.length,
          createdAt: now,
          expiresAt,
        },
      });
      await audit(tx, 'CUSTOMER_IMPORT_PREVIEWED', requestId, actor.id, id, now, {
        count: rows.length,
      });
      // No raw CSV or filename retained; normalized review data is memory-only and bounded.
      this.previews.set(id, { actorId: actor.id, expiresAt, rows, dbMatches });
      return { id, reviewToken, expiresAt, rows };
    });
  }
  async status(principal: Principal, id: string) {
    return this.registry.run(principal, 'customers.import', async (tx, actor) => {
      const job = await tx.importJob.findFirst({ where: { id, actorId: actor.id } });
      if (!job) throw new AppError(404, 'IMPORT_NOT_FOUND', 'Esta revisão não foi encontrada.');
      const expired =
        job.status === 'PENDING' &&
        (!this.previews.has(id) || job.expiresAt <= this.registry.clock());
      return {
        status: expired ? ('EXPIRED' as const) : job.status,
        result: job.result ? importResultSchema.parse(job.result) : null,
      };
    });
  }
  cancel(principal: Principal, id: string) {
    return this.registry.run(principal, 'customers.import', async (tx, actor) => {
      await tx.importJob.updateMany({
        where: { id, actorId: actor.id, status: 'PENDING' },
        data: { status: 'CANCELLED', closedAt: this.registry.clock() },
      });
      this.previews.delete(id);
      return { cancelled: true };
    });
  }
  async confirm(
    principal: Principal,
    id: string,
    input: z.infer<typeof importConfirmSchema>,
    requestId: string,
  ) {
    this.prune();
    const decisionDigest = tokenDigest(
      JSON.stringify([...input.choices].sort((a, b) => a.row - b.row)),
    );
    const outcome = await this.registry.run(principal, 'customers.import', async (tx, actor) => {
      const job = await tx.importJob.findFirst({ where: { id, actorId: actor.id } });
      if (!job || job.tokenDigest !== tokenDigest(input.reviewToken))
        throw new AppError(404, 'IMPORT_NOT_FOUND', 'Esta revisão não foi encontrada.');
      if (job.status === 'COMPLETED') {
        if (job.decisionDigest !== decisionDigest)
          throw new AppError(
            409,
            'IMPORT_CHOICES_CHANGED',
            'Esta importação já foi concluída com outras escolhas. Consulte o resultado.',
          );
        return { result: importResultSchema.parse(job.result), stale: false };
      }
      const preview = this.previews.get(id);
      if (job.status !== 'PENDING' || !preview || preview.expiresAt <= this.registry.clock())
        throw new AppError(
          410,
          'IMPORT_PREVIEW_EXPIRED',
          'Esta prévia expirou ou foi descartada. Selecione o arquivo e revise novamente.',
        );
      if (
        input.choices.length !== preview.rows.length ||
        new Set(input.choices.map((c) => c.row)).size !== preview.rows.length ||
        input.choices.some((c) => c.row > preview.rows.length)
      )
        throw new AppError(
          400,
          'IMPORT_CHOICES_INVALID',
          'Confirme uma escolha para cada linha da revisão.',
        );
      for (const row of preview.rows) {
        const current = row.customer
          ? await this.registry.duplicates(tx, row.customer, actor.role)
          : [];
        if (JSON.stringify(current) !== preview.dbMatches[row.row - 1]) {
          await tx.importJob.update({
            where: { id },
            data: { status: 'CANCELLED', closedAt: this.registry.clock() },
          });
          this.previews.delete(id);
          return { result: null, stale: true };
        }
      }
      const rows: z.infer<typeof importResultSchema>['rows'] = [];
      for (const row of preview.rows) {
        const choice = input.choices.find((c) => c.row === row.row)!;
        if (choice.action === 'SKIP') {
          rows.push({ row: row.row, status: 'SKIPPED' });
          continue;
        }
        if (!row.customer || row.errors.length || row.duplicates.some((d) => d.type === 'CPF'))
          throw new AppError(
            409,
            'IMPORT_ROW_REVIEW',
            'Uma linha selecionada contém erro ou conflito de CPF. Corrija o arquivo ou ignore a linha. Nenhuma linha foi criada.',
          );
        if (row.duplicates.length && !choice.reason)
          throw new AppError(
            409,
            'IMPORT_DUPLICATE_REVIEW',
            'Confirme um motivo para cada linha duplicada escolhida para criação. Nenhuma linha foi criada.',
          );
        const created = await this.registry.createRecord(
          tx,
          { ...row.customer, ...(choice.reason ? { duplicateOverrideReason: choice.reason } : {}) },
          actor.id,
          requestId,
        );
        rows.push({
          row: row.row,
          status: 'CREATED',
          id: created.id,
          registration: `CLI-${String(created.registrationNumber).padStart(6, '0')}`,
        });
      }
      const result = {
        rows,
        created: rows.filter((r) => r.status === 'CREATED').length,
        skipped: rows.filter((r) => r.status === 'SKIPPED').length,
      };
      await tx.importJob.update({
        where: { id },
        data: { status: 'COMPLETED', decisionDigest, result, closedAt: this.registry.clock() },
      });
      await audit(tx, 'CUSTOMER_IMPORTED', requestId, actor.id, id, this.registry.clock(), {
        created: result.created,
        skipped: result.skipped,
      });
      this.previews.delete(id);
      return { result, stale: false };
    });
    if (outcome.stale)
      throw new AppError(
        409,
        'IMPORT_REVIEW_STALE',
        'Cadastros mudaram desde a prévia. Selecione o arquivo e revise as duplicidades novamente. Nenhuma linha foi criada.',
      );
    return outcome.result;
  }
  async cleanup() {
    this.prune();
    const now = this.registry.clock();
    await this.registry.auth.db.importJob.updateMany({
      where: { status: 'PENDING', expiresAt: { lte: now } },
      data: { status: 'EXPIRED', closedAt: now },
    });
    const cutoff = new Date(now.getTime() - 30 * 86400000);
    await this.registry.auth.db
      .$executeRaw`DELETE FROM "ImportJob" WHERE "id" IN (SELECT "id" FROM "ImportJob" WHERE "closedAt" < ${cutoff} LIMIT 100)`;
  }
}
