import { readFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const ownerLogin = process.env.E2E_OWNER_LOGIN ?? 'pilot-owner';
export const ownerPassword = process.env.E2E_OWNER_PASSWORD;
if (!ownerPassword)
  throw new Error('E2E_OWNER_PASSWORD must be generated for the isolated test database.');
export const origin = 'http://127.0.0.1:3333';
export const mutationHeaders = { origin, 'x-pommier-csrf': '1' };
let cachedCookie: Awaited<ReturnType<BrowserContext['cookies']>> | undefined;
export function setupSecret() {
  if (!process.env.E2E_SETUP_SECRET_FILE) throw new Error('E2E_SETUP_SECRET_FILE is required.');
  return readFileSync(process.env.E2E_SETUP_SECRET_FILE, 'utf8').trim();
}
export async function rememberSession(page: Page) {
  cachedCookie = (await page.context().cookies(origin)).filter(
    (cookie) => cookie.name === 'pommier_session',
  );
}
/** Only isolated synthetic test cookies remain in memory; no storage-state files. */
export async function ensureOwner(page: Page) {
  if (cachedCookie) await page.context().addCookies(cachedCookie);
  if ((await page.request.get('/api/auth/me')).status() === 200) return;
  const state = await page.request.get('/api/auth/state');
  if (!(await state.json()).initialized) {
    const setup = await page.request.post('/api/auth/setup', {
      headers: mutationHeaders,
      data: {
        loginIdentifier: ownerLogin,
        displayName: 'Proprietário de teste',
        password: ownerPassword,
        installationSecret: setupSecret(),
      },
    });
    expect(setup.status()).toBe(200);
  }
  const login = await page.request.post('/api/auth/login', {
    headers: mutationHeaders,
    data: { loginIdentifier: ownerLogin, password: ownerPassword },
  });
  expect(login.status()).toBe(200);
  await rememberSession(page);
}
