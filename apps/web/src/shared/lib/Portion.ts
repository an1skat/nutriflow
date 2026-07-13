export function normalizeGramAmount(
  value: string | null | undefined,
): number | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s*(?:г|гр|g)\s*$/u, "")
    .replace(",", ".");

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  return Number(normalized);
}
