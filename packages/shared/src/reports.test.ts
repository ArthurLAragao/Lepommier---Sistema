import { describe, it, expect } from 'vitest';
import {
  reportPeriod,
  reportPreset,
  reportQuery,
  permittedReports,
  reportDefinitions,
} from './reports.js';
import { hasPermission } from './auth.js';
import { escapeCsvCell } from './format.js';
import { formatOrderMoney } from './sales.js';
describe('reporting date/permission/serialization contract', () => {
  it('uses Fortaleza boundaries rather than UTC calendar or browser time', () => {
    const p = reportPeriod({}, new Date('2026-10-15T02:59:59Z'));
    expect(p.from).toBe('2026-10-14');
    expect(p.start).toBe('2026-10-14T03:00:00.000Z');
    expect(p.end).toBe('2026-10-15T03:00:00.000Z');
  });
  it('seven days include today and yesterday crosses year boundary', () => {
    expect(reportPreset('2026-01-01', 'seven')).toEqual({ from: '2025-12-26', to: '2026-01-01' });
    expect(reportPreset('2026-01-01', 'yesterday')).toEqual({
      from: '2025-12-31',
      to: '2025-12-31',
    });
  });
  it('month and leap-day ranges remain date-only', () => {
    expect(reportPreset('2024-02-29', 'month')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(
      reportPeriod({ from: '2024-02-28', to: '2024-02-29' }, new Date('2026-01-01T12:00:00Z')).end,
    ).toBe('2024-03-01T03:00:00.000Z');
  });
  it('rejects impossible/reversed/future/excessive ranges', () => {
    expect(reportQuery.safeParse({ from: '2026-02-30' }).success).toBe(false);
    const now = new Date('2026-10-17T12:00:00Z');
    for (const q of [
      { from: '2026-10-17', to: '2026-10-16' },
      { from: '2026-10-17', to: '2026-10-18' },
      { from: '2020-01-01', to: '2026-10-17' },
    ])
      expect(() => reportPeriod(q, now)).toThrow();
  });
  it('allowlists fields/directions and explicit observation horizon', () => {
    for (const q of [
      { sort: 'DROP' },
      { direction: 'desc;select' },
      { expiryDays: 31 },
      { expiryDays: -1 },
      { productId: "' OR 1=1" },
    ])
      expect(reportQuery.safeParse(q).success).toBe(false);
    expect(reportQuery.parse({ expiryDays: 0 }).expiryDays).toBe(0);
  });
  it('does not grant owner dashboard/export/costs to restricted roles', () => {
    expect(permittedReports('CASHIER')).toEqual([]);
    expect(permittedReports('PRODUCTION')).toEqual(['production', 'waste', 'inventory']);
    expect(hasPermission('MANAGER', 'reports.dashboard')).toBe(false);
    expect(hasPermission('MANAGER', 'reports.export')).toBe(false);
    expect(hasPermission('PRODUCTION', 'reports.cost')).toBe(false);
  });
  it('keeps exact signed monetary serialization and safe CSV formula quoting', () => {
    expect(formatOrderMoney('-300')).toContain('-R$');
    expect(formatOrderMoney('99999999999999999999')).toContain('999,99');
    expect(escapeCsvCell(' =1+1')).toBe('"\' =1+1"');
    expect(escapeCsvCell('A;"B"\nC')).toBe('"A;""B""\nC"');
  });
  it('defines separate receipts/fulfillment/refund and stock bases without profit', () => {
    expect(reportDefinitions.sales.basis).toContain('Data da entrega');
    expect(reportDefinitions.payments.basis).toContain('Data de registro');
    expect(reportDefinitions.inventory.basis).toContain('não reconstruções históricas');
    expect(
      Object.values(reportDefinitions).some((d) => d.label.toLowerCase().includes('lucro')),
    ).toBe(false);
  });
});
