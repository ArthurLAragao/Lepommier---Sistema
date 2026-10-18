import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  expectedCash,
  methodSummary,
  closingDifference,
  cashMovementInput,
  cashCloseInput,
  cashReverseInput,
  correctionDirection,
  cashUnsigned,
  MAX_CASH_SESSION_CENTS,
  parseCashCounted,
} from './cash.js';
import { formatOrderMoney } from './sales.js';
import { hasPermission } from './auth.js';
describe('cash arithmetic and contracts', () => {
  it('derives physical cash from sale amount, not gross tender or electronic methods', () => {
    const methods = methodSummary(
      [
        { method: 'CASH', amountCents: '1250' },
        { method: 'PIX', amountCents: '5000' },
        { method: 'CREDIT_CARD', amountCents: '9000' },
        { method: 'DEBIT_CARD', amountCents: '3000' },
      ],
      [
        { method: 'CASH', amountCents: '250' },
        { method: 'PIX', amountCents: '7000' },
      ],
    );
    expect(methods.CASH.netCents).toBe('1000');
    expect(methods.PIX.netCents).toBe('-2000');
    expect(
      expectedCash({
        openingFloatCents: '10000',
        cashPaymentsCents: methods.CASH.grossCents,
        cashRefundsCents: methods.CASH.refundCents,
        additionsCents: '500',
        withdrawalsCents: '300',
        expensesCents: '200',
        correctionsCents: '-100',
      }),
    ).toBe('10900');
  });
  it('keeps large session sums exact and difference sign explicit', () => {
    expect(closingDifference('999999999999', '999999999998')).toBe('1');
    expect(closingDifference('50', '100')).toBe('-50');
    expect(MAX_CASH_SESSION_CENTS).toBe(999999999999n);
    expect(cashUnsigned.safeParse('1000000000000').success).toBe(false);
    expect(cashUnsigned.safeParse('-1').success).toBe(false);
    expect(parseCashCounted('9.999.999.999,99')).toBe('999999999999');
    expect(() => parseCashCounted('10.000.000.000,00')).toThrow();
    expect(formatOrderMoney('-50')).toBe('-R$\u00a00,50');
  });
  it('requires positive bounded posted movement, reason, expense-only category and safe reference', () => {
    const v = {
      sessionId: randomUUID(),
      kind: 'CASH_ADDITION',
      amountCents: '10',
      reason: 'Synthetic drawer float',
    };
    expect(cashMovementInput.safeParse(v).success).toBe(true);
    for (const amountCents of ['0', '-1', '1.2', '100000000'])
      expect(cashMovementInput.safeParse({ ...v, amountCents }).success).toBe(false);
    expect(cashMovementInput.safeParse({ ...v, kind: 'CASH_EXPENSE' }).success).toBe(false);
    expect(cashMovementInput.safeParse({ ...v, category: 'OTHER' }).success).toBe(false);
    expect(
      cashMovementInput.safeParse({ ...v, reference: 'private person@example.invalid' }).success,
    ).toBe(false);
  });
  it('requires explicit irreversible-close confirmation and rejects hidden/backdated inputs', () => {
    const v = { sessionId: randomUUID(), activityVersion: 2, countedCents: '100', confirmed: true };
    expect(cashCloseInput.safeParse(v).success).toBe(true);
    expect(cashCloseInput.safeParse({ ...v, confirmed: false }).success).toBe(false);
    expect(cashCloseInput.safeParse({ ...v, recordedAt: '2001-01-01' }).success).toBe(false);
  });
  it('classifies only linked single opposite-direction reversals', () => {
    expect(correctionDirection('CASH_ADDITION')).toBe(1);
    expect(correctionDirection('CASH_EXPENSE')).toBe(-1);
    expect(correctionDirection('CASH_REVERSAL', 1)).toBe(-1);
    expect(correctionDirection('CASH_REVERSAL', -1)).toBe(1);
    expect(() => correctionDirection('CASH_REVERSAL')).toThrow();
    expect(
      cashReverseInput.safeParse({
        movementId: randomUUID(),
        reason: 'Confirmed inverse movement',
        physicalMovementConfirmed: true,
        amountCents: '999',
      }).success,
    ).toBe(false);
  });
  it('keeps privileged review/corrections separate from cashier and production', () => {
    expect(hasPermission('OWNER', 'cash.review')).toBe(true);
    expect(hasPermission('MANAGER', 'cash.close')).toBe(true);
    expect(hasPermission('MANAGER', 'cash.review')).toBe(false);
    expect(hasPermission('CASHIER', 'cash.current')).toBe(true);
    for (const role of ['CASHIER', 'PRODUCTION'] as const)
      for (const permission of [
        'cash.read',
        'cash.movements',
        'cash.close',
        'cash.review',
        'cash.correct',
      ] as const)
        expect(hasPermission(role, permission)).toBe(false);
  });
});
