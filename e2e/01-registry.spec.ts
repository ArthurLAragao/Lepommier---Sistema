import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ensureOwner, mutationHeaders, ownerPassword } from './auth-fixture.js';

test.beforeEach(async ({ page }) => {
  await ensureOwner(page);
});
async function createCustomer(page: Page, fields: Record<string, unknown>) {
  const response = await page.request.post('/api/customers', {
    headers: mutationHeaders,
    data: fields,
  });
  expect(response.status()).toBe(201);
  return (await response.json()).customer as {
    id: string;
    name: string;
    registration: string;
    version: number;
  };
}
async function openCustomer(page: Page, name: string) {
  await page.goto('/#customers');
  await page.getByRole('searchbox', { name: 'Buscar cliente' }).fill(name);
  await page.getByRole('button', { name: `Abrir perfil de ${name}`, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function createCategory(page: Page, name: string) {
  const response = await page.request.post('/api/categories', {
    headers: mutationHeaders,
    data: { name },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).category as { id: string; name: string; version: number };
}

test('empty customer list, required-name validation, optional details and safe profile', async ({
  page,
}, testInfo) => {
  await page.goto('/#customers');
  await expect(page.getByRole('heading', { name: 'Nenhum cliente encontrado' })).toBeVisible();
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).first().click();
  await page.getByLabel('Nome do cliente', { exact: true }).fill(' ');
  await page.getByRole('button', { name: 'Salvar cliente' }).click();
  await expect(page.getByRole('alert')).toContainText('2 caracteres');
  await page.getByLabel('Nome do cliente', { exact: true }).fill('Ana Sintética de Navegador');
  await page.getByLabel('Telefone (opcional)', { exact: true }).fill('(85) 99999-3001');
  await page.getByText('Mais informações opcionais', { exact: true }).click();
  await page.getByLabel('E-mail (opcional)', { exact: true }).fill('ana-browser@example.test');
  await page.getByLabel('Nascimento completo (opcional)', { exact: true }).fill('1980-02-29');
  await page.getByLabel('CPF (opcional, restrito)', { exact: true }).fill('52998224725');
  await page
    .getByLabel('Observações operacionais (opcional, restrito)', { exact: true })
    .fill('<script>window.syntheticXss=true</script>');
  await page.getByRole('button', { name: 'Salvar cliente' }).click();
  await expect(
    page.getByRole('heading', { name: 'Ana Sintética de Navegador', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('+55 (85) 99999-3001', { exact: true })).toBeVisible();
  await expect(page.getByText('29/02/1980', { exact: true })).toBeVisible();
  await expect(page.getByText('***.***.***-25', { exact: false })).toBeVisible();
  await expect(
    page.getByText('Disponível após a implementação de vendas e pedidos.', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => Object.hasOwn(window, 'syntheticXss'))).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath('customer-profile-desktop.png'),
    fullPage: true,
  });
});

test('duplicate review preserves shared contacts and blocks duplicate CPF', async ({ page }) => {
  await createCustomer(page, {
    name: 'Família Sintética Original',
    phone: '85999993002',
    cpf: '11144477735',
  });
  await page.goto('/#customers');
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await page.getByLabel('Nome do cliente', { exact: true }).fill('Família Sintética Outra Pessoa');
  await page.getByLabel('Telefone (opcional)', { exact: true }).fill('85999993002');
  await page.getByRole('button', { name: 'Salvar cliente' }).click();
  await expect(page.getByRole('heading', { name: 'Revisão de duplicidades' })).toBeVisible();
  await page.getByLabel('Motivo para cadastrar separadamente').selectOption('SHARED_CONTACT');
  await page.getByRole('button', { name: 'Salvar cliente' }).click();
  await expect(
    page.getByRole('heading', { name: 'Família Sintética Outra Pessoa', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Voltar para clientes' }).click();
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await page.getByLabel('Nome do cliente', { exact: true }).fill('CPF Sintético Conflitante');
  await page.getByText('Mais informações opcionais', { exact: true }).click();
  await page.getByLabel('CPF (opcional, restrito)', { exact: true }).fill('11144477735');
  await page.getByRole('button', { name: 'Salvar cliente' }).click();
  await expect(page.getByRole('alert')).toContainText('CPF já vinculado');
  await expect(page.getByRole('button', { name: 'Salvar cliente' })).toBeDisabled();
});

test('customer stale edit has reload/review path, then edit and reversible deactivation work', async ({
  page,
}) => {
  const customer = await createCustomer(page, {
    name: 'Cliente Sintético de Concorrência',
    phone: '85999993003',
  });
  await openCustomer(page, customer.name);
  await page.getByRole('button', { name: 'Editar cliente', exact: true }).click();
  expect(
    (
      await page.request.patch(`/api/customers/${customer.id}`, {
        headers: mutationHeaders,
        data: { name: customer.name, phone: '85999993003', version: 1 },
      })
    ).status(),
  ).toBe(200);
  await page.getByLabel('Nome do cliente', { exact: true }).fill('Edição antiga sintética');
  await page.getByRole('button', { name: 'Salvar cliente' }).click();
  await expect(page.getByRole('alert')).toContainText('alterado por outra pessoa');
  await page
    .getByRole('button', { name: 'Fechar e revisar versão atual (descarta edições)' })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: customer.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar cliente', exact: true }).click();
  await page.getByLabel('Nome do cliente', { exact: true }).fill('Cliente Sintético Revisado');
  await page.getByRole('button', { name: 'Salvar cliente' }).click();
  await expect(
    page.getByRole('heading', { name: 'Cliente Sintético Revisado', exact: true }),
  ).toBeVisible();
  for (const label of ['Desativar cliente', 'Reativar cliente']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.getByLabel('Motivo', { exact: true }).selectOption('RECORD_REVIEW');
    await page.getByRole('button', { name: 'Confirmar alteração' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Desativar cliente', exact: true })).toBeVisible();
});

test('owner records explicit marketing preference and confirms anonymization', async ({ page }) => {
  const customer = await createCustomer(page, {
    name: 'Cliente Sintético para Anonimizar',
    phone: '85999993004',
    email: 'anonymize-browser@example.test',
    notes: 'Synthetic private note',
  });
  await openCustomer(page, customer.name);
  await expect(page.getByText('Não informado', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Atualizar preferência', exact: true }).click();
  await page.getByLabel('Nova preferência').selectOption('OPTED_IN');
  await page.getByLabel('Origem da manifestação').selectOption('CUSTOMER_REQUEST');
  await page.getByLabel('Referência da evidência (opcional)').fill('Synthetic request reference');
  await page.getByLabel('Motivo', { exact: true }).selectOption('CUSTOMER_REQUEST');
  await page.getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Aceita contato promocional', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Anonimizar cliente', exact: true }).click();
  await page.getByLabel('Matrícula para confirmar').fill('WRONG');
  await page.getByLabel('Motivo', { exact: true }).selectOption('CUSTOMER_REQUEST');
  await page.getByRole('button', { name: 'Confirmar anonimização' }).click();
  await expect(page.getByRole('alert')).toContainText('matrícula exata');
  await page.getByLabel('Matrícula para confirmar').fill(customer.registration);
  await page.getByRole('button', { name: 'Confirmar anonimização' }).click();
  await expect(
    page.getByRole('heading', { name: 'Cliente anonimizado', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar cliente', exact: true })).not.toBeVisible();
  await expect(page.getByText('anonymize-browser@example.test', { exact: true })).not.toBeVisible();
  await expect(page.getByText('Synthetic request reference', { exact: false })).not.toBeVisible();
});

for (const role of ['CASHIER', 'PRODUCTION'] as const)
  test(`${role} sees only authorized customer/catalog fields and controls`, async ({ page }) => {
    const customer = await createCustomer(page, {
      name: `Cliente Privado Sintético ${role}`,
      phone: role === 'CASHIER' ? '85999993005' : '85999993006',
      email: `${role.toLowerCase()}@example.test`,
      notes: 'Hidden synthetic private text',
    });
    const category = await createCategory(page, `Categoria de Perfil ${role}`);
    const product = await page.request.post('/api/products', {
      headers: mutationHeaders,
      data: {
        code: `ROLE-${role}`,
        name: `Produto de Perfil ${role}`,
        categoryId: category.id,
        origin: 'PURCHASED',
        sellingPriceCents: 1900,
        estimatedCostCents: 54321,
      },
    });
    expect(product.status()).toBe(201);
    const account = await page.request.post('/api/users', {
      headers: mutationHeaders,
      data: {
        loginIdentifier: `phase3-${role.toLowerCase()}`,
        displayName: 'Synthetic role browser',
        role,
        password: ownerPassword,
      },
    });
    expect(account.status()).toBe(201);
    const user = (await account.json()).user;
    await page.context().clearCookies();
    expect(
      (
        await page.request.post('/api/auth/login', {
          headers: mutationHeaders,
          data: { loginIdentifier: `phase3-${role.toLowerCase()}`, password: ownerPassword },
        })
      ).status(),
    ).toBe(200);
    await page.goto('/#customers');
    if (role === 'PRODUCTION') {
      await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
      await expect(
        page
          .getByRole('navigation', { name: 'Navegação principal' })
          .getByRole('button', { name: 'Clientes', exact: true }),
      ).not.toBeVisible();
      expect((await page.request.get(`/api/customers/${customer.id}`)).status()).toBe(403);
    } else {
      await page.getByRole('searchbox', { name: 'Buscar cliente' }).fill(customer.name);
      await page
        .getByRole('button', { name: `Abrir perfil de ${customer.name}`, exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Anonimizar cliente', exact: true }),
      ).not.toBeVisible();
      await expect(
        page.getByText(`${role.toLowerCase()}@example.test`, { exact: true }),
      ).not.toBeVisible();
      await page.getByRole('button', { name: 'Editar cliente', exact: true }).click();
      await expect(page.getByLabel('CPF (opcional, restrito)')).not.toBeVisible();
      await expect(page.getByLabel('E-mail (opcional)', { exact: true })).not.toBeVisible();
      await page.keyboard.press('Escape');
    }
    await page.goto('/#products');
    await page.getByRole('searchbox', { name: 'Buscar produto' }).fill(`Produto de Perfil ${role}`);
    await expect(page.getByRole('button', { name: 'Novo produto', exact: true })).not.toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: 'Custo unitário estimado' }),
    ).not.toBeVisible();
    await page
      .getByRole('button', { name: `Ver produto Produto de Perfil ${role}`, exact: true })
      .click();
    await expect(page.getByText('R$ 543,21', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Custo unitário estimado', { exact: true })).not.toBeVisible();
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
            reason: 'Synthetic Phase 3 test complete',
          },
        })
      ).status(),
    ).toBe(200);
  });

test('category and product forms create real catalog data, format prices and edit/deactivate', async ({
  page,
}, testInfo) => {
  await page.goto('/#products');
  await page.getByRole('button', { name: 'Categorias', exact: true }).click();
  await page.getByRole('button', { name: 'Nova categoria', exact: true }).click();
  await page.getByLabel('Nome da categoria').fill('Categoria Sintética do Navegador');
  await page.getByRole('button', { name: 'Salvar categoria' }).click();
  await expect(
    page.getByRole('cell', { name: 'Categoria Sintética do Navegador', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Catálogo de produtos', exact: true }).click();
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  await page.getByLabel('Nome do produto').fill('Produto Sintético de Navegador');
  await page.getByLabel('Código interno / SKU').fill('BROWSER-PRODUCT');
  await page.getByLabel('Preço de venda por unidade (R$)', { exact: true }).fill('12,50');
  await page.getByLabel('Custo unitário estimado (R$, opcional)', { exact: true }).fill('4,25');
  await page
    .getByLabel('Categoria (obrigatória)', { exact: true })
    .selectOption({ label: 'Categoria Sintética do Navegador' });
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(page.getByRole('cell', { name: 'R$ 12,50', exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Editar produto Produto Sintético de Navegador', exact: true })
    .click();
  await page.getByLabel('Preço de venda por unidade (R$)', { exact: true }).fill('14,90');
  await page.getByLabel('Motivo da edição').selectOption('PRICE_REVIEW');
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(page.getByRole('cell', { name: 'R$ 14,90', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('catalog-desktop.png'), fullPage: true });
  await page
    .getByRole('button', { name: 'Editar produto Produto Sintético de Navegador', exact: true })
    .click();
  await page.getByLabel('Produto ativo', { exact: true }).uncheck();
  await page.getByLabel('Motivo da edição').selectOption('CATALOG_CORRECTION');
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await page.getByLabel('Situação do produto').selectOption('inactive');
  await expect(
    page.getByRole('button', { name: 'Ver produto Produto Sintético de Navegador', exact: true }),
  ).toBeVisible();
});

test('catalog search, category/origin filters, stable sorting and pagination work', async ({
  page,
}) => {
  const category = await createCategory(page, 'Categoria de Busca e Paginação');
  for (let n = 0; n < 23; n++)
    expect(
      (
        await page.request.post('/api/products', {
          headers: mutationHeaders,
          data: {
            code: `PAGE-${String(n).padStart(2, '0')}`,
            name: `Paginação Sintética ${String(n).padStart(2, '0')}`,
            categoryId: category.id,
            origin: n % 2 ? 'PURCHASED' : 'PRODUCED',
            sellingPriceCents: 100 + n,
          },
        })
      ).status(),
    ).toBe(201);
  await page.goto('/#products');
  await page.getByRole('searchbox', { name: 'Buscar produto' }).fill('Paginação Sintética');
  const table = page.locator('.registry-table');
  await expect(table.getByRole('row')).toHaveCount(21);
  await table.getByRole('button', { name: 'Próxima página' }).click();
  await expect(table.getByRole('row')).toHaveCount(4);
  await page.getByLabel('Origem do produto').selectOption('PURCHASED');
  await expect(table.getByRole('row')).toHaveCount(12);
  await page.getByLabel('Categoria do filtro', { exact: true }).selectOption(category.id);
  await page.getByLabel('Ordenar produtos').selectOption('price');
  await expect(table.getByRole('row')).toHaveCount(12);
});

test('CSV template, explicit mapping, row review, atomic import and retry show real results', async ({
  page,
}, testInfo) => {
  await createCustomer(page, { name: 'Contato Existente para CSV', phone: '85999993007' });
  await page.goto('/#customers');
  await page.getByRole('button', { name: 'Importar CSV', exact: true }).click();
  const templateDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar modelo CSV' }).click();
  const template = await templateDownload;
  const templatePath = testInfo.outputPath('synthetic-template.csv');
  await template.saveAs(templatePath);
  expect((await readFile(templatePath, 'utf8')).includes('"name";"phone"')).toBe(true);
  const csv =
    '\ufeffNome;Contato;Nascimento;Autorização\nCSV Navegador Novo;85999993008;29/02/1980;SIM\nCSV Navegador Inválido;;29/02;SIM\nCSV Navegador Compartilhado;85999993007;;SIM';
  await page.getByLabel('Arquivo CSV UTF-8').setInputFiles({
    name: 'clientes-sinteticos.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await expect(page.getByRole('heading', { name: 'Mapear colunas · 3 linhas' })).toBeVisible();
  await page.getByLabel('Nome (obrigatório)', { exact: true }).selectOption('Nome');
  await page.getByLabel('Telefone (opcional)', { exact: true }).selectOption('Contato');
  await page
    .getByLabel('Nascimento completo (opcional)', { exact: true })
    .selectOption('Nascimento');
  await page.getByRole('button', { name: 'Gerar prévia para revisão' }).click();
  await expect(
    page.getByRole('heading', { name: 'Revisar linhas antes de importar' }),
  ).toBeVisible();
  await expect(page.getByLabel('Decisão linha 2')).toHaveValue('SKIP');
  await expect(page.getByLabel('Decisão linha 3')).toHaveValue('SKIP');
  await page.getByLabel('Decisão linha 3').selectOption('CREATE');
  await page.getByLabel('Motivo linha 3').selectOption('SHARED_CONTACT');
  await page
    .getByLabel(
      'Revisei as linhas, os avisos e as escolhas. Nenhum registro existente será atualizado.',
    )
    .check();
  await page.route('**/customer-imports/*/confirm', async (route) => {
    await route.fetch();
    await route.abort('connectionfailed');
  });
  await page.getByRole('button', { name: 'Confirmar importação', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('confirmar a resposta');
  await page.unroute('**/customer-imports/*/confirm');
  await page.getByRole('button', { name: 'Repetir mesma confirmação', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Importação concluída' })).toBeVisible();
  await expect(
    page.getByText('2 cadastros criados · 1 linhas ignoradas.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Concluir', exact: true }).click();
  const data = await page.request.get('/api/customers?q=CSV%20Navegador');
  expect((await data.json()).total).toBe(2);
  await openCustomer(page, 'CSV Navegador Novo');
  await expect(page.getByText('Não informado', { exact: true }).first()).toBeVisible();
});

test('customer search, state filtering and pagination preserve stable registration ordering', async ({
  page,
}) => {
  for (let n = 0; n < 22; n++)
    await createCustomer(page, {
      name: `Cliente Paginação Sintética ${String(n).padStart(2, '0')}`,
    });
  await page.goto('/#customers');
  await page.getByRole('searchbox', { name: 'Buscar cliente' }).fill('Cliente Paginação Sintética');
  await page.getByLabel('Ordenar clientes').selectOption('registration');
  const table = page.locator('.registry-table');
  await expect(table.getByRole('row')).toHaveCount(21);
  await table.getByRole('button', { name: 'Próxima página' }).click();
  await expect(table.getByRole('row')).toHaveCount(3);
  await page.getByLabel('Situação do cliente').selectOption('inactive');
  await expect(page.getByRole('heading', { name: 'Nenhum cliente encontrado' })).toBeVisible();
  await page.getByLabel('Situação do cliente').selectOption('all');
  await expect(table.getByRole('row')).toHaveCount(21);
  await page
    .getByRole('searchbox', { name: 'Buscar cliente' })
    .fill('Cliente Paginação Sintética 21');
  await expect(table.getByRole('row')).toHaveCount(2);
});

test('CSV Escape cancellation keeps the dialog controlled until the server cancels the preview', async ({
  page,
}) => {
  await page.goto('/#customers');
  await page.getByRole('button', { name: 'Importar CSV', exact: true }).click();
  await page.getByLabel('Arquivo CSV UTF-8').setInputFiles({
    name: 'cancel-synthetic.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('nome\nCliente Sintético Cancelado', 'utf8'),
  });
  await page.getByLabel('Nome (obrigatório)', { exact: true }).selectOption('nome');
  await page.getByRole('button', { name: 'Gerar prévia para revisão' }).click();
  await expect(
    page
      .getByRole('table', { name: 'Revisão da importação' })
      .getByText('Cliente Sintético Cancelado', { exact: false })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar e fechar', exact: true })).toBeEnabled();
  const cancellation = page.waitForResponse(
    (response) => response.url().endsWith('/cancel') && response.request().method() === 'POST',
  );
  await page.keyboard.press('Escape');
  expect((await cancellation).status()).toBe(200);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(
    (await (await page.request.get('/api/customers?q=Cliente%20Sintético%20Cancelado')).json())
      .total,
  ).toBe(0);
});

test('owner export is explicit, minimal and formula-safe', async ({ page }, testInfo) => {
  await createCustomer(page, {
    name: '=BROWSER("teste")',
    email: 'export-browser@example.test',
    notes: 'Private note excluded from browser export',
  });
  await page.goto('/#customers');
  await page.getByRole('searchbox', { name: 'Buscar cliente' }).fill('=BROWSER');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Exclui cadastros anonimizados, CPF');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Confirmar exportação', exact: true }).click();
  const download = await downloadEvent;
  const path = testInfo.outputPath('synthetic-customer-export.csv');
  await download.saveAs(path);
  const csv = await readFile(path, 'utf8');
  expect(csv.startsWith('\ufeff')).toBe(true);
  expect(csv).toContain('"\'=BROWSER(""teste"")"');
  expect(csv).not.toContain('Private note excluded');
  expect(csv).not.toContain('passwordHash');
});

test('customer/catalog layouts, keyboard dialogs and Axe checks remain usable', async ({
  page,
}, testInfo) => {
  for (const hash of ['customers', 'products']) {
    await page.goto(`/#${hash}`);
    await expect(
      page.getByRole('searchbox', {
        name: hash === 'customers' ? 'Buscar cliente' : 'Buscar produto',
      }),
    ).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    const overflow = await page.evaluate(() => ({
      viewport: innerWidth,
      page: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((node) => {
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.right > innerWidth + 1 && !node.closest('.table-scroll');
        })
        .map((node) => ({
          tag: node.tagName,
          class: node.className,
          width: node.getBoundingClientRect().width,
          right: node.getBoundingClientRect().right,
        }))
        .slice(0, 20),
    }));
    expect(overflow.page, JSON.stringify({ hash, ...overflow })).toBeLessThanOrEqual(
      overflow.viewport,
    );
  }
  await page.goto('/#customers');
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('button', { name: 'Produtos', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Produtos', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('catalog-narrow.png'), fullPage: true });
});
