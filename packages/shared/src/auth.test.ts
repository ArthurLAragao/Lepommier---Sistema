import { describe, expect, it } from 'vitest';
import {
  hasPermission,
  loginIdentifierSchema,
  normalizeLogin,
  passwordSchema,
  sessionExpiry,
  setupSchema,
} from './auth.js';
describe('identity contracts', () => {
  it('normalizes ASCII login identifiers without changing passwords', () => {
    expect(normalizeLogin('  Staff.Name-1  ')).toBe('staff.name-1');
    expect(loginIdentifierSchema.parse('  Owner  ')).toBe('owner');
    const password = '   café com pão   ';
    expect(passwordSchema.parse(password)).toBe(password);
  });
  it.each(['ab', 'joão', 'a b c', 'user@email.com', 'ＡＢＣ', '<script>'])(
    'rejects unsupported identifier %s',
    (value) => {
      expect(loginIdentifierSchema.safeParse(value).success).toBe(false);
    },
  );
  it('validates length without silently truncating multibyte passwords', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse(' '.repeat(12)).success).toBe(false);
    expect(passwordSchema.parse('🔐'.repeat(128))).toHaveLength(256);
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });
  it('reserves account and audit administration for owners', () => {
    expect(hasPermission('OWNER', 'accounts.manage')).toBe(true);
    for (const role of ['MANAGER', 'CASHIER', 'PRODUCTION'] as const) {
      expect(hasPermission(role, 'accounts.manage')).toBe(false);
      expect(hasPermission(role, 'security.review')).toBe(false);
      expect(hasPermission(role, 'profile.self')).toBe(true);
    }
  });
  it('uses absolute twelve-hour expiry', () => {
    expect(sessionExpiry(new Date('2026-10-18T02:00:00Z')).toISOString()).toBe(
      '2026-10-18T14:00:00.000Z',
    );
  });
  it('rejects privilege/mutation fields not in a setup contract', () => {
    expect(
      setupSchema.safeParse({
        loginIdentifier: 'owner',
        displayName: 'Test Owner',
        password: 'a long test passphrase',
        installationSecret: 'secret',
        role: 'OWNER',
      }).success,
    ).toBe(false);
  });
});
