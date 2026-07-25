import { beforeEach, describe, expect, it } from 'vitest';

import type { SchoolGroup } from '@/entities/school-group/model/SchoolGroup';
import type { DailyMenu, DailyMenuItem } from '@/entities/weekly-menu/model/WeeklyMenu';

import {
  loadDailyMenuDraft,
  prepareDailyMenuDays,
  replaceDailyMenuDish,
  saveDailyMenuDraft,
  updateDailyMenuGroupChildrenCount,
} from './DailyMenuDraftStorage';

const groups: SchoolGroup[] = [
  {
    id: 'group-younger',
    school_id: 'school-1',
    name: '1-А',
    age_group: '6-11',
    is_active: true,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
  },
  {
    id: 'group-older',
    school_id: 'school-1',
    name: '8-Б',
    age_group: '11-14',
    is_active: true,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
  },
  {
    id: 'group-inactive',
    school_id: 'school-1',
    name: 'Архівна',
    age_group: '14-18',
    is_active: false,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
  },
];

const originalItem = createItem({
  id: 'slot-1',
  name: 'Каша',
  cardNumber: '1.1',
  servings: [
    {
      school_group_id: 'group-younger',
      age_group: '6-11',
      children_count: 12,
    },
  ],
});

const days: DailyMenu[] = [
  {
    weekday: 'monday',
    date: '2026-07-06',
    notes: null,
    closed_at: null,
    closed_by: null,
    close_reason: null,
    items: [originalItem],
  },
];

describe('daily menu local draft', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('adds every active group and defaults missing counts to zero', () => {
    const prepared = prepareDailyMenuDays(days, groups);

    expect(prepared[0].items[0].servings).toEqual([
      {
        school_group_id: 'group-younger',
        age_group: '6-11',
        children_count: 12,
      },
      {
        school_group_id: 'group-older',
        age_group: '11-14',
        children_count: 0,
      },
    ]);
  });

  it('keeps the daily slot but resets group counts after replacing a dish', () => {
    const replacement = createItem({
      id: 'catalog-item',
      name: 'Суп',
      cardNumber: '2.4',
    });

    const result = replaceDailyMenuDish(originalItem, replacement, groups);

    expect(result.id).toBe('slot-1');
    expect(result.position).toBe(originalItem.position);
    expect(result.name).toBe('Суп');
    expect(result.recipe_card_number).toBe('2.4');
    expect(result.servings.map((serving) => serving.children_count)).toEqual([0, 0]);
  });

  it('applies a group count to every dish in the selected day', () => {
    const secondItem = createItem({
      id: 'slot-2',
      name: 'Суп',
      cardNumber: '2.4',
      servings: [
        {
          school_group_id: 'group-younger',
          age_group: '6-11',
          children_count: 7,
        },
      ],
    });

    const result = updateDailyMenuGroupChildrenCount(
      prepareDailyMenuDays([{ ...days[0], items: [originalItem, secondItem] }], groups),
      'monday',
      'group-younger',
      15
    );

    expect(result[0].items.map((item) => item.servings[0].children_count)).toEqual([15, 15]);
  });

  it('loads a saved draft only while its weekly menu version is current', () => {
    const savedAt = saveDailyMenuDraft('menu-1', 'version-1', days);

    expect(savedAt).not.toBeNull();
    expect(loadDailyMenuDraft('menu-1', 'version-1')?.days).toEqual(days);
    expect(loadDailyMenuDraft('menu-1', 'version-2')).toBeNull();
  });
});

function createItem({
  id,
  name,
  cardNumber,
  servings = [],
}: {
  id: string;
  name: string;
  cardNumber: string;
  servings?: DailyMenuItem['servings'];
}): DailyMenuItem {
  return {
    id,
    position: 1,
    kind: 'dish_card',
    source_text: `ТК ${cardNumber}`,
    recipe_card_number: cardNumber,
    dish_card_id: `card-${id}`,
    dish_card_version_id: `version-${id}`,
    product_ingredient_id: null,
    product_name_snapshot: null,
    name,
    allergen_codes: [],
    portions: [
      {
        age_group: '6-11',
        yield_amount: '100',
        dish_card_portion_variant_id: `portion-${id}`,
        calculated_from: null,
        nutrition: {
          kcal: '120',
          proteins: '4',
          fats: '3',
          carbs: '20',
        },
      },
    ],
    servings,
    notes: null,
  };
}
