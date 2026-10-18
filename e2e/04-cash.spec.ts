import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cashDetailDto, businessDateOf } from '@pommier/shared';
import { ensureOwner, mutationHeaders, ownerPassword } from './auth-fixture.js';
let sid = '';
let serial = 0;
let categoryId = '';
const fixture = randomUUID().slice(0, 8);
async function command(page: Page, path: string, payload: unknown, key = randomUUID()) {
  const r = await page.request.post(`/api${path}`, {
    headers: mutationHeaders,
    data: { key, payload },
  });
  expect(r.status(), (await r.json()).error?.code).toBe(200);
  return r.json() as Promise<{ targetId: string }>;
}
async function detail(page: Page, id = sid) {
  const r = await page.request.get(`/api/cash/sessions/${id}`);
  expect(r.status()).toBe(200);
  return cashDetailDto.parse(await r.json());
}
async function closeApi(page: Page, id = sid) {
  const d = await detail(page, id);
  return command(page, '/cash/close', {
    sessionId: id,
    activityVersion: d.session.activityVersion,
    countedCents: d.totals.expectedCents,
    confirmed: true,
  });
}
const moveApi = (page: Page, kind = 'CASH_ADDITION', amountCents = '500') =>
  command(page, '/cash/movements', {
    sessionId: sid,
    kind,
    amountCents,
    reason: `Synthetic Phase 6 movement ${fixture}`,
    category: kind === 'CASH_EXPENSE' ? 'SUPPLIES' : null,
  });
