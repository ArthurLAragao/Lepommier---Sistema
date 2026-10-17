import { BUSINESS_TIMEZONE, businessDateSchema, moneyCentsSchema } from './contracts.js';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: BUSINESS_TIMEZONE });
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BUSINESS_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatMoney(cents: number): string {
  moneyCentsSchema.parse(cents);
  return currency.format(cents / 100);
}

/** Strict human input. Integer arithmetic; never parseFloat or decimal guessing. */
export function parseMoney(input: string): number {
  const value = input.trim();
  if (!/^(?:0|[1-9]\d{0,6}|[1-9]\d{0,2}(?:\.\d{3}){1,2})(?:,\d{1,2})?$/.test(value)) {
    throw new Error('Informe um valor como 25,90, sem sinal ou símbolo de moeda.');
  }
  const [whole = '0', fraction = ''] = value.split(',');
  const cents = Number(whole.replaceAll('.', '')) * 100 + Number(fraction.padEnd(2, '0'));
  if (!moneyCentsSchema.safeParse(cents).success) {
    throw new Error('O valor informado ultrapassa o limite permitido.');
  }
  return cents;
}

function validInstant(instant: string | Date): Date {
  // Reject timezone-less strings; they would inherit the browser/host timezone.
  if (typeof instant === 'string' && !/(?:Z|[+-]\d{2}:\d{2})$/.test(instant)) {
    throw new Error('A data e hora devem incluir o fuso horário.');
  }
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error('Data e hora inválidas.');
  return date;
}

export function businessDateOf(instant: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(validInstant(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return businessDateSchema.parse(`${get('year')}-${get('month')}-${get('day')}`);
}

export function formatBusinessDate(date: string): string {
  businessDateSchema.parse(date);
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function formatDateTime(instant: string | Date): string {
  const date = validInstant(instant);
  return `${dateFormatter.format(date)} às ${timeFormatter.format(date)}`;
}

export function formatBusinessTime(instant: string | Date): string {
  return timeFormatter.format(validInstant(instant));
}

const zonedCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function zonedMidnight(targetCalendarUtc: number): Date {
  let candidate = targetCalendarUtc;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = zonedCalendar.formatToParts(new Date(candidate));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((value) => value.type === type)?.value);
    const displayedCalendarUtc = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second'),
    );
    const correction = targetCalendarUtc - displayedCalendarUtc;
    if (correction === 0) return new Date(candidate);
    candidate += correction;
  }
  throw new Error('Não foi possível calcular o início do dia no fuso da loja.');
}

/** Resolve each midnight using IANA timezone data, never the browser's timezone. */
export function businessDayRange(date: string): { start: Date; end: Date } {
  businessDateSchema.parse(date);
  const calendarUtc = Date.parse(`${date}T00:00:00.000Z`);
  return { start: zonedMidnight(calendarUtc), end: zonedMidnight(calendarUtc + 86_400_000) };
}

/** Escape both CSV structure and spreadsheet formula prefixes. */
export function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  let first = 0;
  while (first < text.length && (text.charCodeAt(first) <= 32 || text[first]?.trim() === ''))
    first++;
  const safe =
    ['=', '+', '-', '@'].includes(text[first] ?? '') || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
