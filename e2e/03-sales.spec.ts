import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { pickupLocalOf, orderDetailSchema } from '@pommier/shared';
import { ensureOwner, mutationHeaders, ownerPassword } from './auth-fixture.js';
let categoryId = '';
let serial = 0;
const fixtureId = randomUUID().slice(0, 8);
test.beforeEach(async ({ page }, info) => {
  await ensureOwner(page);
  if (!categoryId) {
    const r = await page.request.post('/api/categories', {
      headers: mutationHeaders,
      data: { name: `Synthetic Phase 5 browser category ${fixtureId}` },
    });
    expect(r.status()).toBe(201);
    categoryId = (await r.json()).category.id;
  }
  if (!info.title.startsWith('explicit cash opening')) {
    const state = await (await page.request.get('/api/cash-sessions/current')).json();
    if (!state.session) await command(page, '/cash-sessions', { openingFloatCents: '10000' });
  }
});
async function command(page: Page, url: string, payload: unknown, key = randomUUID()) {
  const r = await page.request.post(`/api${url}`, {
    headers: mutationHeaders,
    data: { key, payload },
  });
  expect(r.status(), (await r.json()).error?.code).toBe(200);
  return r.json() as Promise<{ targetId: string; operationId: string; batchId: string }>;
}
async function product(page: Page, stock = 10, name?: string) {
  const n = ++serial;
  const r = await page.request.post('/api/products', {
    headers: mutationHeaders,
    data: {
      code: `F5-${fixtureId}-${n}`,
      name: name ?? `Fase 5 Sintético ${String(n).padStart(3, '0')}`,
      categoryId,
      origin: 'BOTH',
      sellingPriceCents: 1250,
      estimatedCostCents: 333,
    },
  });
  expect(r.status()).toBe(201);
  const p = (await r.json()).product as { id: string; name: string; code: string; version: number };
  if (stock)
    await command(page, '/inventory/opening', {
      productId: p.id,
      quantity: stock,
      reason: 'INITIAL_COUNT',
      batch: { reference: `F5-BROWSER-${n}`, expiresAt: '2099-01-01' },
    });
  return p;
}
async function customer(page: Page) {
  const r = await page.request.post('/api/customers', {
    headers: mutationHeaders,
    data: { name: `Cliente Sintético Fase 5 ${++serial}` },
  });
  expect(r.status()).toBe(201);
  return (await r.json()).customer as { id: string; name: string };
}
const line = (p: Awaited<ReturnType<typeof product>>, quantity = 1) => ({
  productId: p.id,
  quantity,
  productVersion: p.version,
  unitPriceCents: 1250,
});
async function detail(page: Page, id: string) {
  return orderDetailSchema.parse(await (await page.request.get(`/api/orders/${id}`)).json()).order;
}
async function draft(
  page: Page,
  p: Awaited<ReturnType<typeof product>>,
  c?: Awaited<ReturnType<typeof customer>>,
) {
  const selected = c ?? (await customer(page));
  return command(page, '/orders', {
    source: 'WHATSAPP',
    customerId: selected.id,
    pickupLocal: pickupLocalOf(new Date(Date.now() + 7200000)),
    lines: [line(p)],
  });
}
async function apiReady(page: Page, id: string) {
  const o = await detail(page, id);
  await command(page, `/orders/${id}/confirm`, {
    version: o.version,
    expectedTotalCents: o.totalCents,
  });
  for (const to of ['PREPARING', 'READY'])
    await command(page, `/orders/${id}/progress`, {
      version: (await detail(page, id)).version,
      to,
    });
}
async function apiPay(page: Page, id: string) {
  const o = await detail(page, id);
  await command(page, `/orders/${id}/payment`, {
    version: o.version,
    payment: { amountCents: o.totalCents, method: 'PIX', manuallyConfirmed: true },
  });
}
async function openOrder(page: Page, id: string) {
  const o = await detail(page, id);
  await page.goto('/#orders');
  await page
    .getByRole('searchbox', { name: 'Buscar pedido por número ou cliente' })
    .fill(`PED-${String(o.number).padStart(6, '0')}`);
  await page
    .getByRole('button', {
      name: `Abrir pedido PED-${String(o.number).padStart(6, '0')}`,
      exact: true,
    })
    .click();
  await expect(page.getByRole('dialog')).toContainText(o.items[0]!.productName);
}
async function addProduct(page: Page, p: Awaited<ReturnType<typeof product>>) {
  await page
    .getByRole('dialog')
    .getByRole('searchbox', { name: 'Buscar produto para venda' })
    .fill(p.name);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: `Adicionar ${p.name}`, exact: true })
    .click();
}
async function selectCustomer(page: Page, c: Awaited<ReturnType<typeof customer>>) {
  await page
    .getByRole('dialog')
    .getByRole('searchbox', { name: 'Buscar cliente para o pedido' })
    .fill(c.name);
  await page.getByLabel('Cliente do pedido', { exact: true }).selectOption(c.id);
}
async function newSale(page: Page, p: Awaited<ReturnType<typeof product>>) {
  await page.goto('/#sales');
  await page.getByRole('button', { name: 'Nova venda de balcão', exact: true }).click();
  await addProduct(page, p);
}
async function paymentFields(page: Page, method = 'PIX') {
  await page.getByLabel('Forma de pagamento', { exact: true }).selectOption(method);
  if (method === 'CASH') await page.getByLabel('Dinheiro recebido em R$').fill('20,00');
  await page
    .getByLabel('Confirmo que o valor integral foi recebido e conferido fora do sistema.')
    .check();
}
async function action(page: Page, label: string) {
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: label, exact: true }),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
}
test('explicit cash opening is required and linked cash control does not claim bank verification', async ({
  page,
}) => {
  await page.goto('/#sales');
  await expect(page.getByText('Nenhuma sessão de caixa aberta', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nenhuma venda encontrada' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir sessão de caixa', exact: true }).click();
  await page.getByLabel('Fundo inicial contado em R$').fill('100,00');
  await page.getByRole('button', { name: 'Confirmar abertura' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Sessão de caixa aberta', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Confira movimentos, contagem, diferenças e fechamento no módulo Caixa.', {
      exact: false,
    }),
  ).toBeVisible();
});
test('POS confirms anonymous cash sale, change and non-fiscal detail using real stock', async ({
  page,
}, info) => {
  const p = await product(page);
  await newSale(page, p);
  await paymentFields(page, 'CASH');
  await expect(page.getByRole('dialog')).toContainText('R$\u00a07,50');
  await page
    .getByRole('button', { name: 'Confirmar venda, pagamento e entrega', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: /Pedido PED-/ }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Entregue');
  await expect(page.getByRole('dialog')).toContainText('Comprovante interno não fiscal');
  await expect(page.getByRole('dialog')).toContainText('R$\u00a012,50');
  await page.screenshot({ path: info.outputPath('sale-receipt-desktop.png'), fullPage: true });
});
test('POS validates whole units and explicit manual Pix confirmation', async ({ page }) => {
  const p = await product(page);
  await newSale(page, p);
  const qty = page.getByLabel(`Quantidade de ${p.name}`, { exact: true });
  await qty.fill('0');
  await paymentFields(page);
  await expect(
    page.getByRole('button', { name: 'Confirmar venda, pagamento e entrega' }),
  ).toBeDisabled();
  expect((await (await page.request.get(`/api/orders?q=${p.code}`)).json()).total).toBe(0);
  await qty.fill('1');
  await page
    .getByLabel('Confirmo que o valor integral foi recebido e conferido fora do sistema.')
    .uncheck();
  await page.getByRole('button', { name: 'Confirmar venda, pagamento e entrega' }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Nova venda de balcão' }),
  ).toBeVisible();
  await page
    .getByLabel('Confirmo que o valor integral foi recebido e conferido fora do sistema.')
    .check();
  await page.getByRole('button', { name: 'Confirmar venda, pagamento e entrega' }).click();
  await expect(page.getByRole('dialog')).toContainText('Recebimento confirmado manualmente');
});
test('WhatsApp draft requires customer and Fortaleza pickup, edits and confirms real reservations', async ({
  page,
}, info) => {
  const p = await product(page);
  const c = await customer(page);
  await page.goto('/#orders');
  await page.getByRole('button', { name: 'Novo pedido manual' }).click();
  await addProduct(page, p);
  await selectCustomer(page, c);
  await page
    .getByLabel('Retirada agendada (horário de Fortaleza)')
    .fill(pickupLocalOf(new Date(Date.now() + 7200000)));
  await page.getByLabel('Nome de quem retira (opcional)').fill('Coletor Sintético');
  await page
    .getByLabel('Orientação de coleta por terceiro (opcional)')
    .fill('Terceiro combinado pelo cliente; sem entrega da loja.');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page.getByRole('dialog')).toContainText('Rascunho sem reserva');
  await page.getByRole('button', { name: 'Editar rascunho', exact: true }).click();
  await page.getByLabel(`Quantidade de ${p.name}`, { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page.getByRole('dialog')).toContainText('R$\u00a025,00');
  await action(page, 'Confirmar pedido e reservar');
  await expect(page.getByRole('dialog')).toContainText('Reservas verificadas');
  await expect(page.getByRole('dialog')).toContainText('Coletor Sintético');
  await page.screenshot({ path: info.outputPath('whatsapp-order-desktop.png'), fullPage: true });
});
test('payment before pickup preserves physical units, then ready handover consumes once', async ({
  page,
}) => {
  const p = await product(page);
  const d = await draft(page, p);
  const o = await detail(page, d.targetId);
  await command(page, `/orders/${o.id}/confirm`, {
    version: o.version,
    expectedTotalCents: o.totalCents,
  });
  await openOrder(page, o.id);
  await page.getByRole('button', { name: 'Registrar pagamento integral', exact: true }).click();
  await paymentFields(page);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Registrar pagamento integral', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Pago');
  let stock = await (await page.request.get(`/api/inventory/products/${p.id}/batches`)).json();
  expect(stock.items[0]).toMatchObject({ physical: '10', reserved: '1' });
  await action(page, 'Iniciar preparação');
  await action(page, 'Marcar como pronto');
  await action(page, 'Entregar pedido');
  await expect(page.getByRole('dialog')).toContainText('Reserva consumida na entrega');
  stock = await (await page.request.get(`/api/inventory/products/${p.id}/batches`)).json();
  expect(stock.items[0]).toMatchObject({ physical: '9', reserved: '0' });
});
test('unpaid ready order cannot be handed over; payment at pickup enables it', async ({ page }) => {
  const p = await product(page);
  const d = await draft(page, p);
  await apiReady(page, d.targetId);
  await openOrder(page, d.targetId);
  await expect(page.getByRole('button', { name: 'Entregar pedido', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Registrar pagamento integral', exact: true }).click();
  await paymentFields(page, 'DEBIT_CARD');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Registrar pagamento integral', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Entregar pedido', exact: true })).toBeEnabled();
  await action(page, 'Entregar pedido');
  await expect(page.getByRole('dialog')).toContainText('Entregue');
});
test('unpaid cancellation releases reservations and preserves cancelled history', async ({
  page,
}) => {
  const p = await product(page);
  const d = await draft(page, p);
  await apiReady(page, d.targetId);
  await openOrder(page, d.targetId);
  await page.getByRole('button', { name: 'Cancelar pedido', exact: true }).click();
  await page.getByLabel('Motivo da operação').selectOption('CUSTOMER_REQUEST');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancelar pedido', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Cancelado');
  expect(
    (await (await page.request.get(`/api/inventory/products/${p.id}/batches`)).json()).items[0],
  ).toMatchObject({ physical: '10', reserved: '0' });
});
test('paid cancellation records explicit full original-method refund and release', async ({
  page,
}) => {
  const p = await product(page);
  const d = await draft(page, p);
  await apiReady(page, d.targetId);
  await apiPay(page, d.targetId);
  await openOrder(page, d.targetId);
  await page.getByRole('button', { name: 'Cancelar e registrar reembolso', exact: true }).click();
  await page.getByLabel('Motivo da operação').selectOption('CUSTOMER_REQUEST');
  await page
    .getByLabel('Confirmo que o reembolso integral externo foi realizado pelo método original.')
    .check();
  await page
    .getByRole('button', { name: 'Confirmar cancelamento e registro do reembolso', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Reembolsado');
  expect((await detail(page, d.targetId)).refund?.method).toBe('PIX');
});
test('fulfilled refund preserves delivery and customer totals distinguish payments and refunds', async ({
  page,
}) => {
  const p = await product(page);
  const c = await customer(page);
  const sold = await command(page, '/sales/checkout', {
    draft: { source: 'COUNTER', customerId: c.id, lines: [line(p)] },
    payment: { method: 'PIX', amountCents: '1250', manuallyConfirmed: true },
  });
  await page.goto('/#customers');
  await page.getByRole('searchbox', { name: 'Buscar cliente', exact: true }).fill(c.name);
  await page.getByRole('button', { name: `Abrir perfil de ${c.name}` }).click();
  await expect(
    page.getByRole('heading', { name: 'Pedidos, compras e pagamentos registrados' }),
  ).toBeVisible();
  const o = await detail(page, sold.targetId);
  await page
    .getByRole('table', { name: 'Histórico de pedidos do cliente' })
    .getByRole('button', { name: `PED-${String(o.number).padStart(6, '0')}` })
    .click();
  await page.getByRole('button', { name: 'Registrar reembolso integral', exact: true }).click();
  await page.getByLabel('Motivo da operação').selectOption('QUALITY_ISSUE');
  await page
    .getByLabel('Confirmo que o reembolso integral externo foi realizado pelo método original.')
    .check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Registrar reembolso integral', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Não houve reposição automática');
  await page.getByRole('button', { name: 'Fechar pedido', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Histórico de pedidos do cliente' })).toContainText(
    'Reembolsado',
  );
  const history = await (await page.request.get(`/api/customers/${c.id}/order-history`)).json();
  expect(history).toMatchObject({
    fulfilledTotalCents: '1250',
    paymentsReceivedCents: '1250',
    refundsCents: '1250',
  });
});
test('cart price change requires explicit refresh and review before charging the recorded amount', async ({
  page,
}) => {
  const p = await product(page);
  await newSale(page, p);
  await paymentFields(page);
  const changed = await page.request.patch(`/api/products/${p.id}`, {
    headers: mutationHeaders,
    data: {
      code: p.code,
      name: p.name,
      categoryId,
      origin: 'BOTH',
      sellingPriceCents: 1500,
      version: p.version,
      reason: 'CATALOG_CORRECTION',
    },
  });
  expect(changed.status()).toBe(200);
  await page.getByRole('button', { name: 'Confirmar venda, pagamento e entrega' }).click();
  await expect(page.getByRole('alert')).toContainText('Preço ou versão do produto mudou');
  await page.getByRole('button', { name: 'Atualizar catálogo e revisar carrinho' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Catálogo atualizado no carrinho' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('R$\u00a015,00');
  await page.getByRole('button', { name: 'Confirmar venda, pagamento e entrega' }).click();
  await expect(page.getByRole('dialog')).toContainText('Entregue');
});
test('stale draft edit offers safe close/reload without overwriting another edit', async ({
  page,
}) => {
  const p = await product(page);
  const d = await draft(page, p);
  await openOrder(page, d.targetId);
  await page.getByRole('button', { name: 'Editar rascunho', exact: true }).click();
  const current = await detail(page, d.targetId);
  await command(page, `/orders/${d.targetId}/edit`, {
    version: current.version,
    draft: {
      source: 'WHATSAPP',
      customerId: current.customer!.id,
      pickupLocal: pickupLocalOf(current.pickupAt!),
      lines: [line(p)],
      notes: 'Revisão sintética concorrente',
    },
  });
  await page
    .getByLabel('Observações operacionais do pedido (opcional)')
    .fill('Edição obsoleta sintética');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page.getByRole('alert')).toContainText('Este pedido mudou');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Revisão sintética concorrente');
});
for (const resolution of ['retry', 'lookup'])
  test(`lost checkout response resolves by ${resolution} without another payment or stock consumption`, async ({
    page,
  }) => {
    const p = await product(page);
    await newSale(page, p);
    await paymentFields(page);
    let requests = 0;
    await page.route('**/api/sales/checkout', async (route) => {
      requests++;
      if (requests === 1) {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort('failed');
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Confirmar venda, pagamento e entrega' }).click();
    await expect(
      page.getByRole('heading', { name: 'Resultado ainda não confirmado' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('button', {
        name: resolution === 'retry' ? 'Repetir mesma solicitação' : 'Verificar resultado',
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog')).toContainText('Comprovante interno não fiscal');
    expect(
      (await (await page.request.get(`/api/inventory/products/${p.id}/batches`)).json()).items[0]
        .physical,
    ).toBe('9');
    expect(requests).toBe(resolution === 'retry' ? 2 : 1);
  });
for (const role of ['CASHIER', 'MANAGER', 'PRODUCTION'] as const)
  test(`${role} sees only authorized sales/customer/payment actions`, async ({ page }) => {
    const r = await page.request.post('/api/users', {
      headers: mutationHeaders,
      data: {
        loginIdentifier: `phase5-${role.toLowerCase()}`,
        displayName: 'Funcionário sintético fase 5',
        password: ownerPassword,
        role,
      },
    });
    expect(r.status()).toBe(201);
    const user = (await r.json()).user;
    const login = await page.request.post('/api/auth/login', {
      headers: mutationHeaders,
      data: { loginIdentifier: user.loginIdentifier, password: ownerPassword },
    });
    expect(login.status()).toBe(200);
    await page.goto('/#sales');
    if (role === 'PRODUCTION') {
      await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
      await expect(
        page.getByRole('navigation').getByRole('button', { name: 'Vendas', exact: true }),
      ).toHaveCount(0);
      expect((await page.request.get('/api/orders')).status()).toBe(403);
    } else {
      await expect(
        page.getByRole('button', { name: 'Nova venda de balcão', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Nova venda de balcão', exact: true }).click();
      await expect(page.getByLabel('Desconto total em R$', { exact: true })).toHaveCount(
        role === 'MANAGER' ? 1 : 0,
      );
      expect(
        (
          await page.request.post(`/api/orders/${randomUUID()}/refund`, {
            headers: mutationHeaders,
            data: { key: randomUUID(), payload: {} },
          })
        ).status(),
      ).toBe(403);
      await page.keyboard.press('Escape');
    }
    await ensureOwner(page);
    const off = await page.request.patch(`/api/users/${user.id}`, {
      headers: mutationHeaders,
      data: {
        displayName: user.displayName,
        role,
        active: false,
        version: user.version,
        reason: 'Synthetic Phase 5 role scenario complete',
      },
    });
    expect(off.status()).toBe(200);
  });
test('order search, source/state/payment/pickup filters and pagination use real records', async ({
  page,
}) => {
  const p = await product(page);
  const c = await customer(page);
  for (let n = 0; n < 22; n++) await draft(page, p, c);
  await page.goto('/#orders');
  await page.getByRole('searchbox', { name: 'Buscar pedido por número ou cliente' }).fill(c.name);
  const table = page.getByRole('table', { name: 'Lista de pedidos' });
  await expect(table.getByRole('row')).toHaveCount(21);
  await page.locator('.registry-table').getByRole('button', { name: 'Próxima página' }).click();
  await expect(table.getByRole('row')).toHaveCount(3);
  await page.getByLabel('Situação da entrega').selectOption('DRAFT');
  await page.getByLabel('Origem do filtro de pedidos').selectOption('WHATSAPP');
  await page.getByLabel('Situação do pagamento').selectOption('UNPAID');
  await expect(table.getByRole('row')).toHaveCount(21);
  await page.getByLabel('Situação do pagamento').selectOption('PAID');
  await expect(page.getByRole('heading', { name: 'Nenhum pedido encontrado' })).toBeVisible();
});
test('sales/order keyboard dialogs, desktop and narrow layouts pass relevant Axe checks', async ({
  page,
}, info) => {
  const p = await product(
    page,
    10,
    'Produto sintético com nome longo para conferir quebra de linha e leitura no balcão',
  );
  for (const hash of ['sales', 'orders']) {
    await page.goto(`/#${hash}`);
    await expect(
      page.getByRole('heading', { name: hash === 'sales' ? 'Vendas' : 'Pedidos', exact: true }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await newSale(page, p);
  expect(await page.getByRole('dialog').evaluate((d) => d.clientWidth)).toBeGreaterThan(900);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('pos-desktop.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await newSale(page, p);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.getByRole('dialog').evaluate((d) => d.scrollWidth <= d.clientWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('pos-narrow.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.goto('/#orders');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('orders-narrow.png'), fullPage: true });
});
