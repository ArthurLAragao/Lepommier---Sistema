import { expect, it } from 'vitest';
import { PasswordHasher } from './password.js';

it('bounds native password work and recovers after a busy dummy-hash attempt', async () => {
  const hasher = new PasswordHasher();
  const work = [hasher.hash('synthetic first password'), hasher.hash('synthetic second password')];
  await expect(hasher.verify(undefined, 'synthetic unknown password')).rejects.toMatchObject({
    code: 'AUTH_BUSY',
  });
  const [encoded] = await Promise.all(work);
  expect(encoded).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  expect(await hasher.verify(undefined, 'synthetic unknown password')).toBe(false);
  expect(await hasher.verify(encoded, 'synthetic first password')).toBe(true);
  expect(await hasher.verify(encoded, 'synthetic first password ')).toBe(false);
});
