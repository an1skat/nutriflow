export function parseLocalDate(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toLocalIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToLocalIsoDate(value: string, days: number): string {
  const parsed = parseLocalDate(value);
  if (!parsed) {
    return value;
  }
  parsed.setDate(parsed.getDate() + days);
  return toLocalIsoDate(parsed);
}
