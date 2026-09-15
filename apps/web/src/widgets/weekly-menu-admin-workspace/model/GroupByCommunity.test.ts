import { expect, test } from 'vitest';

import { groupByCommunity } from './GroupByCommunity';

test('groups schools by community and keeps unassigned or unknown schools separate', () => {
  const schools = [
    { id: '1', community: 'south' },
    { id: '2', community: 'north' },
    { id: '3', community: 'south' },
    { id: '4', community: null },
    { id: '5', community: undefined },
  ];
  const names = new Map([
    ['south', 'Південна громада'],
    ['north', 'Північна громада'],
  ]);

  const groups = groupByCommunity(schools, (school) => school.community, names);

  expect(groups.map((group) => [group.label, group.items.map((school) => school.id)])).toEqual([
    ['Без громади', ['4']],
    ['Громаду не знайдено', ['5']],
    ['Південна громада', ['1', '3']],
    ['Північна громада', ['2']],
  ]);
});
