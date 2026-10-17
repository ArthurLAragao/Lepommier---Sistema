import { describe, it, expect } from 'vitest';
import {
  priceCart,
  pickupInstant,
  pickupLocalOf,
  orderCanTransition,
  formatOrderMoney,
  draftInput,
  paymentInput,
  checkoutInput,
  hasPermission,
} from './index.js';
const productId = '7db555bb-20e6-41d5-a7c0-bde1094f9ca0';
const line = { productId, quantity: 2, productVersion: 1, unitPriceCents: 1250 };
describe('sales/payment contracts', () => {
  it('calculates exact money and deterministic cent allocations without negative tiny lines', () => {
    const p = priceCart(
      [
        { quantity: 1, unitPriceCents: 100 },
        { quantity: 1, unitPriceCents: 100 },
        { quantity: 1, unitPriceCents: 0 },
      ],
      '1',
    );
    expect(p).toMatchObject({ subtotalCents: '200', totalCents: '199' });
    expect(p.lines.map((l) => l.discountCents)).toEqual(['0', '1', '0']);
    for (let d = 0; d <= 15; d++) {
      const r = priceCart(
        [
          { quantity: 1, unitPriceCents: 7 },
          { quantity: 1, unitPriceCents: 7 },
          { quantity: 1, unitPriceCents: 1 },
        ],
        String(d),
      );
      expect(r.lines.reduce((n, l) => n + BigInt(l.discountCents), 0n)).toBe(BigInt(d));
      expect(r.lines.every((l) => BigInt(l.totalCents) >= 0n)).toBe(true);
    }
  });
  it('rejects fractional units, excessive totals and discounts before unsafe arithmetic', () => {
    expect(() => priceCart([{ quantity: 100000, unitPriceCents: 99999999 }], '0')).toThrow();
    expect(() => priceCart([{ quantity: 1.5, unitPriceCents: 1 }], '0')).toThrow();
    expect(() => priceCart([{ quantity: 1, unitPriceCents: 1 }], '2')).toThrow();
    expect(formatOrderMoney('900719925474099301')).toBe('R$\u00a09.007.199.254.740.993,01');
  });
  it('resolves Fortaleza local pickup independently from host/browser timezone', () => {
    expect(pickupInstant('2026-10-17T00:05').toISOString()).toBe('2026-10-17T03:05:00.000Z');
    expect(pickupLocalOf('2026-10-18T02:59:00Z')).toBe('2026-10-17T23:59');
    expect(() => pickupInstant('2026-02-30T12:00')).toThrow();
    expect(() => pickupInstant('2026-10-17T25:00')).toThrow();
  });
  it('requires identified scheduled WhatsApp and explicit manual payment without card data', () => {
    expect(draftInput.safeParse({ source: 'WHATSAPP', lines: [line] }).success).toBe(false);
    expect(draftInput.safeParse({ source: 'COUNTER', lines: [line] }).success).toBe(true);
    expect(
      paymentInput.safeParse({ amountCents: '2500', method: 'PIX', manuallyConfirmed: false })
        .success,
    ).toBe(false);
    expect(
      paymentInput.safeParse({
        amountCents: '2500',
        method: 'CREDIT_CARD',
        manuallyConfirmed: true,
        cardNumber: 'not-collected',
      }).success,
    ).toBe(false);
    expect(
      checkoutInput.safeParse({
        draft: { source: 'WHATSAPP', lines: [line] },
        payment: { amountCents: '2500', method: 'CASH', manuallyConfirmed: true },
      }).success,
    ).toBe(false);
  });
  it('keeps terminal fulfillment and payment status separate with restricted discounts/refunds', () => {
    expect(orderCanTransition('FULFILLED', 'CANCELLED')).toBe(false);
    expect(orderCanTransition('READY', 'FULFILLED')).toBe(true);
    expect(orderCanTransition('DRAFT', 'FULFILLED')).toBe(false);
    expect(hasPermission('CASHIER', 'orders.pay')).toBe(true);
    expect(hasPermission('CASHIER', 'inventory.reservations')).toBe(false);
    expect(hasPermission('MANAGER', 'cash.open')).toBe(true);
    expect(hasPermission('MANAGER', 'orders.refund')).toBe(false);
    expect(hasPermission('PRODUCTION', 'orders.read')).toBe(false);
  });
});
