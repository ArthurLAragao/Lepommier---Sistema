import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  draftInput,
  draftEdit,
  checkoutInput,
  saleCatalogSchema,
  saleProduct,
  cashCurrentSchema,
  priceCart,
  formatOrderMoney,
  parseMoney,
  pickupLocalOf,
  hasPermission,
  type OrderDetail,
  type CurrentUser,
  type CategoryDto,
} from '@pommier/shared';
import { Button, Field, Filter, Search, Pagination, EmptyState, Badge } from '../components/ui.js';
import { Modal } from '../auth/AccountSettings.js';
import { authRequest } from '../auth/api.js';
import { DataStatus, TextArea } from '../registry/ui.js';
import { useRegistryData, errorMessage } from '../registry/data.js';
import { CategoryChoice } from '../registry/Catalog.js';
import { useStockCommand } from '../inventory/data.js';
import { CommandFeedback, CommandButtons } from '../inventory/common.js';
import {
  CustomerChoice,
  PaymentFields,
  ManualPaymentNotice,
  type CustomerChoiceValue,
} from './common.js';
import { usePaymentFields, moneyInput } from './data.js';
type Product = z.infer<typeof saleProduct>;
type Cart = Product & { quantity: number };
export default function OrderEditor({
  mode,
  current,
  initial,
  onClose,
  onDone,
}: {
  mode: 'checkout' | 'draft' | 'edit';
  current: CurrentUser;
  initial?: OrderDetail;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<CategoryDto | null>(null);
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ q, page: String(page) });
  if (category) query.set('categoryId', category.id);
  const result = useRegistryData(`/sales/catalog?${query}`, saleCatalogSchema);
  const cash = useRegistryData('/cash-sessions/current', cashCurrentSchema);
  const [cart, setCart] = useState<Cart[]>(
    () =>
      initial?.items.map((i) => ({
        id: i.productId,
        code: i.productCode,
        name: i.productName,
        version: i.productVersion,
        sellingPriceCents: i.unitPriceCents,
        quantity: i.quantity,
        active: true,
        categoryId: '',
        available: '0',
        consistent: true,
      })) ?? [],
  );
  const [source, setSource] = useState<'COUNTER' | 'WHATSAPP'>(
    mode === 'checkout' ? 'COUNTER' : (initial?.source ?? 'WHATSAPP'),
  );
  const [customer, setCustomer] = useState<CustomerChoiceValue | null>(initial?.customer ?? null);
  const [pickup, setPickup] = useState(() =>
    initial?.pickupAt
      ? pickupLocalOf(initial.pickupAt)
      : pickupLocalOf(new Date(Date.now() + 3600000)),
  );
  const [pickupPerson, setPickupPerson] = useState(initial?.pickupPerson ?? '');
  const [collectionNote, setCollectionNote] = useState(initial?.collectionNote ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [discount, setDiscount] = useState(moneyInput(initial?.discountCents ?? '0'));
  const [discountReason, setDiscountReason] = useState(initial?.discountReason ?? '');
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState('');
  const payment = usePaymentFields();
  const command = useStockCommand(
    mode === 'checkout' ? '/sales/checkout' : initial ? `/orders/${initial.id}/edit` : '/orders',
    (result) => onDone(result.targetId),
    '/sales/operations',
  );
  let total = '0';
  let subtotal = '0';
  let discountCents = '0';
  let priceError = '';
  try {
    discountCents = String(parseMoney(discount));
    const price = priceCart(
      cart.map((p) => ({ quantity: p.quantity, unitPriceCents: p.sellingPriceCents })),
      discountCents,
    );
    total = price.totalCents;
    subtotal = price.subtotalCents;
  } catch {
    priceError = 'Revise as quantidades, o desconto e o limite de R$ 999.999,99.';
  }
  function add(product: Product) {
    setCart((previous) =>
      previous.some((p) => p.id === product.id)
        ? previous.map((p) =>
            p.id === product.id ? { ...p, quantity: Math.min(p.quantity + 1, 100000) } : p,
          )
        : [...previous, { ...product, quantity: 1 }],
    );
    setMessage('');
  }
  async function review() {
    setReviewing(true);
    try {
      const latest = await Promise.all(
        cart.map((p) => authRequest(`/sales/products/${p.id}`, saleProduct)),
      );
      setCart((previous) =>
        previous.map((p) => ({ ...latest.find((i) => i.id === p.id)!, quantity: p.quantity })),
      );
      result.refresh();
      setMessage(
        'Catálogo atualizado no carrinho. Confira preços, situação e total antes de confirmar.',
      );
      command.setError('');
    } catch (cause) {
      command.setError(errorMessage(cause));
    } finally {
      setReviewing(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (reviewing) return;
    try {
      const draft = draftInput.parse({
        source,
        customerId: customer?.id ?? null,
        pickupLocal: source === 'WHATSAPP' ? pickup : null,
        pickupPerson: source === 'WHATSAPP' ? pickupPerson : null,
        collectionNote: source === 'WHATSAPP' ? collectionNote : null,
        notes,
        lines: cart.map((p) => ({
          productId: p.id,
          quantity: p.quantity,
          productVersion: p.version,
          unitPriceCents: p.sellingPriceCents,
        })),
        discountCents,
        discountReason: BigInt(discountCents) > 0n ? discountReason : null,
      });
      const payload =
        mode === 'checkout'
          ? checkoutInput.parse({ draft, payment: payment.value(total) })
          : initial
            ? draftEdit.parse({ version: initial.version, draft })
            : draft;
      void command.send(payload);
    } catch (cause) {
      command.setError(
        cause instanceof z.ZodError
          ? (cause.issues[0]?.message ?? 'Revise o formulário.')
          : errorMessage(cause),
      );
    }
  }
  const blocked = command.busy || command.uncertain;
  return (
    <Modal
      title={
        mode === 'checkout'
          ? 'Nova venda de balcão'
          : initial
            ? 'Editar rascunho'
            : 'Novo pedido manual'
      }
      onClose={() => command.close(onClose)}
    >
      <form className="auth-form pos-editor" onSubmit={submit}>
        <p>
          {mode === 'checkout'
            ? 'Confirmação única grava venda, pagamento manual e entrega com estoque, ou não grava nenhum deles.'
            : 'Rascunho não reserva estoque. Confirmar fixa preços e reserva unidades elegíveis; alterações posteriores exigem cancelar e recriar.'}
        </p>
        <fieldset className="stock-fieldset" disabled={blocked || reviewing}>
          <legend>Produtos e carrinho</legend>
          <div className="pos-layout">
            <section>
              <h3>Escolher produtos</h3>
              <Search
                label="Buscar produto para venda"
                value={q}
                placeholder="Nome ou código"
                maxLength={120}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
              <CategoryChoice
                value={category}
                onChange={(c) => {
                  setCategory(c);
                  setPage(1);
                }}
              />
              <DataStatus {...result} retry={result.refresh} />
              <div className="pos-products">
                {result.data?.items.map((p) => (
                  <article className="pos-product" key={p.id}>
                    <div>
                      <strong>{p.name}</strong>
                      <small>{p.code}</small>
                      <p>{formatOrderMoney(String(p.sellingPriceCents))} / un.</p>
                      <Badge tone={p.consistent ? 'neutral' : 'warning'}>
                        {p.consistent ? `${p.available} un. disponíveis` : 'Conciliação necessária'}
                      </Badge>
                    </div>
                    <Button
                      variant="secondary"
                      aria-label={`Adicionar ${p.name}`}
                      disabled={
                        !p.consistent ||
                        p.available === '0' ||
                        (!cart.some((i) => i.id === p.id) && cart.length >= 20)
                      }
                      onClick={() => add(p)}
                    >
                      Adicionar
                    </Button>
                  </article>
                ))}
              </div>
              {result.data && !result.data.items.length && (
                <EmptyState
                  title="Nenhum produto vendável encontrado"
                  description="Confira os filtros, o catálogo e o estoque registrado. Nenhum produto foi criado automaticamente."
                />
              )}
              <Pagination
                page={page}
                pageCount={Math.max(1, Math.ceil((result.data?.total ?? 0) / 20))}
                onChange={setPage}
              />
            </section>
            <section className="pos-cart">
              <h3>Carrinho</h3>
              {!cart.length ? (
                <p>Adicione produtos para começar.</p>
              ) : (
                <ul>
                  {cart.map((p) => (
                    <li key={p.id}>
                      <strong>{p.name}</strong>
                      <p>{formatOrderMoney(String(p.sellingPriceCents))} por unidade</p>
                      {!p.active && (
                        <p className="form-error">Produto desativado; remova ou peça revisão.</p>
                      )}
                      <Field
                        label={`Quantidade de ${p.name}`}
                        type="number"
                        required
                        min={1}
                        max={100000}
                        step={1}
                        value={p.quantity}
                        onChange={(e) =>
                          setCart((items) =>
                            items.map((i) =>
                              i.id === p.id ? { ...i, quantity: Number(e.target.value) } : i,
                            ),
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        aria-label={`Remover ${p.name}`}
                        onClick={() => setCart((items) => items.filter((i) => i.id !== p.id))}
                      >
                        Remover
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="secondary"
                busy={reviewing}
                disabled={!cart.length}
                onClick={() => {
                  void review();
                }}
              >
                Atualizar catálogo e revisar carrinho
              </Button>
              {hasPermission(current.user.role, 'orders.discount') && (
                <>
                  <Field
                    label="Desconto total em R$"
                    inputMode="decimal"
                    required
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                  {BigInt(discountCents) > 0n && (
                    <Filter
                      label="Motivo do desconto"
                      required
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                    >
                      <option value="">Escolha</option>
                      <option value="PROMOTION">Promoção autorizada</option>
                      <option value="PRICE_AGREEMENT">Acordo de preço</option>
                      <option value="COURTESY">Cortesia parcial</option>
                    </Filter>
                  )}
                </>
              )}
              <dl className="pos-totals">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{formatOrderMoney(subtotal)}</dd>
                </div>
                <div>
                  <dt>Desconto</dt>
                  <dd>{formatOrderMoney(discountCents)}</dd>
                </div>
                <div>
                  <dt>Total integral</dt>
                  <dd>
                    <strong>{formatOrderMoney(total)}</strong>
                  </dd>
                </div>
              </dl>
              {priceError && (
                <p className="form-error" role="alert">
                  {priceError}
                </p>
              )}
            </section>
          </div>
        </fieldset>
        <fieldset className="stock-fieldset" disabled={blocked || reviewing}>
          <legend>Atendimento</legend>
          {mode !== 'checkout' && (
            <Filter
              label="Origem do pedido"
              value={source}
              onChange={(e) => setSource(e.target.value === 'WHATSAPP' ? 'WHATSAPP' : 'COUNTER')}
            >
              <option value="WHATSAPP">WhatsApp digitado pelo funcionário</option>
              <option value="COUNTER">Balcão</option>
            </Filter>
          )}
          <CustomerChoice
            value={customer}
            onChange={setCustomer}
            required={source === 'WHATSAPP'}
          />
          {source === 'WHATSAPP' && (
            <>
              <Field
                label="Retirada agendada (horário de Fortaleza)"
                type="datetime-local"
                required
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                hint="Data futura, até 365 dias. Não usamos o fuso do navegador."
              />
              <Field
                label="Nome de quem retira (opcional)"
                maxLength={120}
                value={pickupPerson}
                onChange={(e) => setPickupPerson(e.target.value)}
              />
              <TextArea
                label="Orientação de coleta por terceiro (opcional)"
                maxLength={500}
                value={collectionNote}
                onChange={(e) => setCollectionNote(e.target.value)}
              />
              <p>
                Sem entrega da loja, motorista ou rastreamento. WhatsApp é apenas a origem digitada;
                nenhuma mensagem será enviada.
              </p>
            </>
          )}
          <TextArea
            label="Observações operacionais do pedido (opcional)"
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
          />
          <p className="auth-help">
            Evite dados pessoais desnecessários. Observações não criam variantes ou alteram
            estoque/preço.
          </p>
        </fieldset>
        {mode === 'checkout' && (
          <fieldset className="stock-fieldset" disabled={blocked}>
            <legend>Conferir recebimento</legend>
            <DataStatus {...cash} retry={cash.refresh} />
            {cash.data && !cash.data.session && (
              <p className="form-error">
                Nenhuma sessão de caixa aberta. Feche este formulário e solicite abertura explícita
                pelo responsável; não receba outro pagamento para tentar novamente.
              </p>
            )}
            <PaymentFields fields={payment} total={total} />
            <ManualPaymentNotice />
          </fieldset>
        )}
        {message && <p role="status">{message}</p>}
        <CommandFeedback command={command} />
        <p className="auth-help">
          Pedidos com total zero são recusados nesta fase. Não há emissão fiscal ou integração
          bancária. Após recarregar ou sair da tela, revise o histórico antes de repetir uma
          operação incerta.
        </p>
        <CommandButtons
          command={command}
          onClose={onClose}
          disabled={
            reviewing ||
            Boolean(priceError) ||
            cart.length === 0 ||
            (mode === 'checkout' && !cash.data?.session)
          }
          label={mode === 'checkout' ? 'Confirmar venda, pagamento e entrega' : 'Salvar rascunho'}
        />
      </form>
    </Modal>
  );
}
