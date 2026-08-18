export function normalizeGramAmount(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s*(?:г|гр|g)\s*$/u, '')
    .replace(',', '.');

  const parts = normalized.split('/').map((part) => part.trim());
  if (parts.some((part) => !/^\d+(?:\.\d+)?$/.test(part))) {
    return null;
  }

  return parts.reduce((total, part) => total + Number(part), 0);
}
