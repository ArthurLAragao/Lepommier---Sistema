import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  businessDateOf,
  reportPreset,
  shiftBusinessDate,
  formatOrderMoney,
  reportResult,
  dashboardResult,
  type ProductDto,
} from '@pommier/shared';
import { ensureOwner, mutationHeaders, ownerPassword } from './auth-fixture.js';
const marker = randomUUID().slice(0, 8);
let a: ProductDto,
  b: ProductDto,
  customerId = '',
  today = '',
  sessionId = '';
async function post(page: Page, path: string, data: Record<string, unknown>, status = 200) {
  const r = await page.request.post('/api' + path, { headers: mutationHeaders, data });
  expect(r.status(), await r.text()).toBe(status);
  return r.json();
}
const command = (page: Page, path: string, payload: unknown) =>
  post(page, path, { key: randomUUID(), payload });
async function reports(page: Page, kind = 'daily') {
  await page.goto('/#reports?kind=' + kind);
  await expect(page.getByRole('heading', { name: 'Relatórios operacionais' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar relatório' })).toBeVisible();
}
async function selectProduct(page: Page, p: ProductDto) {
  await page.getByText('Filtrar produto, incluindo histórico inativo', { exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar produto nos relatórios' }).fill(p.code);
  await expect(page.getByRole('option', { name: new RegExp(p.code) })).toBeAttached();
  await page
    .getByRole('combobox', { name: 'Produto do histórico', exact: true })
    .selectOption(p.id);
  await expect(page.getByRole('button', { name: 'Atualizar relatório' })).toBeVisible();
}
async function dashboard(page: Page) {
  await page.goto('/#overview');
  await expect(page.locator('.dashboard-metrics .dashboard-metric')).toHaveCount(4);
}
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await ensureOwner(page);
    const status = await (await page.request.get('/api/system/status')).json();
    today = status.businessDate;
    expect(today).toBe(businessDateOf(status.timestamp));
    const current = await (await page.request.get('/api/cash/current')).json();
    if (current.session) {
      const d = await (await page.request.get('/api/cash/sessions/' + current.session.id)).json();
      await command(page, '/cash/close', {
        sessionId: d.session.id,
        activityVersion: d.session.activityVersion,
        countedCents: d.totals.expectedCents,
        confirmed: true,
      });
    }
    sessionId = (await command(page, '/cash-sessions', { openingFloatCents: '10000' })).targetId;
    const category = (
      await post(page, '/categories', { name: 'Synthetic reporting browser ' + marker }, 201)
    ).category;
    a = (
      await post(
        page,
        '/products',
        {
          code: 'R7BA-' + marker,
          name: 'Produto histórico sintético ' + marker,
          categoryId: category.id,
          origin: 'BOTH',
          sellingPriceCents: 1250,
          estimatedCostCents: 333,
        },
        201,
      )
    ).product;
    b = (
      await post(
        page,
        '/products',
        {
          code: 'R7BB-' + marker,
          name: '=Produto sintético CSV ' + marker,
          categoryId: category.id,
          origin: 'BOTH',
          sellingPriceCents: 2500,
          estimatedCostCents: 555,
        },
        201,
      )
    ).product;
    customerId = (
      await post(page, '/customers', { name: 'Pessoa sintética de relatório ' + marker }, 201)
    ).customer.id;
    const stock = (
      await command(page, '/inventory/opening', {
        productId: a.id,
        quantity: 10,
        reason: 'INITIAL_COUNT',
        batch: { reference: 'Synthetic report browser opening ' + marker, expiresAt: '2099-01-01' },
      })
    ).targetId;
    await command(page, '/inventory/opening', {
      productId: b.id,
      quantity: 5,
      reason: 'INITIAL_COUNT',
      batch: { reference: 'Synthetic report B ' + marker, expiresAt: '2099-01-01' },
    });
    const prod = (
      await command(page, '/production', {
        productId: a.id,
        plannedQuantity: 7,
        plannedDate: today,
      })
    ).targetId;
    await command(page, `/production/${prod}/transition`, { version: 1, action: 'START' });
    await command(page, `/production/${prod}/complete`, {
      version: 2,
      actualQuantity: 5,
      batch: { reference: 'Synthetic report completed ' + marker, expiresAt: '2099-01-01' },
    });
    await command(page, '/inventory/receipts', {
      productId: b.id,
      quantity: 6,
      supplierReference: 'Synthetic report receipt',
      unitCostCents: 555,
      batch: { reference: 'Synthetic report receipt ' + marker, expiresAt: '2099-01-01' },
    });
    const v = await (await page.request.get('/api/inventory/batches/' + stock)).json();
    await command(page, '/inventory/waste', {
      productId: a.id,
      batchId: stock,
      version: v.batch.version,
      quantity: 1,
      reason: 'DAMAGED',
    });
    for (const [p, method, quantity] of [
      [a, 'PIX', 2],
      [b, 'CASH', 1],
    ] as const) {
      const id = (
        await command(page, '/sales/checkout', {
          draft: {
            source: 'COUNTER',
            lines: [
              {
                productId: p.id,
                productVersion: p.version,
                quantity,
                unitPriceCents: p.sellingPriceCents,
              },
            ],
          },
          payment: {
            method,
            amountCents: '2500',
            manuallyConfirmed: true,
            ...(method === 'CASH' ? { tenderedCents: '3000' } : {}),
          },
        })
      ).targetId;
      if (method === 'CASH') {
        const order = await (await page.request.get('/api/orders/' + id)).json();
        await command(page, `/orders/${id}/refund`, {
          version: order.order.version,
          reason: 'CUSTOMER_REQUEST',
          externalRefundConfirmed: true,
        });
      }
    }
    const order = (
      await command(page, '/orders', {
        source: 'WHATSAPP',
        customerId,
        pickupLocal: shiftBusinessDate(today, 1) + 'T12:00',
        lines: [{ productId: a.id, productVersion: a.version, quantity: 1, unitPriceCents: 1250 }],
      })
    ).targetId;
    let d = await (await page.request.get('/api/orders/' + order)).json();
    await command(page, `/orders/${order}/confirm`, {
      version: d.order.version,
      expectedTotalCents: '1250',
    });
    d = await (await page.request.get('/api/orders/' + order)).json();
    await command(page, `/orders/${order}/payment`, {
      version: d.order.version,
      payment: { amountCents: '1250', method: 'CREDIT_CARD', manuallyConfirmed: true },
    });
    for (const to of ['PREPARING', 'READY']) {
      d = await (await page.request.get('/api/orders/' + order)).json();
      await command(page, `/orders/${order}/progress`, { version: d.order.version, to });
    }
    // This suite's pagination must not depend on orders left by earlier files.
    for (let i = 0; i < 22; i++)
      await command(page, '/orders', {
        source: 'COUNTER',
        lines: [{ productId: a.id, productVersion: a.version, quantity: 1, unitPriceCents: 1250 }],
      });
  } finally {
    await page.close();
  }
});
test.beforeEach(async ({ page }) => {
  await ensureOwner(page);
});
test('owner dashboard displays real separate source totals and generation state', async ({
  page,
}) => {
  const api = dashboardResult.parse(
    await (await page.request.get('/api/reports/dashboard')).json(),
  );
  await dashboard(page);
  for (const [label, key] of [
    ['Vendas entregues hoje', 'net'],
    ['Pagamentos recebidos hoje', 'received'],
    ['Reembolsos registrados hoje', 'refunded'],
    ['Recebimentos líquidos hoje', 'receiptsNet'],
  ] as const) {
    const card = page
      .locator('.dashboard-metric')
      .filter({ has: page.getByRole('link', { name: label, exact: true }) });
    await expect(card).toContainText(formatOrderMoney(api.metrics[key]));
  }
  await expect(page.getByText(/Gerado em/).first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Atenção operacional e integridade atuais' }),
  ).toBeVisible();
  await expect(page.locator('.dashboard-metrics')).not.toContainText('Lucro');
});
test('presets and custom dates use Fortaleza independently of browser timezone', async ({
  page,
}) => {
  await reports(page);
  for (const [preset, label] of [
    ['yesterday', 'Ontem'],
    ['seven', 'Últimos 7 dias'],
    ['month', 'Este mês'],
    ['today', 'Hoje'],
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const q = reportPreset(today, preset);
    await expect(page.getByLabel('Data inicial (Fortaleza)')).toHaveValue(q.from);
    await expect(page.getByLabel('Data final (Fortaleza)')).toHaveValue(q.to);
    await expect(page.getByRole('button', { name: 'Atualizar relatório' })).toBeVisible();
  }
  await page.getByLabel('Data inicial (Fortaleza)').fill(today);
  await page.getByLabel('Data final (Fortaleza)').fill(shiftBusinessDate(today, -1));
  await page.getByRole('button', { name: 'Aplicar período' }).click();
  await expect(page.getByRole('alert')).toContainText('Relatório indisponível');
  await expect(page.locator('.report-totals')).toHaveCount(0);
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(
    'Asia/Tokyo',
  );
});
test('dashboard cards drill into correct fulfillment and refund-recorded reports', async ({
  page,
}) => {
  await dashboard(page);
  await page.getByRole('link', { name: 'Vendas entregues hoje', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Relatório', exact: true })).toHaveValue('sales');
  await expect(page.getByText(/Data da entrega/)).toBeVisible();
  await dashboard(page);
  await page.getByRole('link', { name: 'Reembolsos registrados hoje', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Relatório', exact: true })).toHaveValue(
    'transactions',
  );
  await expect(page.getByRole('combobox', { name: 'Tipo de registro financeiro' })).toHaveValue(
    'REFUND',
  );
  await expect(
    page.getByRole('region', { name: 'Registros de pagamentos e reembolsos' }).last(),
  ).toContainText('Reembolso');
});
test('historical product report survives price/name change and deactivation', async ({ page }) => {
  const r = await page.request.patch('/api/products/' + a.id, {
    headers: mutationHeaders,
    data: {
      code: a.code,
      name: 'Nome atual sintético ' + marker,
      categoryId: a.categoryId,
      origin: a.origin,
      sellingPriceCents: 1500,
      estimatedCostCents: 333,
      active: false,
      version: a.version,
      reason: 'CATALOG_CORRECTION',
    },
  });
  expect(r.status(), await r.text()).toBe(200);
  a = (await r.json()).product;
  await reports(page, 'products');
  await selectProduct(page, a);
  const table = page.getByRole('region', { name: 'Vendas por produto' }).last();
  await expect(table).toContainText(a.name);
  await expect(table).toContainText('Produto histórico sintético ' + marker);
  await expect(table).toContainText('R$ 25,00');
  await expect(table).not.toContainText('R$ 30,00');
});
test('method summaries link to timestamped financial sources and an order', async ({ page }) => {
  await reports(page, 'payments');
  await page.getByRole('combobox', { name: 'Meio de pagamento' }).selectOption('CASH');
  await expect(page.getByRole('button', { name: 'Atualizar relatório' })).toBeVisible();
  await page.getByRole('link', { name: 'Ver registros do dia' }).first().click();
  await expect(page.getByRole('combobox', { name: 'Relatório', exact: true })).toHaveValue(
    'transactions',
  );
  await expect(page.getByRole('button', { name: 'Ver pedido' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Ver pedido' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Comprovante interno não fiscal');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('inventory report keeps historical balances separate and opens real batch records', async ({
  page,
}) => {
  await reports(page, 'inventory');
  await selectProduct(page, a);
  const table = page.getByRole('region', { name: 'Movimentação e conciliação de estoque' }).last();
  await expect(table).toContainText('Físico inicial');
  await expect(table).toContainText('Reservado atual');
  await expect(table).toContainText('Conciliado');
  await page.getByRole('button', { name: 'Ver lotes' }).click();
  await expect(page.getByRole('dialog')).toContainText('Lotes e fontes do produto');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Lote \d+/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText('Detalhes do lote');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Ajustar lote' })).toHaveCount(
    0,
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
});
test('production report uses actual completion and keeps shortfall separate from waste', async ({
  page,
}) => {
  await reports(page, 'production');
  await selectProduct(page, a);
  const table = page.getByRole('region', { name: 'Produção concluída' }).last();
  await expect(table).toContainText('Falta de rendimento');
  await expect(table).toContainText('7');
  await expect(table).toContainText('5');
  await expect(table).toContainText('2');
  await page.getByRole('button', { name: 'Ver lote', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Detalhes do lote');
  await page.keyboard.press('Escape');
});
test('cash report links to existing session detail and preserves physical cash semantics', async ({
  page,
}) => {
  await reports(page, 'cash');
  const link = page.getByRole('link', { name: 'Ver sessão' }).first();
  await expect(link).toHaveAttribute('href', '#cash?sessionId=' + sessionId);
  await link.click();
  await expect(page.getByRole('heading', { name: 'Conferência da sessão de caixa' })).toBeVisible();
  await expect(page.getByText(sessionId, { exact: true })).toBeVisible();
  await expect(page.getByText('Dinheiro físico esperado', { exact: true })).toBeVisible();
});
test('authorized CSV export is explicit formula-safe UTF-8 and unit-labeled', async ({ page }) => {
  await reports(page, 'products');
  await selectProduct(page, b);
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar e baixar CSV' })).toBeDisabled();
  await page.getByLabel('Confirmo o escopo completo e o uso autorizado deste arquivo.').check();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Confirmar e baixar CSV' }).click();
  const file = await pending;
  const body = await readFile((await file.path())!);
  expect(body.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  const text = body.toString('utf8');
  expect(text).toContain("'=Produto sintético CSV " + marker);
  expect(text).toContain('(centavos)');
  for (const forbidden of ['Pessoa sintética de relatório', 'cpf', 'password', 'installation'])
    expect(text).not.toContain(forbidden);
  await expect(page.getByText(/Arquivo gerado em/)).toBeVisible();
});
for (const role of ['MANAGER', 'CASHIER', 'PRODUCTION'] as const)
  test(`${role} reporting scope and backend controls match projections`, async ({ page }) => {
    const login = 'r7-' + role.toLowerCase() + '-' + marker;
    const created = await post(
      page,
      '/users',
      {
        loginIdentifier: login,
        displayName: 'Synthetic reporting ' + role,
        role,
        password: ownerPassword,
      },
      201,
    );
    const user = created.user;
    await page.context().clearCookies();
    await post(page, '/auth/login', { loginIdentifier: login, password: ownerPassword });
    try {
      await page.goto('/#overview');
      await expect(page.getByRole('heading', { name: 'Seu espaço de trabalho' })).toBeVisible();
      await expect(page.locator('.dashboard-metrics')).toHaveCount(0);
      expect((await page.request.get('/api/reports/dashboard')).status()).toBe(403);
      await page.goto('/#reports');
      if (role === 'CASHIER') {
        await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
        expect((await page.request.get('/api/reports/sales')).status()).toBe(403);
      } else {
        await expect(page.getByRole('heading', { name: 'Relatórios operacionais' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Exportar CSV' })).toHaveCount(0);
        if (role === 'PRODUCTION') {
          await expect(
            page.getByRole('option', { name: 'Vendas entregues', exact: true }),
          ).toHaveCount(0);
          expect((await page.request.get('/api/reports/receipts')).status()).toBe(403);
          const d = await (await page.request.get('/api/reports/production')).json();
          expect(JSON.stringify(d)).not.toContain('unitCost');
        } else {
          expect((await page.request.get('/api/reports/payments')).status()).toBe(200);
        }
      }
      expect(
        (
          await page.request.post('/api/reports/sales/export', {
            headers: mutationHeaders,
            data: { from: today, to: today },
          })
        ).status(),
      ).toBe(403);
    } finally {
      await page.context().clearCookies();
      await ensureOwner(page);
      const result = await page.request.patch('/api/users/' + user.id, {
        headers: mutationHeaders,
        data: {
          displayName: user.displayName,
          role,
          active: false,
          version: user.version,
          reason: 'Synthetic report role fixture completed',
        },
      });
      expect(result.status()).toBe(200);
    }
  });
test('empty historical filter is honest and contains no invented operations', async ({ page }) => {
  await reports(page, 'sales');
  await page.getByLabel('Data inicial (Fortaleza)').fill('2000-01-01');
  await page.getByLabel('Data final (Fortaleza)').fill('2000-01-01');
  await page.getByRole('button', { name: 'Aplicar período' }).click();
  await expect(page.getByRole('heading', { name: 'Nenhum registro no filtro' })).toBeVisible();
  await expect(page.locator('.report-totals')).toContainText('R$ 0,00');
});
test('failed dashboard query removes financial cards and retry restores real data', async ({
  page,
}) => {
  await page.route('**/api/reports/dashboard*', (r) => r.abort('connectionfailed'));
  await page.goto('/#overview');
  await expect(page.getByText('Painel indisponível', { exact: true })).toBeVisible();
  await expect(page.locator('.dashboard-metrics')).toHaveCount(0);
  await page.unroute('**/api/reports/dashboard*');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.locator('.dashboard-metric')).toHaveCount(4);
});
test('report source filters stable sorting and pagination keep full totals', async ({ page }) => {
  await reports(page, 'orders');
  await page.getByRole('combobox', { name: 'Origem do pedido' }).selectOption('WHATSAPP');
  await page.getByRole('combobox', { name: 'Situação atual do pedido' }).selectOption('READY');
  const table = page.getByRole('region', { name: 'Entrada e situação de pedidos' }).last();
  await expect(table).toContainText('WhatsApp manual');
  await expect(table).toContainText('Pronto');
  await page.getByRole('combobox', { name: 'Origem do pedido' }).selectOption('');
  await page.getByRole('combobox', { name: 'Situação atual do pedido' }).selectOption('');
  await page.getByRole('combobox', { name: 'Ordenação estável' }).selectOption('asc');
  const api = reportResult.parse(
    await (await page.request.get('/api/reports/orders?direction=asc')).json(),
  );
  await expect(
    page.getByRole('region', { name: 'Entrada e situação de pedidos' }).last(),
  ).toContainText(api.items[0]!.cells.number!);
  await expect(page.getByRole('button', { name: 'Próxima página', exact: true })).toBeEnabled();
  const totals = await page.locator('.report-totals').innerText();
  await page.getByRole('button', { name: 'Próxima página', exact: true }).click();
  await expect(page.getByText(/Página 2 de/)).toBeVisible();
  await expect(page.locator('.report-totals')).toHaveText(totals, { useInnerText: true });
});
test('report export dialog keyboard focus and desktop accessibility remain usable', async ({
  page,
}, info) => {
  await reports(page, 'payments');
  await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('reports-desktop.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('owner dashboard and reporting tables fit narrow layout with accessible controls', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await dashboard(page);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('dashboard-narrow.png') });
  await reports(page, 'cash');
  await expect(
    page.getByRole('region', { name: 'Histórico de sessões de caixa' }).last(),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('reports-narrow.png') });
});