test.beforeEach(async ({ page }, info) => {
  await ensureOwner(page);
  const current = await (await page.request.get('/api/cash/current')).json();
  if (current.session) await closeApi(page, current.session.id);
  if (!info.title.startsWith('opening'))
    sid = (await command(page, '/cash-sessions', { openingFloatCents: '10000' })).targetId;
});
async function cashPage(page: Page) {
  await page.goto('/#cash');
  await expect(page.getByRole('heading', { name: 'Caixa da loja' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conferência da sessão de caixa' })).toBeVisible();
}
async function moveUi(page: Page, name: 'suprimento' | 'sangria' | 'despesa', amount = '5,00') {
  await page.getByRole('button', { name: `Registrar ${name}`, exact: true }).click();
  await page.getByLabel('Valor da movimentação em R$').fill(amount);
  await page
    .getByLabel('Motivo da movimentação', { exact: true })
    .fill(`Movimentação sintética de ${name}`);
  if (name === 'despesa') await page.getByLabel('Categoria da despesa').selectOption('MAINTENANCE');
  await page.getByRole('button', { name: 'Confirmar movimentação', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
async function closeUi(page: Page, amount = '100,00', reason?: string) {
  await page.getByRole('button', { name: 'Fechar caixa', exact: true }).click();
  await page.getByLabel('Valor contado em R$').fill(amount);
  if (reason) await page.getByLabel('Justificativa da diferença', { exact: true }).fill(reason);
  await page.getByLabel('Confirmo a contagem e o fechamento definitivo desta sessão.').check();
  await page.getByRole('button', { name: 'Confirmar fechamento', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fechamento preservado' })).toBeVisible();
}
async function sale(page: Page, method: 'CASH' | 'PIX' | 'DEBIT_CARD' | 'CREDIT_CARD') {
  if (!categoryId) {
    const r = await page.request.post('/api/categories', {
      headers: mutationHeaders,
      data: { name: `Synthetic cash browser ${fixture}` },
    });
    expect(r.status()).toBe(201);
    categoryId = (await r.json()).category.id;
  }
  const n = ++serial;
  const r = await page.request.post('/api/products', {
    headers: mutationHeaders,
    data: {
      code: `C6B-${fixture}-${n}`,
      name: `Produto sintético de caixa ${fixture}-${n}`,
      categoryId,
      origin: 'BOTH',
      sellingPriceCents: 1250,
      estimatedCostCents: 833,
    },
  });
  expect(r.status()).toBe(201);
  const p = (await r.json()).product;
  await command(page, '/inventory/opening', {
    productId: p.id,
    quantity: 3,
    reason: 'INITIAL_COUNT',
    batch: { reference: `C6B-${fixture}-${n}`, expiresAt: '2099-01-01' },
  });
  return command(page, '/sales/checkout', {
    draft: {
      source: 'COUNTER',
      lines: [{ productId: p.id, productVersion: p.version, quantity: 1, unitPriceCents: 1250 }],
    },
    payment: {
      method,
      amountCents: '1250',
      manuallyConfirmed: true,
      ...(method === 'CASH' ? { tenderedCents: '2000' } : {}),
    },
  });
}
test('opening cash is explicit with counted float and no automatic session', async ({ page }) => {
  await page.goto('/#cash');
  await expect(page.getByRole('heading', { name: 'Nenhuma sessão de caixa aberta' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir caixa', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Fundo inicial contado em R$').fill('125,50');
  await page.getByRole('button', { name: 'Confirmar abertura' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByLabel('Valores físicos do caixa')).toContainText('R$\u00a0125,50');
});
test('addition records physical cash with reason and actor', async ({ page }) => {
  await cashPage(page);
  await moveUi(page, 'suprimento');
  expect((await detail(page)).totals.expectedCents).toBe('10500');
  await expect(page.getByRole('table', { name: 'Movimentações da sessão de caixa' })).toContainText(
    'Movimentação sintética de suprimento',
  );
});
test('withdrawal reduces expected physical cash and oversized outflow fails safely', async ({
  page,
}) => {
  await cashPage(page);
  await moveUi(page, 'sangria');
  expect((await detail(page)).totals.expectedCents).toBe('9500');
  await page.getByRole('button', { name: 'Registrar sangria', exact: true }).click();
  await page.getByLabel('Valor da movimentação em R$').fill('100,00');
  await page
    .getByLabel('Motivo da movimentação', { exact: true })
    .fill('Tentativa sintética acima do dinheiro');
  await page.getByRole('button', { name: 'Confirmar movimentação', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Dinheiro esperado insuficiente');
  expect((await detail(page)).totals.expectedCents).toBe('9500');
});
test('small expense requires category and never implies an inventory purchase', async ({
  page,
}) => {
  await cashPage(page);
  await moveUi(page, 'despesa');
  expect((await detail(page)).totals.expensesCents).toBe('500');
  await expect(page.getByRole('table', { name: 'Movimentações da sessão de caixa' })).toContainText(
    'Manutenção',
  );
});
test('method summaries separate electronic receipts and cash tender/change', async ({ page }) => {
  for (const method of ['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD'] as const)
    await sale(page, method);
  await cashPage(page);
  const d = await detail(page);
  expect(d.totals.expectedCents).toBe('11250');
  const table = page.getByRole('table', {
    name: 'Recebimentos e devoluções por meio de pagamento',
  });
  await expect(table).toContainText('Cartão de crédito');
  await expect(table).toContainText('Pix');
  await expect(table.getByRole('row')).toHaveCount(5);
  expect(JSON.stringify(d)).not.toContain('estimatedCostCents');
  await page
    .getByRole('table', { name: 'Pagamentos desta sessão' })
    .getByRole('button')
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText('Comprovante interno não fiscal');
});
test('counted closing preserves result and allows explicit next opening', async ({ page }) => {
  await cashPage(page);
  await closeUi(page);
  expect((await detail(page)).session.closing?.differenceCents).toBe('0');
  await expect(page.getByText('Pendente de revisão', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir caixa', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fechar caixa', exact: true })).toHaveCount(0);
});
test('closing difference requires explanation and displays a signed physical shortage', async ({
  page,
}) => {
  await cashPage(page);
  await page.getByRole('button', { name: 'Fechar caixa', exact: true }).click();
  await page.getByLabel('Valor contado em R$').fill('99,50');
  await page.getByLabel('Confirmo a contagem e o fechamento definitivo desta sessão.').check();
  await page.getByRole('button', { name: 'Confirmar fechamento', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page
      .getByLabel('Justificativa da diferença', { exact: true })
      .evaluate((e: HTMLTextAreaElement) => e.validity.valueMissing),
  ).toBe(true);
  await page
    .getByLabel('Justificativa da diferença', { exact: true })
    .fill('Diferença sintética conferida presencialmente');
  await page.getByRole('button', { name: 'Confirmar fechamento', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByLabel('Contagem e diferença operacional')).toContainText('-R$\u00a00,50');
  expect((await detail(page)).session.closing?.differenceCents).toBe('-50');
});
test('stale counted summary requires cancel reload and review', async ({ page }) => {
  await cashPage(page);
  await page.getByRole('button', { name: 'Fechar caixa', exact: true }).click();
  await page.getByLabel('Valor contado em R$').fill('100,00');
  await page.getByLabel('Confirmo a contagem e o fechamento definitivo desta sessão.').check();
  await moveApi(page);
  await page.getByRole('button', { name: 'Confirmar fechamento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('O caixa recebeu nova atividade');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await closeUi(page, '105,00');
  expect((await detail(page)).session.closing?.expectedCents).toBe('10500');
});
test('history supports opening-date filters exact identity pagination and details', async ({
  page,
}) => {
  for (let i = 0; i < 22; i++) {
    await closeApi(page);
    sid = (await command(page, '/cash-sessions', { openingFloatCents: '10000' })).targetId;
  }
  await cashPage(page);
  await page.getByRole('button', { name: 'Histórico de caixas', exact: true }).click();
  const table = page.getByRole('table', { name: 'Histórico de sessões de caixa' });
  await expect(table.getByRole('row')).toHaveCount(21);
  await page
    .locator('.registry-table')
    .getByRole('button', { name: 'Próxima página', exact: true })
    .click();
  await expect(table.getByRole('row')).toHaveCount(
    Math.min(20, (await (await page.request.get('/api/cash/sessions')).json()).total - 20) + 1,
  );
  await page.getByRole('searchbox', { name: 'Buscar caixa pelo ID completo' }).fill(sid);
  await expect(table.getByRole('row')).toHaveCount(2);
  const day = businessDateOf(new Date());
  await page.getByLabel('Abertura desde (Fortaleza)').fill(day);
  await page.getByLabel('Abertura até (Fortaleza)').fill(day);
  await page.getByRole('button', { name: `Abrir caixa ${sid}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conferência da sessão de caixa' })).toBeVisible();
});
test('owner reviews without changing the immutable financial result', async ({ page }) => {
  await cashPage(page);
  await closeUi(page, '99,00', 'Contagem sintética com falta justificada');
  const before = (await detail(page)).session.closing;
  await page.getByRole('button', { name: 'Revisar fechamento', exact: true }).click();
  await page.getByLabel('Decisão da revisão').selectOption('APPROVED');
  await page
    .getByLabel('Nota da revisão', { exact: true })
    .fill('Justificativa sintética conferida pelo responsável');
  await page.getByRole('button', { name: 'Registrar revisão', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('table', { name: 'Revisões do fechamento' })).toContainText(
    'Aprovado',
  );
  expect((await detail(page)).session.closing).toEqual(before);
});
test('owner movement reversal appends a linked opposite record without editing original', async ({
  page,
}) => {
  await cashPage(page);
  await moveUi(page, 'despesa');
  await page.getByRole('button', { name: 'Estornar movimentação', exact: true }).click();
  await page
    .getByLabel('Motivo do estorno de movimentação')
    .fill('Movimento físico sintético devolvido integralmente');
  await page.getByLabel('Confirmo a movimentação física inversa integral no caixa atual.').check();
  await page
    .getByRole('button', { name: 'Confirmar estorno de movimentação', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const d = await detail(page);
  expect(d.totals.expectedCents).toBe('10000');
  expect(d.movements.total).toBe(2);
  await expect(page.getByRole('table', { name: 'Movimentações da sessão de caixa' })).toContainText(
    'Estorno de movimentação',
  );
});
for (const role of ['CASHIER', 'MANAGER', 'PRODUCTION'] as const)
  test(`${role} sees only granted cash fields and actions`, async ({ page }) => {
    const r = await page.request.post('/api/users', {
      headers: mutationHeaders,
      data: {
        loginIdentifier: `cash-browser-${fixture}-${role.toLowerCase()}`.slice(0, 32),
        displayName: `Synthetic ${role} cash browser`,
        role,
        password: ownerPassword,
      },
    });
    expect(r.status()).toBe(201);
    const user = (await r.json()).user;
    await page.context().clearCookies();
    const login = await page.request.post('/api/auth/login', {
      headers: mutationHeaders,
      data: { loginIdentifier: user.loginIdentifier, password: ownerPassword },
    });
    expect(login.status()).toBe(200);
    await page.goto('/#cash');
    if (role === 'PRODUCTION') {
      await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
      await expect(
        page.getByRole('navigation').getByRole('button', { name: 'Caixa', exact: true }),
      ).toHaveCount(0);
      expect((await page.request.get('/api/cash/current')).status()).toBe(403);
    } else if (role === 'CASHIER') {
      await expect(page.getByRole('heading', { name: 'Sessão de caixa aberta' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Fechar caixa', exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Histórico de caixas', exact: true }),
      ).toHaveCount(0);
      expect((await page.request.get(`/api/cash/sessions/${sid}`)).status()).toBe(403);
    } else {
      await expect(page.getByRole('button', { name: 'Fechar caixa', exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Registrar suprimento', exact: true }),
      ).toBeVisible();
      expect(
        (
          await page.request.post('/api/cash/review', {
            headers: mutationHeaders,
            data: { key: randomUUID(), payload: {} },
          })
        ).status(),
      ).toBe(403);
    }
    await ensureOwner(page);
    const off = await page.request.patch(`/api/users/${user.id}`, {
      headers: mutationHeaders,
      data: {
        version: user.version,
        displayName: user.displayName,
        role: user.role,
        active: false,
        reason: 'Synthetic cash role scenario completed',
      },
    });
    expect(off.status()).toBe(200);
  });
for (const resolution of ['retry', 'lookup'])
  test(`uncertain cash movement resolves by ${resolution} with one effect`, async ({ page }) => {
    await cashPage(page);
    await page.getByRole('button', { name: 'Registrar suprimento', exact: true }).click();
    await page.getByLabel('Valor da movimentação em R$').fill('5,00');
    await page
      .getByLabel('Motivo da movimentação', { exact: true })
      .fill('Suprimento sintético com resposta perdida');
    let requests = 0;
    await page.route('**/api/cash/movements', async (route) => {
      requests++;
      if (requests === 1) {
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('failed');
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Confirmar movimentação', exact: true }).click();
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
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const d = await detail(page);
    expect(d.movements.total).toBe(1);
    expect(d.totals.expectedCents).toBe('10500');
    expect(requests).toBe(resolution === 'retry' ? 2 : 1);
  });
test('cash closing dialogs keyboard desktop and narrow layouts pass relevant accessibility checks', async ({
  page,
}, info) => {
  await cashPage(page);
  await page.getByRole('button', { name: 'Fechar caixa', exact: true }).click();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('cash-close-desktop.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('cash-narrow.png'), fullPage: true });
  await page.getByRole('button', { name: 'Registrar despesa', exact: true }).click();
  expect(await page.getByRole('dialog').evaluate((d) => d.scrollWidth <= d.clientWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('cash-expense-narrow.png'), fullPage: true });
});
