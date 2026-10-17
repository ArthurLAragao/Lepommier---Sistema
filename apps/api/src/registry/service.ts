import {
  hasPermission,
  nameKey,
  registrationLabel,
  birthdayAllowed,
  businessDateOf,
  escapeCsvCell,
  type CustomerInput,
  type CustomerQuery,
  type Role,
  type Duplicate,
  type Permission,
  type customerEditSchema,
  type statusChangeSchema,
  type anonymizeSchema,
  type marketingSchema,
  type categorySchema,
  type categoryEditSchema,
  type categoryQuerySchema,
  type productCreateSchema,
  type productEditSchema,
  type productQuerySchema,
} from '@pommier/shared';
import type { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { AuthService, audit, type Principal } from '../auth/service.js';
import { AppError } from '../errors.js';

export type Tx = Prisma.TransactionClient;
export const categorySelect = {
  id: true,
  name: true,
  active: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;
export const customerBaseSelect = {
  id: true,
  registrationNumber: true,
  name: true,
  phone: true,
  active: true,
  anonymizedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;
export function customerSelect(role: Role, detail = true) {
  return {
    ...customerBaseSelect,
    ...(detail && hasPermission(role, 'customers.operational')
      ? ({ email: true, birthday: true, address: true, marketingState: true } as const)
      : {}),
    ...(detail && hasPermission(role, 'customers.private')
      ? ({ cpf: true, notes: true } as const)
      : {}),
  };
}
export function productSelect(role: Role) {
  return {
    id: true,
    code: true,
    name: true,
    categoryId: true,
    category: { select: categorySelect },
    description: true,
    origin: true,
    sellingPriceCents: true,
    active: true,
    storageInstructions: true,
    shelfLifeReference: true,
    version: true,
    createdAt: true,
    updatedAt: true,
    ...(hasPermission(role, 'catalog.cost') ? ({ estimatedCostCents: true } as const) : {}),
  } as const;
}
function customerDto<T extends { registrationNumber: number; birthday?: Date | null }>(row: T) {
  return {
    ...row,
    registration: registrationLabel(row.registrationNumber),
    ...(Object.hasOwn(row, 'birthday')
      ? { birthday: row.birthday?.toISOString().slice(0, 10) ?? null }
      : {}),
  };
}
const missing = () => new AppError(404, 'RECORD_NOT_FOUND', 'Este cadastro não foi encontrado.');
export const stale = () =>
  new AppError(
    409,
    'STALE_RECORD',
    'Este cadastro foi alterado por outra pessoa. Recarregue e revise antes de salvar.',
  );
function editable(record: { version: number; anonymizedAt?: Date | null } | null, version: number) {
  if (!record) throw missing();
  if (record.anonymizedAt)
    throw new AppError(
      409,
      'CUSTOMER_ANONYMIZED',
      'Este cadastro foi anonimizado e não pode ser reativado ou editado.',
    );
  if (record.version !== version) throw stale();
}
export class RegistryService {
  onAnonymize = () => {};
  constructor(
    readonly auth: AuthService,
    readonly clock: () => Date,
  ) {}
  async run<T>(
    principal: Principal,
    permission: Permission,
    operation: (tx: Tx, actor: { id: string; role: Role }) => Promise<T>,
  ) {
    try {
      return await this.auth.withPermission(principal, permission, operation);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError(
          409,
          'UNIQUE_CONFLICT',
          'Já existe um cadastro com este identificador. Recarregue e revise; nenhum cadastro foi mesclado.',
        );
      throw error;
    }
  }
  validateCustomer(input: CustomerInput, role: Role) {
    if (!birthdayAllowed(input.birthday, businessDateOf(this.clock())))
      throw new AppError(
        400,
        'BIRTHDAY_FUTURE',
        'Nascimento não pode estar no futuro. Informe uma data completa, ou deixe vazio.',
      );
    const forbidden = [
      !hasPermission(role, 'customers.operational') &&
        ['email', 'birthday', 'address'].some((key) => Object.hasOwn(input, key)),
      !hasPermission(role, 'customers.private') &&
        ['cpf', 'notes'].some((key) => Object.hasOwn(input, key)),
    ];
    if (forbidden.some(Boolean))
      throw new AppError(
        403,
        'PRIVATE_FIELDS_FORBIDDEN',
        'Seu perfil não pode consultar ou alterar esses campos.',
      );
  }
  async duplicates(
    tx: Tx,
    input: CustomerInput,
    role: Role,
    excludeId?: string,
  ): Promise<Duplicate[]> {
    const conditions: Array<[Duplicate['type'], Prisma.CustomerWhereInput]> = [
      ['NAME', { nameKey: nameKey(input.name) }],
    ];
    if (input.phone) conditions.push(['PHONE', { phone: input.phone }]);
    if (input.email && hasPermission(role, 'customers.operational'))
      conditions.push(['EMAIL', { email: input.email }]);
    if (input.cpf && hasPermission(role, 'customers.private'))
      conditions.push(['CPF', { cpf: input.cpf }]);
    const matches: Duplicate[] = [];
    for (const [type, where] of conditions) {
      const rows = await tx.customer.findMany({
        where: {
          ...where,
          anonymizedAt: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
          ...(!hasPermission(role, 'customers.manage') ? { active: true } : {}),
        },
        select: { id: true, registrationNumber: true, name: true, version: true },
        orderBy: { registrationNumber: 'asc' },
        take: 20,
      });
      matches.push(
        ...rows.map((row) => ({
          type,
          id: row.id,
          registration: registrationLabel(row.registrationNumber),
          name: row.name,
          version: row.version,
        })),
      );
    }
    return matches;
  }
  review(principal: Principal, input: CustomerInput, id?: string) {
    return this.run(principal, 'customers.write', async (tx, actor) => {
      this.validateCustomer(input, actor.role);
      return { matches: await this.duplicates(tx, input, actor.role, id) };
    });
  }
  private async guardDuplicates(tx: Tx, input: CustomerInput, role: Role, id?: string) {
    // CPF is unique even if the existing profile is inactive, and cannot be overridden.
    if (
      input.cpf &&
      (await tx.customer.findFirst({
        where: { cpf: input.cpf, ...(id ? { id: { not: id } } : {}) },
        select: { id: true },
      }))
    )
      throw new AppError(
        409,
        'CPF_CONFLICT',
        'CPF já vinculado a outro cadastro. Revise o perfil existente; não há mesclagem automática.',
      );
    const matches = await this.duplicates(tx, input, role, id);
    if (matches.length && !input.duplicateOverrideReason)
      throw new AppError(
        409,
        'DUPLICATE_REVIEW_REQUIRED',
        'Há possíveis duplicidades. Revise os avisos e confirme um motivo para cadastrar separadamente.',
      );
  }
  async createRecord(tx: Tx, input: CustomerInput, actorId: string, requestId: string) {
    const { duplicateOverrideReason, birthday, ...fields } = input;
    const customer = await tx.customer.create({
      data: {
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        cpf: input.cpf ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        nameKey: nameKey(input.name),
        birthday: birthday ? new Date(`${birthday}T00:00:00Z`) : null,
      },
      select: { id: true, registrationNumber: true },
    });
    await audit(tx, 'CUSTOMER_CREATED', requestId, actorId, customer.id, this.clock(), {
      fields: Object.keys(fields).join(','),
      ...(duplicateOverrideReason ? { reason: duplicateOverrideReason } : {}),
    });
    return customer;
  }
  createCustomer(principal: Principal, input: CustomerInput, requestId: string) {
    return this.run(principal, 'customers.write', async (tx, actor) => {
      this.validateCustomer(input, actor.role);
      await this.guardDuplicates(tx, input, actor.role);
      const { id } = await this.createRecord(tx, input, actor.id, requestId);
      return {
        customer: customerDto(
          await tx.customer.findUniqueOrThrow({
            where: { id },
            select: customerSelect(actor.role),
          }),
        ),
      };
    });
  }
  customerWhere(query: CustomerQuery, role: Role): Prisma.CustomerWhereInput {
    if (!hasPermission(role, 'customers.manage') && query.state !== 'active')
      throw new AppError(
        403,
        'CUSTOMER_SCOPE_FORBIDDEN',
        'Seu perfil consulta somente clientes ativos.',
      );
    const digits = query.q.replace(/\D/g, '');
    const registration = /^(?:CLI-)?\d{1,9}$/i.test(query.q)
      ? Number(query.q.replace(/^CLI-/i, ''))
      : null;
    return {
      ...(query.state !== 'all' ? { active: query.state === 'active' } : {}),
      ...(query.q
        ? {
            OR: [
              { nameKey: { contains: nameKey(query.q) } },
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
              ...(registration ? [{ registrationNumber: registration }] : []),
            ],
          }
        : {}),
    };
  }
  listCustomers(principal: Principal, query: CustomerQuery) {
    return this.run(principal, 'customers.read', async (tx, actor) => {
      const where = this.customerWhere(query, actor.role);
      const items = await tx.customer.findMany({
        where,
        select: customerSelect(actor.role, false),
        orderBy:
          query.sort === 'registration'
            ? [{ registrationNumber: 'asc' }]
            : query.sort === 'newest'
              ? [{ createdAt: 'desc' }, { id: 'asc' }]
              : [{ nameKey: 'asc' }, { id: 'asc' }],
        take: 20,
        skip: (query.page - 1) * 20,
      });
      return {
        items: items.map(customerDto),
        total: await tx.customer.count({ where }),
        page: query.page,
        pageSize: 20,
      };
    });
  }
  detailCustomer(principal: Principal, id: string) {
    return this.run(principal, 'customers.read', async (tx, actor) => {
      const customer = await tx.customer.findFirst({
        where: { id, ...(!hasPermission(actor.role, 'customers.manage') ? { active: true } : {}) },
        select: customerSelect(actor.role),
      });
      if (!customer) throw missing();
      return {
        customer: customerDto(customer),
        ...(hasPermission(actor.role, 'customers.marketing')
          ? {
              marketingHistory: await tx.marketingPreferenceEvent.findMany({
                where: { customerId: id },
                select: {
                  id: true,
                  previousState: true,
                  state: true,
                  source: true,
                  reason: true,
                  evidence: true,
                  actorId: true,
                  actor: { select: { displayName: true } },
                  createdAt: true,
                },
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                take: 50,
              }),
            }
          : {}),
      };
    });
  }
  editCustomer(
    principal: Principal,
    id: string,
    input: z.infer<typeof customerEditSchema>,
    requestId: string,
  ) {
    return this.run(principal, 'customers.write', async (tx, actor) => {
      this.validateCustomer(input, actor.role);
      const existing = await tx.customer.findFirst({
        where: { id, ...(!hasPermission(actor.role, 'customers.manage') ? { active: true } : {}) },
        select: { version: true, anonymizedAt: true },
      });
      editable(existing, input.version);
      await this.guardDuplicates(tx, input, actor.role, id);
      const { duplicateOverrideReason, birthday } = input;
      const fields = Object.keys(input).filter(
        (key) => !['version', 'duplicateOverrideReason', 'birthday'].includes(key),
      );
      const data: Prisma.CustomerUpdateInput = {
        name: input.name,
        nameKey: nameKey(input.name),
        ...(birthday !== undefined
          ? { birthday: birthday ? new Date(`${birthday}T00:00:00Z`) : null }
          : {}),
        version: { increment: 1 },
      };
      for (const field of ['phone', 'email', 'cpf', 'address', 'notes'] as const)
        if (input[field] !== undefined) data[field] = input[field];
      const customer = await tx.customer.update({
        where: { id },
        data,
        select: customerSelect(actor.role),
      });
      await audit(tx, 'CUSTOMER_UPDATED', requestId, actor.id, id, this.clock(), {
        fields: fields.concat(birthday !== undefined ? ['birthday'] : []).join(','),
        reason: duplicateOverrideReason ?? 'CORRECTION',
      });
      return { customer: customerDto(customer) };
    });
  }
  statusCustomer(
    principal: Principal,
    id: string,
    input: z.infer<typeof statusChangeSchema>,
    requestId: string,
  ) {
    return this.run(principal, 'customers.manage', async (tx, actor) => {
      editable(
        await tx.customer.findUnique({
          where: { id },
          select: { version: true, anonymizedAt: true },
        }),
        input.version,
      );
      const customer = await tx.customer.update({
        where: { id },
        data: { active: input.active, version: { increment: 1 } },
        select: customerSelect(actor.role),
      });
      await audit(tx, 'CUSTOMER_STATUS_CHANGED', requestId, actor.id, id, this.clock(), {
        active: input.active,
        reason: input.reason,
      });
      return { customer: customerDto(customer) };
    });
  }
  marketing(
    principal: Principal,
    id: string,
    input: z.infer<typeof marketingSchema>,
    requestId: string,
  ) {
    return this.run(principal, 'customers.marketing', async (tx, actor) => {
      const existing = await tx.customer.findUnique({
        where: { id },
        select: { version: true, anonymizedAt: true, marketingState: true },
      });
      editable(existing, input.version);
      await tx.marketingPreferenceEvent.create({
        data: {
          customerId: id,
          actorId: actor.id,
          previousState: existing!.marketingState,
          state: input.state,
          source: input.source,
          reason: input.reason,
          evidence: input.evidence ?? null,
          createdAt: this.clock(),
        },
      });
      await tx.customer.update({
        where: { id },
        data: { marketingState: input.state, version: { increment: 1 } },
      });
      await audit(tx, 'MARKETING_CHANGED', requestId, actor.id, id, this.clock(), {
        previousState: existing!.marketingState,
        state: input.state,
        source: input.source,
        reason: input.reason,
      });
      return { changed: true };
    });
  }
  anonymize(
    principal: Principal,
    id: string,
    input: z.infer<typeof anonymizeSchema>,
    requestId: string,
  ) {
    return this.run(principal, 'customers.anonymize', async (tx, actor) => {
      const existing = await tx.customer.findUnique({
        where: { id },
        select: {
          version: true,
          anonymizedAt: true,
          registrationNumber: true,
          marketingState: true,
        },
      });
      editable(existing, input.version);
      if (input.confirmation !== registrationLabel(existing!.registrationNumber))
        throw new AppError(
          400,
          'ANONYMIZATION_CONFIRMATION',
          'Digite a matrícula exata para confirmar a anonimização.',
        );
      const now = this.clock();
      await tx.customer.update({
        where: { id },
        data: {
          name: 'Cliente anonimizado',
          nameKey: 'cliente anonimizado',
          phone: null,
          email: null,
          birthday: null,
          cpf: null,
          address: null,
          notes: null,
          active: false,
          anonymizedAt: now,
          marketingState: 'OPTED_OUT',
          version: { increment: 1 },
        },
      });
      await tx.marketingPreferenceEvent.updateMany({
        where: { customerId: id },
        data: { evidence: null },
      });
      await tx.marketingPreferenceEvent.create({
        data: {
          customerId: id,
          actorId: actor.id,
          previousState: existing!.marketingState,
          state: 'OPTED_OUT',
          source: 'ANONYMIZATION',
          reason: input.reason,
          createdAt: now,
        },
      });
      await tx.importJob.updateMany({
        where: { status: 'PENDING' },
        data: { status: 'CANCELLED', closedAt: now },
      });
      this.onAnonymize();
      await audit(tx, 'CUSTOMER_ANONYMIZED', requestId, actor.id, id, now, {
        reason: input.reason,
        fields: 'name,phone,email,birthday,cpf,address,notes,marketingEvidence',
      });
      return { anonymized: true };
    });
  }
  exportCustomers(principal: Principal, query: CustomerQuery, requestId: string) {
    return this.run(principal, 'customers.export', async (tx, actor) => {
      const where = { ...this.customerWhere(query, actor.role), anonymizedAt: null };
      const count = await tx.customer.count({ where });
      if (count > 5000)
        throw new AppError(
          413,
          'EXPORT_TOO_LARGE',
          'A exportação aceita até 5.000 cadastros. Restrinja os filtros.',
        );
      const rows = await tx.customer.findMany({
        where,
        select: {
          registrationNumber: true,
          name: true,
          phone: true,
          email: true,
          active: true,
          marketingState: true,
        },
        orderBy: { registrationNumber: 'asc' },
        take: 5000,
      });
      const csv =
        '\ufeff' +
        [
          ['matricula', 'nome', 'telefone', 'email', 'situacao', 'preferencia_marketing'],
          ...rows.map((row) => [
            registrationLabel(row.registrationNumber),
            row.name,
            row.phone,
            row.email,
            row.active ? 'ATIVO' : 'INATIVO',
            row.marketingState,
          ]),
        ]
          .map((row) => row.map(escapeCsvCell).join(';'))
          .join('\r\n') +
        '\r\n';
      await audit(tx, 'CUSTOMER_EXPORTED', requestId, actor.id, null, this.clock(), {
        count,
        scope: query.state,
      });
      return { csv, count };
    });
  }
  listCategories(principal: Principal, query: z.infer<typeof categoryQuerySchema>) {
    return this.run(principal, 'catalog.read', async (tx, actor) => {
      if (!hasPermission(actor.role, 'catalog.manage') && query.state !== 'active')
        throw new AppError(
          403,
          'CATALOG_SCOPE_FORBIDDEN',
          'Seu perfil consulta somente categorias ativas.',
        );
      const where = {
        ...(query.state !== 'all' ? { active: query.state === 'active' } : {}),
        nameKey: { contains: nameKey(query.q) },
      };
      return {
        items: await tx.category.findMany({
          where,
          select: categorySelect,
          orderBy: [{ nameKey: 'asc' }, { id: 'asc' }],
          take: 20,
          skip: (query.page - 1) * 20,
        }),
        total: await tx.category.count({ where }),
        page: query.page,
        pageSize: 20,
      };
    });
  }
  saveCategory(
    principal: Principal,
    id: string | null,
    input: z.infer<typeof categorySchema> | z.infer<typeof categoryEditSchema>,
    requestId: string,
  ) {
    return this.run(principal, 'catalog.manage', async (tx, actor) => {
      if (id)
        editable(
          await tx.category.findUnique({ where: { id } }),
          'version' in input ? input.version : 0,
        );
      if (
        await tx.category.findFirst({
          where: { nameKey: nameKey(input.name), ...(id ? { id: { not: id } } : {}) },
          select: { id: true },
        })
      )
        throw new AppError(
          409,
          'CATEGORY_NAME_CONFLICT',
          'Já existe uma categoria com este nome. Confira também as desativadas.',
        );
      const data = { name: input.name, nameKey: nameKey(input.name), active: input.active };
      const category = id
        ? await tx.category.update({
            where: { id },
            data: { ...data, version: { increment: 1 } },
            select: categorySelect,
          })
        : await tx.category.create({ data, select: categorySelect });
      await audit(
        tx,
        id ? 'CATEGORY_UPDATED' : 'CATEGORY_CREATED',
        requestId,
        actor.id,
        category.id,
        this.clock(),
        { fields: 'name,active', active: input.active },
      );
      return { category };
    });
  }
  listProducts(principal: Principal, query: z.infer<typeof productQuerySchema>) {
    return this.run(principal, 'catalog.read', async (tx, actor) => {
      if (!hasPermission(actor.role, 'catalog.manage') && query.state !== 'active')
        throw new AppError(
          403,
          'CATALOG_SCOPE_FORBIDDEN',
          'Seu perfil consulta somente produtos ativos.',
        );
      const where = {
        ...(query.state !== 'all' ? { active: query.state === 'active' } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.origin ? { origin: query.origin } : {}),
        ...(query.q
          ? {
              OR: [
                { nameKey: { contains: nameKey(query.q) } },
                { code: { contains: query.q.toUpperCase() } },
              ],
            }
          : {}),
      };
      return {
        items: await tx.product.findMany({
          where,
          select: productSelect(actor.role),
          orderBy:
            query.sort === 'price'
              ? [{ sellingPriceCents: 'asc' }, { id: 'asc' }]
              : query.sort === 'code'
                ? [{ code: 'asc' }]
                : [{ nameKey: 'asc' }, { id: 'asc' }],
          take: 20,
          skip: (query.page - 1) * 20,
        }),
        total: await tx.product.count({ where }),
        page: query.page,
        pageSize: 20,
      };
    });
  }
  detailProduct(principal: Principal, id: string) {
    return this.run(principal, 'catalog.read', async (tx, actor) => {
      const product = await tx.product.findFirst({
        where: { id, ...(!hasPermission(actor.role, 'catalog.manage') ? { active: true } : {}) },
        select: productSelect(actor.role),
      });
      if (!product) throw missing();
      return { product };
    });
  }
  saveProduct(
    principal: Principal,
    id: string | null,
    input: z.infer<typeof productCreateSchema> | z.infer<typeof productEditSchema>,
    requestId: string,
  ) {
    return this.run(principal, 'catalog.manage', async (tx, actor) => {
      const previous = id
        ? await tx.product.findUnique({
            where: { id },
            select: {
              version: true,
              categoryId: true,
              sellingPriceCents: true,
              estimatedCostCents: true,
            },
          })
        : null;
      if (id) editable(previous, 'version' in input ? input.version : 0);
      const category = await tx.category.findUnique({
        where: { id: input.categoryId },
        select: { active: true },
      });
      if (!category || (!category.active && previous?.categoryId !== input.categoryId))
        throw new AppError(
          409,
          'CATEGORY_UNAVAILABLE',
          'Selecione uma categoria ativa. Produtos já vinculados mantêm sua categoria ao desativá-la.',
        );
      if (
        await tx.product.findFirst({
          where: { code: input.code, ...(id ? { id: { not: id } } : {}) },
          select: { id: true },
        })
      )
        throw new AppError(
          409,
          'PRODUCT_CODE_CONFLICT',
          'Este código já foi cadastrado. Confira também os produtos desativados.',
        );
      const data = {
        code: input.code,
        name: input.name,
        nameKey: nameKey(input.name),
        categoryId: input.categoryId,
        description: input.description ?? null,
        origin: input.origin,
        sellingPriceCents: input.sellingPriceCents,
        estimatedCostCents: input.estimatedCostCents ?? null,
        active: input.active,
        storageInstructions: input.storageInstructions ?? null,
        shelfLifeReference: input.shelfLifeReference ?? null,
      };
      const product = id
        ? await tx.product.update({
            where: { id },
            data: { ...data, version: { increment: 1 } },
            select: productSelect(actor.role),
          })
        : await tx.product.create({ data, select: productSelect(actor.role) });
      await audit(
        tx,
        id ? 'PRODUCT_UPDATED' : 'PRODUCT_CREATED',
        requestId,
        actor.id,
        product.id,
        this.clock(),
        {
          fields:
            'code,name,categoryId,description,origin,active,storageInstructions,shelfLifeReference',
          active: input.active,
        },
      );
      if (!previous || previous.sellingPriceCents !== input.sellingPriceCents)
        await audit(tx, 'PRODUCT_PRICE_CHANGED', requestId, actor.id, product.id, this.clock(), {
          ...(previous ? { previousPrice: previous.sellingPriceCents } : {}),
          price: input.sellingPriceCents,
          reason: 'reason' in input ? input.reason : 'INITIAL_PRICE',
        });
      if (previous?.estimatedCostCents !== data.estimatedCostCents)
        await audit(tx, 'PRODUCT_COST_CHANGED', requestId, actor.id, product.id, this.clock(), {
          ...(previous?.estimatedCostCents !== null && previous
            ? { previousCost: previous.estimatedCostCents }
            : {}),
          ...(data.estimatedCostCents !== null ? { cost: data.estimatedCostCents } : {}),
          reason: 'ESTIMATE_REVIEW',
        });
      return { product };
    });
  }
}
