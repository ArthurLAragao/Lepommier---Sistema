import { describe, it, expect } from 'vitest';
import {
  batchEligible,
  stockAmounts,
  fefoCompare,
  movementDirection,
  openingInput,
  receiptInput,
  wasteInput,
  adjustmentInput,
  completeInput,
  canonicalCommand,
  hasPermission,
  productionCanTransition,
  yieldShortfall,
  MAX_BATCH_UNITS,
} from './index.js';
const id = '7db555bb-20e6-41d5-a7c0-bde1094f9ca0';
const batch = { reference: 'SYNTHETIC', expiresAt: '2026-10-17' };
describe('finished inventory contracts', () => {
  it.each([0, -1, 1.5, 100001, Number.MAX_SAFE_INTEGER])(
    'rejects non-command unit quantity %s',
    (quantity) =>
      expect(
        openingInput.safeParse({ productId: id, quantity, batch, reason: 'INITIAL_COUNT' }).success,
      ).toBe(false),
  );
  it('keeps exact aggregate decimal strings above Number safe range', () => {
    const amount = 90071992547409930000n;
    expect(stockAmounts(amount, 2n, null, '2026-10-17').available).toBe('90071992547409929998');
    expect(MAX_BATCH_UNITS).toBe(1000000000000n);
  });
  it('blocks expired physical stock without an automatic movement and separates reserved exceptions', () => {
    expect(stockAmounts(10n, 3n, '2026-10-16', '2026-10-17')).toEqual({
      physical: '10',
      reserved: '3',
      available: '0',
      blocked: '10',
      expiredReserved: '3',
    });
    expect(stockAmounts(10n, 3n, '2026-10-17', '2026-10-17').available).toBe('7');
    expect(() => stockAmounts(1n, 2n, null, '2026-10-17')).toThrow();
  });
  it('treats unknown expiry as explicit permission, never fabricated shelf-life', () => {
    expect(
      openingInput.safeParse({
        productId: id,
        quantity: 1,
        batch: { reference: 'Unknown', expiresAt: null },
        reason: 'INITIAL_COUNT',
      }).success,
    ).toBe(false);
    expect(
      openingInput.parse({
        productId: id,
        quantity: 1,
        batch: { reference: 'Unknown', expiresAt: null, expiryUnknownReason: 'NOT_PROVIDED' },
        reason: 'INITIAL_COUNT',
      }).batch.expiresAt,
    ).toBeNull();
    expect(batchEligible(null, '2026-10-17', '2026-10-20')).toBe(true);
    expect(batchEligible('2026-10-19', '2026-10-17', '2026-10-20')).toBe(false);
  });
  it('orders FEFO by dated expiry, receipt instant and ID, with unknown dates last', () => {
    const items = [
      { id: 'z', expiresAt: null, recordedAt: '2020-01-01T00:00:00Z' },
      { id: 'b', expiresAt: '2026-10-18', recordedAt: '2026-10-17T00:00:00Z' },
      { id: 'a', expiresAt: '2026-10-18', recordedAt: '2026-10-17T00:00:00Z' },
      { id: 'c', expiresAt: '2026-10-17', recordedAt: '2026-10-17T01:00:00Z' },
    ];
    expect(items.sort(fefoCompare).map((v) => v.id)).toEqual(['c', 'a', 'b', 'z']);
  });
  it('assigns direction from movement type instead of arbitrary signed input', () => {
    expect(movementDirection('PRODUCTION_RECEIPT')).toBe(1);
    for (const type of ['CONSUMPTION', 'WASTE', 'ADJUSTMENT_OUT'] as const)
      expect(movementDirection(type)).toBe(-1);
  });
  it('binds canonical typed payloads independently of property ordering', () => {
    expect(canonicalCommand({ b: 2, a: { y: null, x: 'á' } })).toBe(
      canonicalCommand({ a: { x: 'á', y: null }, b: 2 }),
    );
    expect(canonicalCommand({ q: 1 })).not.toBe(canonicalCommand({ q: 2 }));
    expect(() => canonicalCommand(NaN)).toThrow();
  });
  it('validates waste explanation, traceable positive adjustments and optional integer purchase snapshot', () => {
    expect(
      wasteInput.safeParse({ productId: id, batchId: id, version: 1, quantity: 1, reason: 'OTHER' })
        .success,
    ).toBe(false);
    expect(
      adjustmentInput.safeParse({
        productId: id,
        newBatch: batch,
        direction: 'OUT',
        quantity: 1,
        reason: 'COUNT_DIFFERENCE',
      }).success,
    ).toBe(false);
    expect(
      receiptInput.safeParse({
        productId: id,
        quantity: 1,
        batch,
        supplierReference: 'Synthetic',
        unitCostCents: 1.2,
      }).success,
    ).toBe(false);
    expect(completeInput.safeParse({ version: 1, actualQuantity: 0, batch }).success).toBe(false);
  });
  it('models permitted production transitions and shortfall without negative finished-stock movements', () => {
    expect(productionCanTransition('PLANNED', 'COMPLETED')).toBe(false);
    expect(productionCanTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(productionCanTransition('COMPLETED', 'CANCELLED')).toBe(false);
    expect(yieldShortfall(10, 6)).toBe(4);
    expect(yieldShortfall(10, 12)).toBe(0);
  });
  it('grants explicit inventory scopes and keeps internal reservations away from cashier/production', () => {
    expect(hasPermission('CASHIER', 'inventory.availability')).toBe(true);
    expect(hasPermission('CASHIER', 'inventory.read')).toBe(false);
    expect(hasPermission('PRODUCTION', 'inventory.waste')).toBe(true);
    expect(hasPermission('PRODUCTION', 'inventory.receive')).toBe(false);
    expect(hasPermission('PRODUCTION', 'inventory.cost')).toBe(false);
    expect(hasPermission('MANAGER', 'inventory.adjust')).toBe(true);
    expect(hasPermission('MANAGER', 'inventory.cost')).toBe(true);
    expect(hasPermission('PRODUCTION', 'inventory.reservations')).toBe(false);
  });
});
