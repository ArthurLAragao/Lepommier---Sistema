import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ensureOwner } from './auth-fixture.js';
test.beforeEach(async ({ page }) => {
  await ensureOwner(page);
});

test('local shell, real API connection and honest unavailable modules', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verificar conexão' })).toBeEnabled();
  await expect(
    page.getByText('Painel consolidado de operações ainda não disponível.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Vendas Em breve', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Vendas ainda não está disponível' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test('settings search, filtering and pagination work', async ({ page }) => {
  await page.goto('/#settings');
  await expect(page.getByText('Conexão desta instalação')).toBeVisible();
  const modules = page.locator('.module-card');
  await modules.getByRole('button', { name: 'Próxima página' }).click();
  await expect(page.getByText('Página 2 de 2')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar módulo' }).fill('vendas');
  await expect(modules.getByRole('cell', { name: 'Vendas', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Disponibilidade' }).selectOption('available');
  await expect(page.getByRole('heading', { name: 'Nenhum módulo encontrado' })).toBeVisible();
});

test('about dialog traps focus, closes with Escape and restores focus', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Sobre esta versão' });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('connection error and retry recover without invented success', async ({ page }) => {
  await page.route('**/api/system/status', (route) => route.abort('connectionfailed'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Não foi possível conectar ao sistema');
  await page.unroute('**/api/system/status');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('alert')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Verificar conexão' })).toBeEnabled();
});

test('installed production assets need no external requests', async ({ page }) => {
  const external: string[] = [];
  await page.route('**/*', async (route) => {
    if (!route.request().url().startsWith('http://127.0.0.1:3333/')) {
      external.push(route.request().url());
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Verificar conexão' })).toBeEnabled();
  expect(external).toEqual([]);
});

test('small screen has no horizontal overflow and navigation is usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('accessibility checks cover the overview, settings and dialog', async ({ page }) => {
  for (const hash of ['', '#settings']) {
    await page.goto(`/${hash}`);
    await expect(page.getByRole('button', { name: 'Verificar conexão' })).toBeEnabled();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map(({ target }) => target),
      })),
    ).toEqual([]);
  }
  await page.getByRole('button', { name: 'Sobre esta versão' }).click();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
  ).toEqual([]);
});
