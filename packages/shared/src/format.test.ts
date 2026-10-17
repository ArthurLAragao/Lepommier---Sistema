import { describe, expect, it } from 'vitest';
import { moneyCentsSchema, unitQuantitySchema } from './contracts.js';
import {
  businessDateOf,
  businessDayRange,
  escapeCsvCell,
  formatBusinessDate,
  formatDateTime,
  formatMoney,
  parseMoney,
} from './format.js';

describe('integer money and units', () => {
  it.each([
    ['25,90', 2590],
    ['25,9', 2590],
    ['1.234,56', 123456],
    ['0', 0],
    [' 12 ', 1200],
  ])('parses %s', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });
  it.each([
    '1.2',
    '1,234',
    '-1',
    '1e3',
    'NaN',
    '',
    '1,2,3',
    '01,00',
    '1.00,00',
    '9999999,99',
    'R$ 25,90',
  ])('rejects malformed/unsupported money %s', (input) => {
    expect(() => parseMoney(input)).toThrow();
  });
  it('uses Brazilian currency formatting', () => {
    expect(formatMoney(2590).replace(/\s/g, ' ')).toBe('R$ 25,90');
    expect(() => formatMoney(0.5)).toThrow();
  });
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 100001])(
    'rejects invalid unit quantity %s',
    (value) => {
      expect(unitQuantitySchema.safeParse(value).success).toBe(false);
    },
  );
  it('rejects client money floats and allows whole units', () => {
    expect(moneyCentsSchema.safeParse(12.5).success).toBe(false);
    expect(unitQuantitySchema.parse(3)).toBe(3);
  });
});

describe('Fortaleza business dates', () => {
  it('changes day at 03:00 UTC, regardless of host timezone', () => {
    expect(businessDateOf('2026-10-18T02:59:59.999Z')).toBe('2026-10-17');
    expect(businessDateOf('2026-10-18T03:00:00.000Z')).toBe('2026-10-18');
  });
  it('uses half-open day ranges across year boundaries', () => {
    const range = businessDayRange('2026-12-31');
    expect(range.start.toISOString()).toBe('2026-12-31T03:00:00.000Z');
    expect(range.end.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });
  it('handles leap days and rejects invalid dates', () => {
    expect(businessDayRange('2028-02-29').end.toISOString()).toBe('2028-03-01T03:00:00.000Z');
    expect(() => businessDayRange('2026-02-29')).toThrow();
    expect(() => businessDayRange('17/10/2026')).toThrow();
  });
  it('formats in Portuguese and refuses timezone-less timestamps', () => {
    expect(formatBusinessDate('2026-10-17')).toBe('17/10/2026');
    expect(formatDateTime('2026-10-17T18:45:00Z')).toBe('17/10/2026 às 15:45');
    expect(() => formatDateTime('2026-10-17T18:45:00')).toThrow();
  });
});

describe('CSV formula protection', () => {
  it.each(['=SUM(A1)', '+123', '-12', '@cmd', '  =1', '\t=1', '\runsafe'])(
    'neutralizes %j',
    (value) => {
      expect(escapeCsvCell(value)).toBe(`"'${value}"`);
    },
  );
  it('quotes commas, quotes, newlines and nulls safely', () => {
    expect(escapeCsvCell('Ana, "Lia"')).toBe('"Ana, ""Lia"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvCell(null)).toBe('""');
  });
});
