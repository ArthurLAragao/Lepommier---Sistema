import { parse } from 'csv-parse/sync';
import {
  customerCreateSchema,
  importFields,
  birthdayAllowed,
  nameKey,
  type ImportMapping,
  type ImportRow,
  type CustomerInput,
} from '@pommier/shared';
import { AppError } from '../errors.js';

export function parseCustomerCsv(
  csv: string,
  delimiter: ',' | ';',
): { headers: string[]; records: string[][] } {
  if (Buffer.byteLength(csv, 'utf8') > 262144)
    throw new AppError(413, 'CSV_TOO_LARGE', 'Use CSV de até 256 KiB e 100 linhas de dados.');
  if (csv.includes('\u0000') || csv.includes('\ufffd'))
    throw new AppError(
      400,
      'CSV_ENCODING',
      'Use UTF-8 válido, com ou sem BOM. Não há conversão automática de codificação.',
    );
  let rows: string[][];
  try {
    rows = parse(csv, {
      delimiter,
      bom: true,
      skip_empty_lines: true,
      max_record_size: 8192,
      relax_column_count: false,
      relax_quotes: false,
    }) as string[][];
  } catch {
    throw new AppError(
      400,
      'CSV_MALFORMED',
      'CSV malformado: confira delimitador, aspas e quantidade de colunas. Nenhuma linha foi importada.',
    );
  }
  const [originalHeaders, ...records] = rows;
  if (!originalHeaders?.length || originalHeaders.length > 20 || records.length > 100)
    throw new AppError(
      400,
      'CSV_BOUNDS',
      'Use cabeçalho, até 20 colunas e até 100 linhas de dados por arquivo.',
    );
  const headers = originalHeaders.map((v) => v.trim());
  if (
    headers.some(
      (v) =>
        !v ||
        v.length > 80 ||
        Array.from(v).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
        /^[=+@-]/.test(v),
    ) ||
    new Set(headers.map(nameKey)).size !== headers.length
  )
    throw new AppError(
      400,
      'CSV_HEADERS',
      'Cabeçalhos devem ser únicos, preenchidos e ter até 80 caracteres, sem fórmulas.',
    );
  if (records.some((row) => row.some((cell) => cell.length > 2000)))
    throw new AppError(
      400,
      'CSV_FIELD_TOO_LARGE',
      'Uma célula ultrapassa 2.000 caracteres. Reduza o conteúdo e selecione o arquivo novamente.',
    );
  return { headers, records };
}
export function mapCsvRows(
  parsed: ReturnType<typeof parseCustomerCsv>,
  mapping: ImportMapping,
  today: string,
): ImportRow[] {
  const columns = Object.values(mapping).filter((v): v is string => v !== undefined);
  if (columns.some((v) => !parsed.headers.includes(v)) || new Set(columns).size !== columns.length)
    throw new AppError(
      400,
      'CSV_MAPPING',
      'Mapeie cada coluna uma única vez e escolha uma coluna existente para o nome.',
    );
  return parsed.records.map((record, index) => {
    const original: Record<string, string> = {};
    const values: Record<string, string> = {};
    for (const field of importFields) {
      const column = mapping[field];
      if (column === undefined) continue;
      const value = record[parsed.headers.indexOf(column)] ?? '';
      original[field] = value;
      values[field] = value;
    }
    if (values.birthday && /^\d{2}\/\d{2}\/\d{4}$/.test(values.birthday.trim())) {
      const [day, month, year] = values.birthday.trim().split('/');
      values.birthday = `${year}-${month}-${day}`;
    }
    const result = customerCreateSchema.safeParse(values);
    const errors = result.success
      ? []
      : result.error.issues.map(
          (issue) => `${String(issue.path[0] ?? 'cadastro')}: ${issue.message}`,
        );
    if (result.success && !birthdayAllowed(result.data.birthday, today))
      errors.push('birthday: nascimento não pode estar no futuro.');
    return {
      row: index + 1,
      original,
      customer: result.success && !errors.length ? result.data : null,
      errors,
      duplicates: [],
    };
  });
}
export function fileDuplicates(rows: ImportRow[]): void {
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (!row.customer) continue;
    for (const [field, type] of [
      ['cpf', 'CPF'],
      ['phone', 'PHONE'],
      ['email', 'EMAIL'],
      ['name', 'NAME'],
    ] as const) {
      const value = field === 'name' ? nameKey(row.customer.name) : row.customer[field];
      if (!value) continue;
      const key = `${field}:${value}`;
      const previous = seen.get(key);
      if (previous) row.duplicates.push({ type, row: previous });
      else seen.set(key, row.row);
    }
  }
}
export function sameIdentity(a: CustomerInput, b: CustomerInput): boolean {
  return Boolean(
    (a.cpf && a.cpf === b.cpf) ||
    (a.phone && a.phone === b.phone) ||
    (a.email && a.email === b.email) ||
    nameKey(a.name) === nameKey(b.name),
  );
}
