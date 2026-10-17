import { describe, it, expect } from 'vitest';
import { transientInventoryError } from './service.js';
describe('bounded inventory retry classification', () => {
  it('retries only recognized serialization/deadlock codes including Prisma driver wrappers', () => {
    expect(transientInventoryError({ code: 'P2034' })).toBe(true);
    expect(transientInventoryError({ code: 'P2010', meta: { code: '40001' } })).toBe(true);
    expect(
      transientInventoryError({ cause: { driverAdapterError: { cause: { code: '40P01' } } } }),
    ).toBe(true);
    for (const code of ['P2002', '23514', 'P2028', '57014'])
      expect(transientInventoryError({ code })).toBe(false);
    expect(transientInventoryError(new Error('deadlock maybe'))).toBe(false);
  });
  it('bounds cyclic/deep driver errors and rejects non-error inputs', () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    expect(transientInventoryError(error)).toBe(false);
    expect(transientInventoryError(null)).toBe(false);
    expect(transientInventoryError('40001')).toBe(false);
  });
});
