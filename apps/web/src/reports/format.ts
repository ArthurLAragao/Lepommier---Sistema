import {
  formatOrderMoney,
  formatBusinessDate,
  formatDateTime,
  type ReportKind,
  type ReportColumn,
} from '@pommier/shared';
export function reportHref(kind: ReportKind, filters: Record<string, string> = {}) {
  return '#reports?' + new URLSearchParams({ kind, ...filters });
}
export function reportValue(
  value: string | null | undefined,
  format: ReportColumn['format'],
  empty = 'Não informado',
) {
  if (value === null || value === undefined) return empty;
  if (format === 'money') return formatOrderMoney(value);
  if (format === 'integer') return BigInt(value).toLocaleString('pt-BR');
  if (format === 'date') return formatBusinessDate(value);
  if (format === 'datetime') return formatDateTime(value);
  return value;
}
