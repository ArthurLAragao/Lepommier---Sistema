import { describe, expect, it } from 'vitest';
import {
  normalizePhone,
  formatPhone,
  validCpf,
  customerCreateSchema,
  birthdaySchema,
  birthdayAllowed,
  productCreateSchema,
  hasPermission,
  nameKey,
  registrationLabel,
  marketingSchema,
} from './index.js';

describe('customer/catalog contracts', () => {
  it('requires an explicit basis for opt-in and a reference for record review', () => {
    const preference = {
      version: 1,
      state: 'OPTED_IN',
      source: 'IN_PERSON',
      reason: 'CUSTOMER_REQUEST',
    };
    expect(marketingSchema.safeParse(preference).success).toBe(true);
    expect(marketingSchema.safeParse({ ...preference, reason: 'NO_EVIDENCE' }).success).toBe(false);
    expect(marketingSchema.safeParse({ ...preference, source: 'RECORD_REVIEW' }).success).toBe(
      false,
    );
    expect(
      marketingSchema.safeParse({
        ...preference,
        source: 'RECORD_REVIEW',
        evidence: 'Referência sintética',
      }).success,
    ).toBe(true);
    expect(
      marketingSchema.safeParse({ ...preference, state: 'UNKNOWN', reason: 'NO_EVIDENCE' }).success,
    ).toBe(true);
  });
  it('requires a real name while keeping other fields optional and preserving punctuation/accents', () => {
    expect(customerCreateSchema.parse({ name: '  Ana d’Ávila-Teste  ' }).name).toBe(
      'Ana d’Ávila-Teste',
    );
    expect(customerCreateSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(customerCreateSchema.safeParse({ name: '🍎' }).success).toBe(false);
    expect(
      customerCreateSchema.safeParse({ name: 'Exemplo', marketingState: 'OPTED_IN' }).success,
    ).toBe(false);
    expect(
      customerCreateSchema.parse({ name: 'Exemplo', phone: '', email: '', cpf: '', birthday: '' }),
    ).toMatchObject({ phone: null, email: null, cpf: null, birthday: null });
  });
  it.each(['(85) 99999-0001', '+55 (85) 99999-0001', '5585999990001', '85999990001'])(
    'normalizes Brazilian phone %s without guessing missing digits',
    (value) => {
      expect(normalizePhone(value)).toBe('+5585999990001');
      expect(formatPhone(normalizePhone(value))).toBe('+55 (85) 99999-0001');
    },
  );
  it.each([
    '99999-0001',
    '085999990001',
    '+1 212 555 0100',
    '(00) 99999-0001',
    '(85) 89999-0001',
    'telefone',
  ])('rejects ambiguous/inapplicable phone %s', (value) => {
    expect(() => normalizePhone(value)).toThrow();
  });
  it('supports optional landline, normalized email and repeated non-unique contacts', () => {
    expect(normalizePhone('(85) 3333-0001')).toBe('+558533330001');
    expect(normalizePhone('')).toBeNull();
    expect(
      customerCreateSchema.parse({ name: 'Teste', email: '  EXAMPLE@EXAMPLE.TEST ' }).email,
    ).toBe('example@example.test');
    expect(customerCreateSchema.safeParse({ name: 'Teste', email: 'broken' }).success).toBe(false);
  });
  it('checks CPF format, repeated digits and both verification digits, without identity claims', () => {
    expect(validCpf('52998224725')).toBe(true);
    expect(validCpf('11144477735')).toBe(true);
    for (const value of ['11111111111', '00000000000', '52998224724', '529982247', 'abcdef12345'])
      expect(validCpf(value)).toBe(false);
    expect(customerCreateSchema.parse({ name: 'CPF sintético', cpf: '529.982.247-25' }).cpf).toBe(
      '52998224725',
    );
  });
  it('preserves date-only birthdays including pre-2000 dates and refuses incomplete/impossible/future dates', () => {
    expect(birthdaySchema.parse('1980-02-29')).toBe('1980-02-29');
    for (const value of ['29/02', '1981-02-29', '2025-02-30', '1899-12-31', '2000-01-01T00:00:00Z'])
      expect(birthdaySchema.safeParse(value).success).toBe(false);
    expect(birthdayAllowed('2026-10-18', '2026-10-17')).toBe(false);
    expect(birthdayAllowed(null, '2026-10-17')).toBe(true);
  });
  it('normalizes advisory names separately from display text and does not promise gapless registrations', () => {
    expect(nameKey('  Ána   D’Ávila ')).toBe('ana d’avila');
    expect(registrationLabel(123)).toBe('CLI-000123');
  });
  const product = {
    code: ' test-01 ',
    name: 'Produto de teste',
    categoryId: 'c675fe32-0c71-418f-b2f3-8e2bcc5d1234',
    origin: 'PRODUCED',
    sellingPriceCents: 1250,
  };
  it('keeps whole-unit integer centavos, optional estimated cost and explicit zero-price confirmation', () => {
    expect(productCreateSchema.parse(product).code).toBe('TEST-01');
    for (const sellingPriceCents of [-1, 1.5, 100000000])
      expect(productCreateSchema.safeParse({ ...product, sellingPriceCents }).success).toBe(false);
    expect(productCreateSchema.safeParse({ ...product, estimatedCostCents: -1 }).success).toBe(
      false,
    );
    expect(productCreateSchema.safeParse({ ...product, sellingPriceCents: 0 }).success).toBe(false);
    expect(
      productCreateSchema.parse({ ...product, sellingPriceCents: 0, allowZeroPrice: true })
        .sellingPriceCents,
    ).toBe(0);
    expect(productCreateSchema.safeParse({ ...product, stockQuantity: 10 }).success).toBe(false);
  });
  it('grants precise customer, cost and bulk-data permissions', () => {
    expect(hasPermission('OWNER', 'customers.anonymize')).toBe(true);
    expect(hasPermission('MANAGER', 'customers.write')).toBe(true);
    expect(hasPermission('MANAGER', 'customers.private')).toBe(false);
    expect(hasPermission('CASHIER', 'customers.write')).toBe(true);
    expect(hasPermission('CASHIER', 'customers.operational')).toBe(false);
    for (const role of ['MANAGER', 'CASHIER', 'PRODUCTION'] as const)
      for (const permission of [
        'customers.import',
        'customers.export',
        'customers.anonymize',
        'customers.marketing',
      ] as const)
        expect(hasPermission(role, permission)).toBe(false);
    expect(hasPermission('PRODUCTION', 'customers.read')).toBe(false);
    for (const role of ['CASHIER', 'PRODUCTION'] as const) {
      expect(hasPermission(role, 'catalog.read')).toBe(true);
      expect(hasPermission(role, 'catalog.cost')).toBe(false);
    }
  });
});
