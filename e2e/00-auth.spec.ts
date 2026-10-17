import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import {
  ensureOwner,
  mutationHeaders,
  ownerLogin,
  ownerPassword,
  rememberSession,
  setupSecret,
} from './auth-fixture.js';

test('first-run setup is private, keyboard accessible and submitted once', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Preparar o acesso da loja' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('setup-desktop.png'), fullPage: true });
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).not.toBeVisible();
  const state = await page.request.get('/api/auth/state');
  expect((await state.text()).includes(setupSecret())).toBe(false);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByLabel('Seu nome', { exact: true }).fill('Proprietário de teste');
  await page.getByLabel('Usuário', { exact: true }).fill(ownerLogin);
  await page.getByLabel('Senha', { exact: true }).fill(ownerPassword!);
  await page.getByLabel('Chave de instalação', { exact: true }).fill(setupSecret());
  let submissions = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/auth/setup') && request.method() === 'POST') submissions++;
  });
  await page.getByRole('button', { name: 'Criar primeiro acesso' }).dblclick();
  await expect(page.getByRole('heading', { name: 'Entrar no sistema' })).toBeVisible();
  expect(submissions).toBe(1);
});

test('invalid login feedback, valid login, current user and local assets', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Usuário', { exact: true }).fill('missing-person');
  await page.getByLabel('Senha', { exact: true }).fill('invalid test password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Usuário ou senha não conferem');
  await expect(page.getByRole('alert')).toContainText('Identificador:');
  await page.getByLabel('Usuário', { exact: true }).fill(ownerLogin);
  await page.getByLabel('Senha', { exact: true }).fill(ownerPassword!);
  await page.getByLabel('Senha', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();
  await expect(page.getByText('Proprietário de teste', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await rememberSession(page);
});

test('failed initial session verification gates the shell and supports retry', async ({ page }) => {
  await ensureOwner(page);
  await page.route('**/api/auth/me', (route) => route.abort('connectionfailed'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('A instalação precisa de atenção');
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).not.toBeVisible();
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();
});

test('owner manages accounts through accessible dialogs', async ({ page }, testInfo) => {
  await ensureOwner(page);
  await page.goto('/#settings');
  await page.getByRole('button', { name: 'Adicionar pessoa' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Adicionar pessoa' }).click();
  await page.getByLabel('Nome da pessoa', { exact: true }).fill('Pessoa para teste');
  await page.getByLabel('Usuário', { exact: true }).fill('equipe-browser');
  await page.getByLabel('Senha inicial', { exact: true }).fill(`${ownerPassword}staff`);
  await page.getByLabel('Senha inicial', { exact: true }).fill('🍎'.repeat(129));
  expect(await page.getByLabel('Senha inicial', { exact: true }).inputValue()).toBe(
    '🍎'.repeat(129),
  );
  await page.getByRole('button', { name: 'Salvar conta' }).click();
  await expect(page.getByRole('alert')).toContainText('12 a 128 caracteres');
  await page.getByLabel('Senha inicial', { exact: true }).fill(`${ownerPassword}staff`);
  await page.getByRole('button', { name: 'Salvar conta' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Pessoa para teste' });
  await expect(row).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('accounts-desktop.png'), fullPage: true });
  await row.getByRole('button', { name: 'Editar Pessoa para teste', exact: true }).click();
  await page.getByRole('combobox', { name: 'Perfil de acesso' }).selectOption('MANAGER');
  await page.getByLabel('Motivo da alteração').fill('Mudança autorizada no teste');
  await page.getByRole('button', { name: 'Salvar conta' }).click();
  await expect(row.getByRole('cell', { name: 'Gerente', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Desativar Pessoa para teste', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Desativar conta?' })).toBeVisible();
  await page.getByLabel('Motivo', { exact: true }).fill('Fim do acesso de teste');
  await page.getByRole('button', { name: 'Confirmar desativação' }).click();
  await expect(row.getByText('Desativada', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Reativar Pessoa para teste', exact: true }).click();
  await page.getByLabel('Motivo', { exact: true }).fill('Retomada de teste');
  await page.getByRole('button', { name: 'Confirmar reativação' }).click();
  await expect(row.getByText('Ativa', { exact: true })).toBeVisible();
  await row
    .getByRole('button', { name: 'Redefinir senha de Pessoa para teste', exact: true })
    .click();
  await page.getByLabel('Sua senha de proprietário').fill(ownerPassword!);
  await page.getByLabel('Nova senha da pessoa').fill(`${ownerPassword}reset`);
  await page.getByLabel('Motivo da redefinição').fill('Recuperação autorizada para teste');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Redefinir senha', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('delayed account refresh cannot restore authenticated UI after logout', async ({ page }) => {
  await ensureOwner(page);
  await page.goto('/#settings');
  const owner = page.getByRole('row').filter({ hasText: ownerLogin });
  await expect(owner).toBeVisible();
  let release: (() => void) | undefined;
  let captured: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route('**/api/auth/me', async (route) => {
    const response = await route.fetch();
    captured?.();
    await held;
    await route.fulfill({ response });
  });
  try {
    await owner.getByRole('button', { name: 'Editar Proprietário de teste', exact: true }).click();
    await page.getByLabel('Motivo da alteração').fill('Teste de resposta atrasada');
    await page.getByRole('button', { name: 'Salvar conta' }).click();
    await ready;
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Entrar no sistema' })).toBeVisible();
    const returned = page.waitForResponse((response) => response.url().endsWith('/api/auth/me'));
    release?.();
    await returned;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await expect(page.getByRole('heading', { name: 'Entrar no sistema' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).not.toBeVisible();
  } finally {
    release?.();
  }
});

test('own password change ends the session and accepts the complete replacement', async ({
  page,
}) => {
  await ensureOwner(page);
  const created = await page.request.post('/api/users', {
    headers: mutationHeaders,
    data: {
      loginIdentifier: 'browser-password',
      displayName: 'Senha de teste',
      role: 'CASHIER',
      password: ownerPassword,
    },
  });
  expect(created.status()).toBe(201);
  const user = (await created.json()).user;
  await page.context().clearCookies();
  expect(
    (
      await page.request.post('/api/auth/login', {
        headers: mutationHeaders,
        data: { loginIdentifier: 'browser-password', password: ownerPassword },
      })
    ).status(),
  ).toBe(200);
  await page.goto('/#settings');
  const replacement = `${ownerPassword}  🍎`;
  await page.getByLabel('Senha atual', { exact: true }).fill(ownerPassword!);
  await page.getByLabel('Nova senha', { exact: true }).fill(replacement);
  await page.getByLabel('Confirmar nova senha', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Alterar minha senha', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrar no sistema' })).toBeVisible();
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  await page.getByLabel('Usuário', { exact: true }).fill('browser-password');
  await page.getByLabel('Senha', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  await ensureOwner(page);
  expect(
    (
      await page.request.patch(`/api/users/${user.id}`, {
        headers: mutationHeaders,
        data: {
          displayName: user.displayName,
          role: user.role,
          active: false,
          version: user.version + 1,
          reason: 'Encerramento do teste de senha',
        },
      })
    ).status(),
  ).toBe(200);
});

for (const role of ['CASHIER', 'PRODUCTION'] as const) {
  test(`${role} cannot see or call account administration`, async ({ page }) => {
    await ensureOwner(page);
    const login = `browser-${role.toLowerCase()}`;
    const created = await page.request.post('/api/users', {
      headers: mutationHeaders,
      data: {
        loginIdentifier: login,
        displayName: 'Perfil restrito de teste',
        role,
        password: ownerPassword,
      },
    });
    expect(created.status()).toBe(201);
    const user = (await created.json()).user;
    await page.context().clearCookies();
    expect(
      (
        await page.request.post('/api/auth/login', {
          headers: mutationHeaders,
          data: { loginIdentifier: login, password: ownerPassword },
        })
      ).status(),
    ).toBe(200);
    await page.goto('/#settings');
    await expect(page.getByRole('heading', { name: 'Alterar minha senha' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adicionar pessoa' })).not.toBeVisible();
    expect((await page.request.get('/api/users')).status()).toBe(403);
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
            reason: 'Encerramento do teste',
          },
        })
      ).status(),
    ).toBe(200);
  });
}

test('session expiration removes the protected shell using actual server state', async ({
  page,
}) => {
  await ensureOwner(page);
  await page.goto('/');
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL! });
  await db.connect();
  try {
    await db.query(
      'UPDATE "Session" SET "createdAt"=$1, "expiresAt"=$2 WHERE "userId"=(SELECT "id" FROM "User" WHERE "loginIdentifier"=$3) AND "revokedAt" IS NULL',
      [new Date(Date.now() - 86400000), new Date(Date.now() - 1000), ownerLogin],
    );
  } finally {
    await db.end();
  }
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: 'Entrar no sistema' })).toBeVisible();
  await expect(
    page.getByText('Seu acesso terminou. Entre novamente para continuar.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).not.toBeVisible();
});

test('logout clears the session and login remains accessible at narrow width', async ({
  page,
}, testInfo) => {
  await ensureOwner(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrar no sistema' })).toBeVisible();
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  await page.screenshot({ path: testInfo.outputPath('login-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('login-narrow.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
