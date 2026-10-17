import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ensureOwner, mutationHeaders, ownerPassword } from './auth-fixture.js';
let categoryId = '';
let serial = 0;
test.beforeEach(async ({ page }) => {
  await ensureOwner(page);
  if (!categoryId) {
    const r = await page.request.post('/api/categories', {
      headers: mutationHeaders,
      data: { name: 'Synthetic Phase 4 browser category' },
    });
    expect(r.status()).toBe(201);
    categoryId = (await r.json()).category.id;
  }
});
async function product(
  page: Page,
  origin: 'PRODUCED' | 'PURCHASED' | 'BOTH' = 'BOTH',
  name?: string,
) {
  const n = ++serial;
  const response = await page.request.post('/api/products', {
    headers: mutationHeaders,
    data: {
      code: `F4-${n}`,
      name: name ?? `Fase 4 Sintético ${String(n).padStart(3, '0')}`,
      categoryId,
      origin,
      sellingPriceCents: 1500,
      estimatedCostCents: 400,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).product as { id: string; name: string; code: string };
}
async function day(page: Page, offset = 0) {
  const current = (await (await page.request.get('/api/system/status')).json())
    .businessDate as string;
  return new Date(Date.parse(`${current}T00:00:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10);
}
async function command(page: Page, url: string, payload: unknown, key = randomUUID()) {
  const response = await page.request.post(`/api${url}`, {
    headers: mutationHeaders,
    data: { key, payload },
  });
  expect(response.status(), JSON.stringify(await response.json())).toBe(200);
  return response.json() as Promise<{ targetId: string; batchId: string; operationId: string }>;
}
async function opening(
  page: Page,
  p: { id: string },
  quantity: number,
  expiry: string | null,
  reference = `SYNTHETIC-${randomUUID()}`,
) {
  return command(page, '/inventory/opening', {
    productId: p.id,
    quantity,
    reason: 'INITIAL_COUNT',
    batch: {
      reference,
      expiresAt: expiry,
      ...(expiry === null ? { expiryUnknownReason: 'NOT_PROVIDED' } : {}),
    },
  });
}
async function chooseProduct(page: Page, p: { id: string; name: string }) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox', { name: 'Buscar produto', exact: true }).fill(p.name);
  await dialog.getByLabel('Produto (obrigatório)', { exact: true }).selectOption(p.id);
}
async function batchFields(page: Page, reference: string, expiry: string | null) {
  await page.getByLabel('Referência do lote', { exact: true }).fill(reference);
  if (expiry === null) {
    await page.getByLabel('Sem validade informada', { exact: true }).check();
    await page.getByLabel('Motivo da validade desconhecida').selectOption('NOT_PROVIDED');
  } else await page.getByLabel('Data de validade', { exact: true }).fill(expiry);
}
async function openStock(page: Page, p: { id: string; name: string }) {
  await page.goto('/#inventory');
  await page.getByRole('searchbox', { name: 'Buscar estoque' }).fill(p.name);
  await page.getByRole('button', { name: `Ver lotes de ${p.name}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: p.name, exact: true })).toBeVisible();
}
test('production empty state and create/start/complete receive actual units only, with duplicate-submit protection', async ({
  page,
}, testInfo) => {
  const p = await product(page, 'PRODUCED');
  await page.goto('/#production');
  await expect(page.getByRole('heading', { name: 'Nenhuma produção encontrada' })).toBeVisible();
  await page.getByRole('button', { name: 'Planejar produção', exact: true }).click();
  await chooseProduct(page, p);
  await page.getByLabel('Quantidade planejada (unidades)').fill('5');
  await page.getByRole('button', { name: 'Confirmar planejamento' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const row = page.getByRole('row').filter({ hasText: p.name });
  await expect(row).toContainText('Planejada');
  await row.getByRole('button', { name: `Detalhes da produção de ${p.name}` }).click();
  await expect(page.getByRole('dialog')).toContainText('Ainda não recebida');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(
    (await (await page.request.get(`/api/inventory/products/${p.id}/batches`)).json()).total,
  ).toBe(0);
  await row.getByRole('button', { name: `Iniciar produção de ${p.name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar início' }).click();
  await expect(row).toContainText('Em andamento');
  await row.getByRole('button', { name: `Concluir produção de ${p.name}`, exact: true }).click();
  await page.getByLabel('Quantidade realmente concluída (unidades)').fill('3');
  await batchFields(page, 'F4-UI-PRODUCED', await day(page, 2));
  await expect(
    page.getByText('Diferença não recebida para o planejado: 2 unidades.', { exact: false }),
  ).toBeVisible();
  let requests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/complete')) requests++;
  });
  await page
    .getByRole('dialog')
    .locator('form')
    .evaluate((form) => {
      (form as HTMLFormElement).requestSubmit();
      (form as HTMLFormElement).requestSubmit();
    });
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(row).toContainText('Concluída');
  expect(requests).toBe(1);
  const batches = (await (await page.request.get(`/api/inventory/products/${p.id}/batches`)).json())
    .items;
  expect(batches).toHaveLength(1);
  expect(batches[0].physical).toBe('3');
  await page.getByLabel('Situação da produção').selectOption('COMPLETED');
  await page.getByRole('searchbox', { name: 'Buscar produção por produto' }).fill(p.name);
  await expect(row).toBeVisible();
  await page.getByLabel('Data planejada', { exact: true }).fill(await day(page, -1));
  await expect(page.getByRole('heading', { name: 'Nenhuma produção encontrada' })).toBeVisible();
  await page.getByLabel('Data planejada', { exact: true }).fill('');
  await page.screenshot({ path: testInfo.outputPath('production-desktop.png'), fullPage: true });
});
test('production cancellation before completion creates no finished-stock loss', async ({
  page,
}) => {
  const p = await product(page, 'PRODUCED');
  await command(page, '/production', {
    productId: p.id,
    plannedQuantity: 9,
    plannedDate: await day(page),
  });
  await page.goto('/#production');
  await page.getByRole('searchbox', { name: 'Buscar produção por produto' }).fill(p.name);
  await page.getByRole('button', { name: `Cancelar produção de ${p.name}`, exact: true }).click();
  await page.getByLabel('Motivo do cancelamento').selectOption('FAILED_BEFORE_FINISH');
  await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: p.name })).toContainText('Cancelada');
  expect(
    (await (await page.request.get(`/api/inventory/products/${p.id}/movements`)).json()).total,
  ).toBe(0);
});
test('opening form records expired physical stock without claiming sellable availability', async ({
  page,
}) => {
  const p = await product(page);
  await page.goto('/#inventory');
  await page.getByRole('button', { name: 'Registrar saldo inicial', exact: true }).click();
  await chooseProduct(page, p);
  const units = page.getByLabel('Quantidade de entrada (unidades)');
  await units.fill('0');
  await page.getByLabel('Motivo do saldo inicial').selectOption('INITIAL_COUNT');
  await batchFields(page, 'F4-UI-EXPIRED', await day(page, -1));
  await page.getByRole('button', { name: 'Confirmar movimentação' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await units.evaluate((input) => (input as HTMLInputElement).validity.rangeUnderflow)).toBe(
    true,
  );
  expect(
    (await (await page.request.get(`/api/inventory/products/${p.id}/batches`)).json()).total,
  ).toBe(0);
  await units.fill('5');
  await page.getByRole('button', { name: 'Confirmar movimentação' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await openStock(page, p);
  await expect(page.getByText('Vencido / bloqueado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir lote F4-UI-EXPIRED', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Físico: 5 un.');
  await expect(page.getByRole('dialog')).toContainText('vencido / bloqueado');
  await page.getByRole('button', { name: 'Fechar lote' }).click();
});
test('purchased receipt snapshots optional cost and supplier reference without changing catalog cost', async ({
  page,
}) => {
  const p = await product(page, 'PURCHASED');
  await page.goto('/#inventory');
  await page.getByRole('button', { name: 'Receber produto comprado', exact: true }).click();
  await chooseProduct(page, p);
  await page.getByLabel('Quantidade de entrada (unidades)').fill('8');
  await page.getByLabel('Fornecedor / referência da compra').fill('Fornecedor Sintético Navegador');
  await page.getByLabel('Custo unitário da compra em R$ (opcional)').fill('4,25');
  await page
    .getByLabel('Referência / observações da entrada (opcional)')
    .fill('Conferência sintética da entrada');
  await batchFields(page, 'F4-UI-PURCHASED', await day(page, 3));
  await page.getByRole('button', { name: 'Confirmar movimentação' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await openStock(page, p);
  await page.getByRole('button', { name: 'Abrir lote F4-UI-PURCHASED', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Fornecedor Sintético Navegador');
  await expect(page.getByRole('dialog')).toContainText('Conferência sintética da entrada');
  await expect(page.getByRole('dialog')).toContainText('R$\u00a04,25');
  expect(
    (await (await page.request.get(`/api/products/${p.id}`)).json()).product.estimatedCostCents,
  ).toBe(400);
});
test('waste and compensating adjustment update physical stock, history and reconciliation', async ({
  page,
}) => {
  const p = await product(page);
  const o = await opening(page, p, 5, await day(page, -1), 'F4-UI-WASTE');
  await openStock(page, p);
  await page.getByRole('button', { name: 'Abrir lote F4-UI-WASTE' }).click();
  await page.getByRole('button', { name: 'Registrar perda', exact: true }).click();
  await page.getByLabel('Quantidade de perda (unidades)').fill('2');
  await page.getByLabel('Motivo da movimentação').selectOption('EXPIRED');
  await page.getByRole('button', { name: 'Confirmar movimentação' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Abrir lote F4-UI-WASTE' }).click();
  await page.getByRole('button', { name: 'Ajustar lote', exact: true }).click();
  await page.getByLabel('Quantidade do ajuste (unidades)').fill('1');
  await page.getByLabel('Motivo da movimentação').selectOption('COUNT_DIFFERENCE');
  await page.getByRole('button', { name: 'Confirmar movimentação' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(
    (await (await page.request.get(`/api/inventory/batches/${o.batchId}`)).json()).batch.physical,
  ).toBe('2');
  await page.getByRole('button', { name: 'Movimentações', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Histórico de movimentações' })).toContainText(
    'Perda de unidades prontas',
  );
  await expect(page.getByRole('table', { name: 'Histórico de movimentações' })).toContainText(
    'Ajuste negativo',
  );
  await page.getByRole('button', { name: 'Conferir conciliação' }).click();
  await expect(page.getByRole('heading', { name: 'Histórico e saldos conferem' })).toBeVisible();
});
test('explicit unknown expiry is labeled and positive adjustment creates a traceable new batch', async ({
  page,
}) => {
  const p = await product(page);
  await page.goto('/#inventory');
  await page.getByRole('button', { name: 'Ajuste positivo em novo lote', exact: true }).click();
  await chooseProduct(page, p);
  await page.getByLabel('Quantidade de entrada (unidades)').fill('2');
  await batchFields(page, 'F4-UI-UNKNOWN', null);
  await expect(
    page.getByText('Validade desconhecida não garante segurança.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar movimentação' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await openStock(page, p);
  await expect(page.getByText('Validade desconhecida', { exact: true })).toBeVisible();
});
test('stale waste form rejects overwrite and reloads current balance for review', async ({
  page,
}) => {
  const p = await product(page);
  const o = await opening(page, p, 5, await day(page, 2), 'F4-UI-STALE');
  const b = (await (await page.request.get(`/api/inventory/batches/${o.batchId}`)).json()).batch;
  await openStock(page, p);
  await page.getByRole('button', { name: 'Abrir lote F4-UI-STALE' }).click();
  await page.getByRole('button', { name: 'Registrar perda', exact: true }).click();
  await command(page, '/inventory/adjustments', {
    productId: p.id,
    batchId: b.id,
    version: b.version,
    direction: 'OUT',
    quantity: 1,
    reason: 'COUNT_DIFFERENCE',
  });
  await page.getByLabel('Quantidade de perda (unidades)').fill('1');
  await page.getByLabel('Motivo da movimentação').selectOption('DAMAGED');
  await page.getByRole('button', { name: 'Confirmar movimentação' }).click();
  await expect(page.getByRole('alert')).toContainText('Recarregue e revise');
  await page.getByRole('button', { name: 'Fechar e recarregar saldo para revisão' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Abrir lote F4-UI-STALE' }).click();
  await expect(page.getByRole('dialog')).toContainText('Físico: 4 un.');
});
for (const resolution of ['retry', 'lookup'] as const)
  test(`lost opening response resolves by ${resolution} without duplicate stock`, async ({
    page,
  }) => {
    const p = await product(page);
    await page.goto('/#inventory');
    await page.getByRole('button', { name: 'Registrar saldo inicial', exact: true }).click();
    await chooseProduct(page, p);
    await page.getByLabel('Quantidade de entrada (unidades)').fill('3');
    await page.getByLabel('Motivo do saldo inicial').selectOption('INITIAL_COUNT');
    await batchFields(page, `F4-UI-UNCERTAIN-${resolution}`, await day(page, 2));
    await page.route('**/api/inventory/opening', async (route) => {
      await route.fetch();
      await route.abort('connectionfailed');
    });
    await page.getByRole('button', { name: 'Confirmar movimentação' }).click();
    await expect(
      page.getByRole('heading', { name: 'Resultado ainda não confirmado' }),
    ).toBeVisible();
    await expect(page.getByLabel('Quantidade de entrada (unidades)')).toBeDisabled();
    await page.unroute('**/api/inventory/opening');
    await page
      .getByRole('button', {
        name: resolution === 'retry' ? 'Repetir mesma solicitação' : 'Verificar resultado',
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const data = await (await page.request.get(`/api/inventory/products/${p.id}/batches`)).json();
    expect(data.total).toBe(1);
    expect(data.items[0].physical).toBe('3');
  });
for (const role of ['CASHIER', 'PRODUCTION'] as const)
  test(`${role} sees only permitted stock controls and no purchase cost`, async ({ page }) => {
    const p = await product(page, 'PURCHASED');
    const r = await command(page, '/inventory/receipts', {
      productId: p.id,
      quantity: 2,
      batch: { reference: `F4-ROLE-${role}`, expiresAt: await day(page, 2) },
      supplierReference: 'Synthetic supplier',
      unitCostCents: 12345,
    });
    const response = await page.request.post('/api/users', {
      headers: mutationHeaders,
      data: {
        loginIdentifier: `f4-role-${role.toLowerCase()}`,
        displayName: 'Synthetic Phase 4 Role',
        role,
        password: ownerPassword,
      },
    });
    expect(response.status()).toBe(201);
    const user = (await response.json()).user;
    await page.context().clearCookies();
    expect(
      (
        await page.request.post('/api/auth/login', {
          headers: mutationHeaders,
          data: { loginIdentifier: user.loginIdentifier, password: ownerPassword },
        })
      ).status(),
    ).toBe(200);
    await page.goto('/#inventory');
    await page.getByRole('searchbox', { name: 'Buscar estoque' }).fill(p.name);
    await expect(
      page.getByRole('button', { name: 'Registrar saldo inicial', exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Receber produto comprado', exact: true }),
    ).not.toBeVisible();
    if (role === 'CASHIER') {
      await expect(page.getByRole('columnheader', { name: 'Físico (un.)' })).not.toBeVisible();
      await page.goto('/#production');
      await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
      expect((await page.request.get(`/api/inventory/batches/${r.batchId}`)).status()).toBe(403);
    } else {
      await page.getByRole('button', { name: `Ver lotes de ${p.name}`, exact: true }).click();
      await page.getByRole('button', { name: `Abrir lote F4-ROLE-${role}` }).click();
      await expect(page.getByText('Custo unitário da compra:', { exact: false })).not.toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Registrar perda', exact: true }),
      ).not.toBeVisible();
      expect(
        (await (await page.request.get(`/api/inventory/batches/${r.batchId}`)).json()).receipt,
      ).not.toHaveProperty('unitCostCents');
      await page.keyboard.press('Escape');
      await page.goto('/#production');
      await expect(
        page.getByRole('button', { name: 'Planejar produção', exact: true }),
      ).toBeVisible();
    }
    await ensureOwner(page);
    expect(
      (
        await page.request.patch(`/api/users/${user.id}`, {
          headers: mutationHeaders,
          data: {
            displayName: user.displayName,
            role: user.role,
            active: false,
            version: user.version,
            reason: 'Synthetic browser inventory scenario complete',
          },
        })
      ).status(),
    ).toBe(200);
  });
test('inventory filtering/pagination and production product filter are usable', async ({
  page,
}) => {
  for (let n = 0; n < 22; n++)
    await product(
      page,
      n % 2 ? 'PURCHASED' : 'PRODUCED',
      `Fase 4 Paginação ${String(n).padStart(2, '0')}`,
    );
  await page.goto('/#inventory');
  await page.getByRole('searchbox', { name: 'Buscar estoque' }).fill('Fase 4 Paginação');
  const table = page.getByRole('table', { name: 'Saldos atuais de estoque' });
  await expect(table.getByRole('row')).toHaveCount(21);
  await page.locator('.registry-table').getByRole('button', { name: 'Próxima página' }).click();
  await expect(table.getByRole('row')).toHaveCount(3);
  await page.getByLabel('Origem no estoque').selectOption('PURCHASED');
  await expect(table.getByRole('row')).toHaveCount(12);
  await page.getByLabel('Categoria do filtro', { exact: true }).selectOption(categoryId);
  await expect(table.getByRole('row')).toHaveCount(12);
  await page.goto('/#production');
  await page
    .getByRole('searchbox', { name: 'Buscar filtrar produto da produção', exact: true })
    .fill('Fase 4 Paginação 00');
  const options = page.getByLabel('Filtrar produto da produção', { exact: true });
  const target = options.locator('option').filter({ hasText: 'Fase 4 Paginação 00' });
  await expect(target).toHaveCount(1);
  await options.selectOption((await target.getAttribute('value'))!);
  await expect(page.getByRole('heading', { name: 'Nenhuma produção encontrada' })).toBeVisible();
});
test('inventory/production dialogs, desktop/narrow layouts and relevant Axe checks', async ({
  page,
}, testInfo) => {
  for (const hash of ['inventory', 'production']) {
    await page.goto(`/#${hash}`);
    await expect(
      page.getByRole('heading', {
        name: hash === 'inventory' ? 'Estoque' : 'Produção',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: 'Planejar produção', exact: true }).click();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/#inventory');
  await page.getByRole('button', { name: 'Receber produto comprado', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath('inventory-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const hash of ['inventory', 'production']) {
    await page.goto(`/#${hash}`);
    await expect(
      page.getByRole('heading', {
        name: hash === 'inventory' ? 'Estoque' : 'Produção',
        exact: true,
      }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`${hash}-narrow.png`), fullPage: true });
  }
});
