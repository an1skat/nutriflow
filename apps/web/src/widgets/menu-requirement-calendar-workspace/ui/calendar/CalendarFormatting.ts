import { parseLocalDate } from '@/shared/lib/LocalDate';

export function monthName(year: number, month: number): string {
  return new Intl.DateTimeFormat('uk-UA', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

export function monthNameFromDate(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat('uk-UA', {
    month: 'long',
  }).format(parsed);
}

export function formatDay(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

export function formatDayWithoutYear(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'long',
  }).format(parsed);
}

export function formatFullDay(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

export function weekdayName(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat('uk-UA', { weekday: 'long' }).format(parsed);
}

export function formatShortRange(dateFrom: string, dateTo: string): string {
  return `${formatDayWithoutYear(dateFrom)} – ${formatDayWithoutYear(dateTo)}`;
}

export function formatGrams(value: string): string {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: 6,
  }).format(parsed);
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: 0,
  }).format(value);
}
