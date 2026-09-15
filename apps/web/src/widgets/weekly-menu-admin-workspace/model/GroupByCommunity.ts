type CommunityGroup<T> = {
  key: string;
  label: string;
  items: T[];
};

export function groupByCommunity<T>(
  items: T[],
  communityOf: (item: T) => string | null | undefined,
  communityNames: ReadonlyMap<string, string>
): CommunityGroup<T>[] {
  const groups = new Map<string, CommunityGroup<T>>();

  for (const item of items) {
    const code = communityOf(item);
    const key = code ?? (code === null ? '__none__' : '__unknown__');
    const label = code
      ? (communityNames.get(code) ?? code)
      : code === null
        ? 'Без громади'
        : 'Громаду не знайдено';
    const group = groups.get(key);

    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, { key, label, items: [item] });
    }
  }

  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label, 'uk'));
}
