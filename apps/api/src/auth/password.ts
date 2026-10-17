import { Algorithm, hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { AppError } from '../errors.js';

const options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};
export class PasswordHasher {
  private active = 0;
  private dummy: Promise<string> | undefined;
  private async work<T>(job: () => Promise<T>): Promise<T> {
    if (this.active >= 2)
      throw new AppError(
        429,
        'AUTH_BUSY',
        'Há acessos sendo verificados. Aguarde alguns segundos e tente novamente.',
      );
    this.active++;
    try {
      return await job();
    } finally {
      this.active--;
    }
  }
  hash(password: string): Promise<string> {
    return this.work(() => hash(password, options));
  }
  private dummyHash(): Promise<string> {
    this.dummy ??= this.hash(randomBytes(32).toString('base64url')).catch((error: unknown) => {
      this.dummy = undefined;
      throw error;
    });
    return this.dummy;
  }
  async verify(passwordHash: string | undefined, password: string): Promise<boolean> {
    const encoded = passwordHash ?? (await this.dummyHash());
    return this.work(() => verify(encoded, password));
  }
}
