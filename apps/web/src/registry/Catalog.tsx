import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  categoryListSchema,
  categorySchema,
  categoryEditSchema,
  categoryDtoSchema,
  productListSchema,
  productCreateSchema,
  productEditSchema,
  productDtoSchema,
  productOriginSchema,
  originLabels,
  formatMoney,
  parseMoney,
  hasPermission,
  type CategoryDto,
  type ProductDto,
  type CurrentUser,
} from '@pommier/shared';
import { Modal } from '../auth/AccountSettings.js';
import { authRequest, AuthError } from '../auth/api.js';
import {
  Button,
  Field,
  Filter,
  Search,
  Table,
  Pagination,
  EmptyState,
  Badge,
} from '../components/ui.js';
import { DataStatus, TextArea } from './ui.js';
import { useRegistryData, errorMessage } from './data.js';

const savedCategorySchema = z.object({ category: categoryDtoSchema });
const savedProductSchema = z.object({ product: productDtoSchema });
const moneyInput = (value: number) =>
  `${Math.trunc(value / 100)},${String(value % 100).padStart(2, '0')}`;
export function CategoryChoice({
  value,
  onChange,
  required = false,
}: {
  value: CategoryDto | null;
  onChange: (value: CategoryDto | null) => void;
  required?: boolean;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const result = useRegistryData(
    `/categories?${new URLSearchParams({ q, state: 'active', page: String(page) })}`,
    categoryListSchema,
  );
  const items = result.data?.items ?? [];
  return (
    <fieldset className="category-picker">
      <legend>{required ? 'Categoria do produto' : 'Filtrar por categoria'}</legend>
      <Search
        label="Buscar categoria para selecionar"
        placeholder="Buscar categoria ativa"
        value={q}
        maxLength={120}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <Filter
        label={required ? 'Categoria (obrigatória)' : 'Categoria do filtro'}
        required={required}
        value={value?.id ?? ''}
        onChange={(e) =>
          onChange(
            items.find((c) => c.id === e.target.value) ??
              (value?.id === e.target.value ? value : null),
          )
        }
      >
        <option value="">{required ? 'Selecione uma categoria' : 'Todas as categorias'}</option>
        {value && !items.some((c) => c.id === value.id) && (
          <option value={value.id}>
            {value.name}
            {!value.active ? ' (inativa)' : ''}
          </option>
        )}
        {items.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Filter>
      <DataStatus {...result} retry={result.refresh} />
      {result.data && result.data.total > 20 && (
        <Pagination page={page} pageCount={Math.ceil(result.data.total / 20)} onChange={setPage} />
      )}
    </fieldset>
  );
}
export default function Catalog({ current }: { current: CurrentUser }) {
  const [tab, setTab] = useState<'products' | 'categories'>('products');
  return (
    <section className="registry-page">
      <div className="registry-actions" aria-label="Seções do catálogo">
        <Button
          variant={tab === 'products' ? 'primary' : 'secondary'}
          aria-pressed={tab === 'products'}
          onClick={() => setTab('products')}
        >
          Catálogo de produtos
        </Button>
        <Button
          variant={tab === 'categories' ? 'primary' : 'secondary'}
          aria-pressed={tab === 'categories'}
          onClick={() => setTab('categories')}
        >
          Categorias
        </Button>
      </div>
      <p className="info-note">
        Cadastro por unidade inteira. Consulte os lotes e a disponibilidade em Estoque. Vendas e
        pedidos ainda não estão implementados.
      </p>
      {tab === 'products' ? <Products current={current} /> : <Categories current={current} />}
    </section>
  );
}
function Categories({ current }: { current: CurrentUser }) {
  const manage = hasPermission(current.user.role, 'catalog.manage');
  const [q, setQ] = useState('');
  const [state, setState] = useState('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CategoryDto | 'new' | null>(null);
  const result = useRegistryData(
    `/categories?${new URLSearchParams({ q, state, page: String(page) })}`,
    categoryListSchema,
  );
  return (
    <>
      <div className="registry-toolbar">
        <div>
          <h2>Categorias</h2>
          <p>Desativar uma categoria não desativa seus produtos.</p>
        </div>
        {manage && <Button onClick={() => setEditing('new')}>Nova categoria</Button>}
      </div>
      <div className="card registry-filters">
        <Search
          label="Buscar categoria"
          value={q}
          placeholder="Nome da categoria"
          maxLength={120}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Filter
          label="Situação da categoria"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          <option value="active">Ativas</option>
          {manage && (
            <>
              <option value="inactive">Inativas</option>
              <option value="all">Todas</option>
            </>
          )}
        </Filter>
      </div>
      <DataStatus {...result} retry={result.refresh} />
      {!result.busy && result.data && (
        <section className="card registry-table">
          {result.data.items.length ? (
            <Table
              caption="Categorias cadastradas"
              rows={result.data.items}
              rowKey={(row) => row.id}
              columns={[
                { key: 'name', label: 'Categoria', render: (row) => row.name },
                {
                  key: 'active',
                  label: 'Situação',
                  render: (row) => (
                    <Badge tone={row.active ? 'success' : 'neutral'}>
                      {row.active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  ),
                },
                ...(manage
                  ? [
                      {
                        key: 'action',
                        label: 'Ações',
                        render: (row: CategoryDto) => (
                          <Button
                            variant="secondary"
                            onClick={() => setEditing(row)}
                            aria-label={`Editar categoria ${row.name}`}
                          >
                            Editar
                          </Button>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          ) : (
            <EmptyState
              title="Nenhuma categoria encontrada"
              description="Cadastre uma categoria ou ajuste os filtros."
            />
          )}
          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(result.data.total / 20))}
            onChange={setPage}
          />
        </section>
      )}
      {editing && (
        <CategoryForm
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            result.refresh();
          }}
        />
      )}
    </>
  );
}
function CategoryForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: CategoryDto | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const body = initial ? { name, active, version: initial.version } : { name, active };
    const parsed = initial ? categoryEditSchema.safeParse(body) : categorySchema.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira o nome.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authRequest(
        initial ? `/categories/${initial.id}` : '/categories',
        savedCategorySchema,
        { method: initial ? 'PATCH' : 'POST', body: parsed.data },
      );
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
      setConflict(cause instanceof AuthError && cause.code === 'STALE_RECORD');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={initial ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}>
      <form
        className="auth-form"
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <Field
          label="Nome da categoria"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
        />
        <label className="checkbox-label">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{' '}
          Categoria ativa
        </label>
        <p>
          Ao desativar, novos vínculos são bloqueados. Produtos existentes permanecem vinculados e
          mantêm sua própria situação.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {conflict && (
          <Button variant="secondary" onClick={onSaved}>
            Fechar e recarregar (descarta edições)
          </Button>
        )}
        <div className="form-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy}>
            Salvar categoria
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function Products({ current }: { current: CurrentUser }) {
  const manage = hasPermission(current.user.role, 'catalog.manage');
  const cost = hasPermission(current.user.role, 'catalog.cost');
  const [q, setQ] = useState('');
  const [state, setState] = useState('active');
  const [origin, setOrigin] = useState('');
  const [category, setCategory] = useState<CategoryDto | null>(null);
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ProductDto | 'new' | null>(null);
  const [viewing, setViewing] = useState<ProductDto | null>(null);
  const query = new URLSearchParams({ q, state, sort, page: String(page) });
  if (origin) query.set('origin', origin);
  if (category) query.set('categoryId', category.id);
  const result = useRegistryData(`/products?${query}`, productListSchema);
  return (
    <>
      <div className="registry-toolbar">
        <div>
          <h2>Produtos cadastrados</h2>
          <p>Preços de venda e referências do catálogo, sem saldos de estoque.</p>
        </div>
        {manage && <Button onClick={() => setEditing('new')}>Novo produto</Button>}
      </div>
      <div className="card registry-filters">
        <Search
          label="Buscar produto"
          placeholder="Nome ou código"
          value={q}
          maxLength={120}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Filter
          label="Situação do produto"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          <option value="active">Ativos</option>
          {manage && (
            <>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </>
          )}
        </Filter>
        <Filter
          label="Origem do produto"
          value={origin}
          onChange={(e) => {
            setOrigin(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas as origens</option>
          {productOriginSchema.options.map((value) => (
            <option key={value} value={value}>
              {originLabels[value]}
            </option>
          ))}
        </Filter>
        <Filter
          label="Ordenar produtos"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          <option value="name">Nome</option>
          <option value="code">Código</option>
          <option value="price">Menor preço</option>
        </Filter>
        <CategoryChoice
          value={category}
          onChange={(value) => {
            setCategory(value);
            setPage(1);
          }}
        />
      </div>
      <DataStatus {...result} retry={result.refresh} />
      {!result.busy && result.data && (
        <section className="card registry-table">
          {result.data.items.length ? (
            <Table
              caption="Produtos cadastrados"
              rows={result.data.items}
              rowKey={(row) => row.id}
              columns={[
                { key: 'code', label: 'Código', render: (row) => row.code },
                {
                  key: 'name',
                  label: 'Produto',
                  render: (row) => (
                    <Button
                      variant="ghost"
                      onClick={() => setViewing(row)}
                      aria-label={`Ver produto ${row.name}`}
                    >
                      {row.name}
                    </Button>
                  ),
                },
                {
                  key: 'category',
                  label: 'Categoria',
                  render: (row) => (
                    <>
                      {row.category.name}
                      {!row.category.active && (
                        <small className="account-login">Categoria inativa</small>
                      )}
                    </>
                  ),
                },
                { key: 'origin', label: 'Origem', render: (row) => originLabels[row.origin] },
                {
                  key: 'price',
                  label: 'Preço por unidade',
                  render: (row) => formatMoney(row.sellingPriceCents),
                },
                ...(cost
                  ? [
                      {
                        key: 'cost',
                        label: 'Custo unitário estimado',
                        render: (row: ProductDto) =>
                          row.estimatedCostCents === null || row.estimatedCostCents === undefined
                            ? 'Não informado'
                            : formatMoney(row.estimatedCostCents),
                      },
                    ]
                  : []),
                {
                  key: 'active',
                  label: 'Situação',
                  render: (row) => (
                    <Badge tone={row.active ? 'success' : 'neutral'}>
                      {row.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  ),
                },
                ...(manage
                  ? [
                      {
                        key: 'action',
                        label: 'Ações',
                        render: (row: ProductDto) => (
                          <Button
                            variant="secondary"
                            onClick={() => setEditing(row)}
                            aria-label={`Editar produto ${row.name}`}
                          >
                            Editar
                          </Button>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          ) : (
            <EmptyState
              title="Nenhum produto encontrado"
              description="Cadastre um produto ou ajuste os filtros. Nenhuma quantidade ou disponibilidade é presumida."
            />
          )}
          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(result.data.total / 20))}
            onChange={setPage}
          />
        </section>
      )}
      {editing && (
        <ProductForm
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            result.refresh();
          }}
        />
      )}
      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          <div className="product-neutral" aria-label="Produto sem fotografia">
            LP · Catálogo local
          </div>
          <dl className="profile-details">
            <div>
              <dt>Código</dt>
              <dd>{viewing.code}</dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>{originLabels[viewing.origin]}</dd>
            </div>
            <div>
              <dt>Preço por unidade inteira</dt>
              <dd>{formatMoney(viewing.sellingPriceCents)}</dd>
            </div>
            {Object.hasOwn(viewing, 'estimatedCostCents') && (
              <div>
                <dt>Custo unitário estimado</dt>
                <dd>
                  {viewing.estimatedCostCents === null || viewing.estimatedCostCents === undefined
                    ? 'Não informado'
                    : formatMoney(viewing.estimatedCostCents)}
                </dd>
              </div>
            )}
            <div>
              <dt>Descrição</dt>
              <dd className="plain-text">{viewing.description || 'Não informada'}</dd>
            </div>
            <div>
              <dt>Armazenamento</dt>
              <dd className="plain-text">{viewing.storageInstructions || 'Não informado'}</dd>
            </div>
            <div>
              <dt>Referência de validade</dt>
              <dd>{viewing.shelfLifeReference || 'Não informada'}</dd>
            </div>
          </dl>
          <p className="info-note">
            Referência de catálogo; nenhuma validade de lote, quantidade disponível ou rentabilidade
            foi calculada.
          </p>
          <Button variant="secondary" onClick={() => setViewing(null)}>
            Fechar produto
          </Button>
        </Modal>
      )}
    </>
  );
}
function ProductForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: ProductDto | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [category, setCategory] = useState<CategoryDto | null>(initial?.category ?? null);
  const [origin, setOrigin] = useState(initial?.origin ?? 'PRODUCED');
  const [price, setPrice] = useState(initial ? moneyInput(initial.sellingPriceCents) : '');
  const [cost, setCost] = useState(
    initial?.estimatedCostCents !== undefined && initial.estimatedCostCents !== null
      ? moneyInput(initial.estimatedCostCents)
      : '',
  );
  const [active, setActive] = useState(initial?.active ?? true);
  const [zero, setZero] = useState(initial?.sellingPriceCents === 0);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [storage, setStorage] = useState(initial?.storageInstructions ?? '');
  const [shelf, setShelf] = useState(initial?.shelfLifeReference ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    let body: unknown;
    try {
      body = {
        name,
        code,
        categoryId: category?.id,
        origin,
        sellingPriceCents: parseMoney(price),
        estimatedCostCents: cost.trim() ? parseMoney(cost) : null,
        active,
        allowZeroPrice: zero,
        description,
        storageInstructions: storage,
        shelfLifeReference: shelf,
        ...(initial ? { version: initial.version, reason } : {}),
      };
    } catch (cause) {
      setError(errorMessage(cause));
      return;
    }
    const parsed = initial
      ? productEditSchema.safeParse(body)
      : productCreateSchema.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os campos do produto.');
      return;
    }
    setBusy(true);
    try {
      await authRequest(initial ? `/products/${initial.id}` : '/products', savedProductSchema, {
        method: initial ? 'PATCH' : 'POST',
        body: parsed.data,
      });
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
      setConflict(cause instanceof AuthError && cause.code === 'STALE_RECORD');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={initial ? 'Editar produto' : 'Novo produto'} onClose={onClose}>
      <form
        className="auth-form"
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <div className="form-grid">
          <Field
            label="Nome do produto"
            required
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
          <Field
            label="Código interno / SKU"
            required
            value={code}
            maxLength={32}
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value)}
          />
          <Filter
            label="Origem"
            value={origin}
            onChange={(e) => setOrigin(productOriginSchema.parse(e.target.value))}
          >
            {productOriginSchema.options.map((value) => (
              <option key={value} value={value}>
                {originLabels[value]}
              </option>
            ))}
          </Filter>
          <Field
            label="Preço de venda por unidade (R$)"
            required
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setZero(false);
            }}
            hint="Exemplo: 12,50. Somente unidades inteiras."
          />
          <Field
            label="Custo unitário estimado (R$, opcional)"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            hint="Uma estimativa opcional; não representa lucro do produto."
          />
        </div>
        <CategoryChoice required value={category} onChange={setCategory} />
        <label className="checkbox-label">
          <input type="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} />{' '}
          Confirmo preço zero quando informado
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{' '}
          Produto ativo
        </label>
        <details className="optional-fields" open={Boolean(initial)}>
          <summary>Descrição e referências opcionais</summary>
          <TextArea
            label="Descrição (opcional)"
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
          />
          <TextArea
            label="Instruções de armazenamento (opcional)"
            value={storage}
            maxLength={500}
            onChange={(e) => setStorage(e.target.value)}
          />
          <Field
            label="Referência de validade (opcional)"
            value={shelf}
            maxLength={300}
            onChange={(e) => setShelf(e.target.value)}
            hint="Texto de referência; não calcula vencimento ou disponibilidade."
          />
        </details>
        {initial && (
          <Filter
            label="Motivo da edição"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">Escolha um motivo</option>
            <option value="CATALOG_CORRECTION">Correção do catálogo</option>
            <option value="PRICE_REVIEW">Revisão do preço</option>
          </Filter>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {conflict && (
          <Button variant="secondary" onClick={onSaved}>
            Fechar e recarregar (descarta edições)
          </Button>
        )}
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" busy={busy}>
            Salvar produto
          </Button>
        </div>
      </form>
    </Modal>
  );
}
