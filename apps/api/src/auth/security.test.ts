import { describe, expect, it } from 'vitest';
import { isLoopback, safeAuditMetadata, secretMatches, tokenDigest } from './security.js';
import { PasswordHasher } from './password.js';
describe('security primitives', () => {
  it('accepts explicit IPv4, IPv6 and mapped loopback only', () => {
    for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) expect(isLoopback(ip)).toBe(true);
    for (const ip of ['192.168.1.2', '203.0.113.1', 'localhost', '127.0.0.1.evil'])
      expect(isLoopback(ip)).toBe(false);
  });
  it('compares installation secrets and creates non-usable token digests', () => {
    expect(secretMatches('first', 'first')).toBe(true);
    expect(secretMatches('first', 'second')).toBe(false);
    expect(tokenDigest('test-token')).toHaveLength(64);
    expect(tokenDigest('test-token')).not.toBe('test-token');
  });
  it('whitelists audit metadata and removes submitted secrets/bodies', () => {
    expect(
      safeAuditMetadata({
        role: 'MANAGER',
        active: false,
        reason: 'shift change',
        password: 'secret',
        token: 'token',
        installationSecret: 'key',
        body: { password: 'secret' },
        sessionDigest: 'digest',
      }),
    ).toEqual({ role: 'MANAGER', active: false, reason: 'shift change' });
  });
  it('uses salted Argon2id and verifies full Unicode input', async () => {
    const hasher = new PasswordHasher();
    const password = '🔐'.repeat(128);
    const hash = await hasher.hash(password);
    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(await hasher.verify(hash, password)).toBe(true);
    expect(await hasher.verify(hash, password.slice(0, -2))).toBe(false);
  });
  it('bounds concurrent password work without an unbounded queue', async () => {
    const hasher = new PasswordHasher();
    const results = await Promise.allSettled([
      hasher.hash('first test passphrase'),
      hasher.hash('second test passphrase'),
      hasher.hash('third test passphrase'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason.code).toBe('AUTH_BUSY');
  });
});
