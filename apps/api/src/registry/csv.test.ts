import { describe, it, expect } from 'vitest';
import { parseCustomerCsv, mapCsvRows, fileDuplicates } from './csv.js';
import { customerSelect, productSelect } from './service.js';

describe('bounded CSV review and privacy selections', () => {
  it.each([',', ';'] as const)(
    'parses %s delimiters, BOM, quotes, escaped quotes and embedded newlines',
    (delimiter) => {
      const parsed = parseCustomerCsv(
        `\ufeffnome${delimiter}notas\r\n"Ana, Teste"${delimiter}"Linha 1\nEla disse ""olá"""\r\n`,
        delimiter,
      );
      expect(parsed.records).toEqual([['Ana, Teste', 'Linha 1\nEla disse "olá"']]);
    },
  );
  it.each([
    'nome;nome\nA;B',
    'nome; NÓME \nA;B',
    ';telefone\nA;B',
    '=fórmula;telefone\nA;B',
    'nome;telefone\n"sem fechamento',
    'nome;telefone\nA;B;C',
    'nome\n\ufffd',
    'nome\n\u0000',
  ])('rejects unsafe/malformed CSV without echoing row data', (csv) => {
    expect(() => parseCustomerCsv(csv, ';')).toThrow();
  });
  it('bounds file, record count, columns, record and field sizes', () => {
    for (const csv of [
      'x'.repeat(262145),
      'nome\n' + 'Pessoa\n'.repeat(101),
      Array.from({ length: 21 }, (_, i) => `col${i}`).join(';'),
      'nome\n' + 'x'.repeat(9000),
      'nome\n' + 'x'.repeat(2001),
    ])
      expect(() => parseCustomerCsv(csv, ';')).toThrow();
  });
  it('maps explicitly and reports row errors, preserving complete dates and unknown marketing', () => {
    const parsed = parseCustomerCsv(
      'Nome;Contato;Nascimento;Permissão\nÁna;85999990001;29/02/1980;SIM\nSem data;;29/02;SIM\nFuturo;;18/10/2026;SIM',
      ';',
    );
    const rows = mapCsvRows(
      parsed,
      { name: 'Nome', phone: 'Contato', birthday: 'Nascimento' },
      '2026-10-17',
    );
    expect(rows[0]?.customer).toMatchObject({
      name: 'Ána',
      phone: '+5585999990001',
      birthday: '1980-02-29',
    });
    expect(rows[0]?.customer).not.toHaveProperty('marketingState');
    expect(rows[1]?.errors.length).toBeGreaterThan(0);
    expect(rows[2]?.errors).toContain('birthday: nascimento não pode estar no futuro.');
    expect(() => mapCsvRows(parsed, { name: 'Ausente' }, '2026-10-17')).toThrow();
    expect(() => mapCsvRows(parsed, { name: 'Nome', phone: 'Nome' }, '2026-10-17')).toThrow();
  });
  it('classifies duplicate contacts and advisory names without merging households', () => {
    const rows = mapCsvRows(
      parseCustomerCsv(
        'nome;telefone;cpf;email\nÁna;85999990001;52998224725;SAME@example.test\nAna;85999990001;52998224725;same@EXAMPLE.test',
        ';',
      ),
      { name: 'nome', phone: 'telefone', cpf: 'cpf', email: 'email' },
      '2026-10-17',
    );
    fileDuplicates(rows);
    expect(rows[1]?.duplicates.map((d) => d.type).sort()).toEqual([
      'CPF',
      'EMAIL',
      'NAME',
      'PHONE',
    ]);
    expect(rows).toHaveLength(2);
  });
  it('constructs database privacy selections before querying', () => {
    const cashier = customerSelect('CASHIER');
    for (const key of ['cpf', 'email', 'birthday', 'address', 'notes', 'marketingState'])
      expect(cashier).not.toHaveProperty(key);
    expect(customerSelect('MANAGER')).toHaveProperty('email');
    expect(customerSelect('MANAGER')).not.toHaveProperty('cpf');
    expect(customerSelect('OWNER')).toHaveProperty('cpf');
    for (const role of ['CASHIER', 'PRODUCTION'] as const)
      expect(productSelect(role)).not.toHaveProperty('estimatedCostCents');
  });
});
