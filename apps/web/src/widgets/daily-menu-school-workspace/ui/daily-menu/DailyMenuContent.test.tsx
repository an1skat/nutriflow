import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DishCard, DishCardVersion, Ingredient } from '@/entities/recipe/model/Recipe';
import type { SchoolGroup } from '@/entities/school-group/model/SchoolGroup';
import type { DailyMenu, DailyMenuItem } from '@/entities/weekly-menu/model/WeeklyMenu';

import {
  DayMenuPanel,
  buildDailyMenuUpdatePayload,
  buildDishCardReplacement,
  buildProductMenuItem,
  createNewDailyMenuItem,
  isSchoolAddedDailyMenuItem,
  resequenceDayItemPositions,
} from './DailyMenuContent';

vi.mock('@/entities/recipe/api/RecipeQueries', () => ({
  useDishCards: () => ({
    data: {
      items: [
        {
          id: 'dish-2',
          card_number: '2.17',
          name: 'Рис з овочами',
          current_version_id: 'version-2',
        },
      ],
    },
    isPending: false,
    isError: false,
  }),
  useIngredients: () => ({
    data: { items: [{ id: 'bread', name: 'Хліб пшеничний', unit: 'g' }] },
    isPending: false,
    isError: false,
  }),
}));

const group: SchoolGroup = {
  id: 'group-1',
  school_id: 'school-1',
  name: '1-А',
  age_group: '6-11',
  is_active: true,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

const ingredient: Ingredient = {
  id: 'bread',
  name: 'Хліб пшеничний',
  normalized_name: 'хліб пшеничний',
  unit: 'g',
  normative_group_id: null,
  normative_contributions: [],
  aliases: [],
  is_active: true,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

const dishCard: DishCard = {
  id: 'dish-2',
  card_number: '2.17',
  name: 'Рис з овочами',
  category: null,
  source: null,
  is_active: true,
  current_version_id: 'version-2',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
};

const dishVersion: DishCardVersion = {
  id: 'version-2',
  dish_card_id: 'dish-2',
  version: 1,
  status: 'confirmed',
  source_import_id: null,
  source_file_name: null,
  source_page: null,
  recognized_warnings: [],
  recognition_errors: [],
  allergen_ids: [],
  technology_text: null,
  portion_variants: [
    {
      id: 'portion-2',
      age_group: '6-11',
      portion_grams: '150',
      output_grams: '150',
      nutrition: { kcal: '100', proteins: '5', fats: '3', carbs: '15' },
      normative_contributions: [],
    },
  ],
  ingredient_amounts: [],
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
  created_by: null,
};

function menuItem(id = 'item-1'): DailyMenuItem {
  return {
    id,
    position: id.startsWith('new:') ? 2 : 1,
    kind: 'dish_card',
    source_text: null,
    recipe_card_number: '1.01',
    dish_card_id: 'dish-1',
    dish_card_version_id: 'version-1',
    product_ingredient_id: null,
    product_name_snapshot: null,
    name: id.startsWith('new:') ? 'Хліб пшеничний' : 'Овочевий суп',
    allergen_codes: [],
    portions: [
      {
        age_group: '6-11',
        yield_amount: '200',
        dish_card_portion_variant_id: null,
        calculated_from: null,
        nutrition: { kcal: null, proteins: null, fats: null, carbs: null },
      },
    ],
    servings: [{ school_group_id: group.id, age_group: group.age_group, children_count: 12 }],
    notes: null,
    is_school_added: id.startsWith('new:'),
    is_school_customized: false,
  };
}

function day(items: DailyMenuItem[] = [menuItem()], closed = false): DailyMenu {
  return {
    weekday: 'monday',
    date: '2026-07-06',
    items,
    notes: null,
    closed_at: closed ? '2026-07-06T15:00:00Z' : null,
    closed_by: closed ? 'user-1' : null,
    close_reason: closed ? 'manual' : null,
  };
}

function renderPanel(overrides: Partial<Parameters<typeof DayMenuPanel>[0]> = {}) {
  const props = {
    day: day(),
    displayDate: '2026-07-06',
    groups: [group],
    readOnly: false,
    onDishChange: vi.fn(async () => undefined),
    onAddItem: vi.fn(async () => undefined),
    onRemoveItem: vi.fn(),
    onPortionYieldChange: vi.fn(),
    onChildrenCountChange: vi.fn(),
    ...overrides,
  };
  render(<DayMenuPanel {...props} />);
  return props;
}

describe('school daily menu item additions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers both catalog types from + Додати позицію', () => {
    const productProps = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '+ Додати позицію' }));
    fireEvent.click(screen.getByRole('button', { name: 'Оберіть техкарту або продукт' }));
    fireEvent.click(screen.getByRole('button', { name: 'Пром. вироб.' }));
    fireEvent.click(screen.getByRole('option', { name: /Хліб пшеничний/ }));
    expect(productProps.onAddItem).toHaveBeenCalledWith({
      kind: 'product',
      ingredient: expect.objectContaining({ id: 'bread', name: 'Хліб пшеничний' }),
    });

    const dishProps = renderPanel();
    fireEvent.click(screen.getAllByRole('button', { name: '+ Додати позицію' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Оберіть техкарту або продукт' }));
    fireEvent.click(screen.getByRole('option', { name: /Рис з овочами/ }));
    expect(dishProps.onAddItem).toHaveBeenCalledWith({
      kind: 'dish_card',
      dishCard: expect.objectContaining({ id: 'dish-2', name: 'Рис з овочами' }),
    });
  });

  it('allows removing only an unsaved item and editing its yield', () => {
    const unsavedItem = menuItem('new:test-item');
    const props = renderPanel({ day: day([menuItem(), unsavedItem]) });

    expect(screen.getAllByRole('button', { name: /Видалити нову позицію/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Видалити нову позицію Хліб пшеничний' }));
    expect(props.onRemoveItem).toHaveBeenCalledWith('new:test-item');

    fireEvent.change(screen.getByLabelText('Вихід для 6-11 років'), {
      target: { value: '30' },
    });
    expect(props.onPortionYieldChange).toHaveBeenCalledWith('new:test-item', 0, '30');
  });

  it('does not expose add or remove controls for a closed day', () => {
    renderPanel({ day: day([menuItem(), menuItem('new:test-item')], true), readOnly: true });

    expect(screen.queryByRole('button', { name: '+ Додати позицію' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Видалити нову позицію/ })).not.toBeInTheDocument();
  });

  it('keeps ordinary replacement working for an existing item', () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Овочевий суп' }));
    fireEvent.click(screen.getByRole('option', { name: /Рис з овочами/ }));

    expect(props.onDishChange).toHaveBeenCalledWith('item-1', {
      kind: 'dish_card',
      dishCard: expect.objectContaining({ id: 'dish-2', name: 'Рис з овочами' }),
    });
  });

  it('builds both item kinds and omits only the unsaved id from PATCH payloads', () => {
    const sourceDay = day();
    const blank = createNewDailyMenuItem(sourceDay, [group]);
    const product = buildProductMenuItem(blank, ingredient);
    const dish = buildDishCardReplacement(blank, dishCard, dishVersion);

    expect(product).toMatchObject({
      position: 2,
      kind: 'product',
      product_ingredient_id: 'bread',
      servings: [{ school_group_id: 'group-1', children_count: 12 }],
    });
    expect(dish).toMatchObject({
      position: 2,
      kind: 'dish_card',
      dish_card_id: 'dish-2',
      dish_card_version_id: 'version-2',
    });

    const unchangedPayload = buildDailyMenuUpdatePayload([sourceDay]);
    expect(unchangedPayload.days?.[0].items[0].id).toBe('item-1');

    const addedPayload = buildDailyMenuUpdatePayload([day([menuItem(), product])]);
    expect(addedPayload.days?.[0].items[1]).not.toHaveProperty('id');
    expect(addedPayload.days?.[0].items[1].is_school_added).toBe(true);
  });

  it('handles empty day without crashing and sets position to 1', () => {
    const emptyDay = day([]);
    const newItem = createNewDailyMenuItem(emptyDay, [group]);

    expect(newItem.position).toBe(1);
    expect(newItem.name).toBe('Нова позиція');
    expect(newItem.is_school_added).toBe(true);
    expect(newItem.portions.length).toBeGreaterThanOrEqual(1);
    expect(newItem.portions[0].yield_amount).toBe('');
  });

  it('initializes blank portions with empty yield rather than copying from existing soup item', () => {
    const soupItem = menuItem('soup-1');
    soupItem.portions = [
      {
        age_group: '6-11',
        yield_amount: '250',
        dish_card_portion_variant_id: null,
        calculated_from: null,
        nutrition: { kcal: '120', proteins: '4', fats: '3', carbs: '18' },
      },
      {
        age_group: '11-14',
        yield_amount: '300',
        dish_card_portion_variant_id: null,
        calculated_from: null,
        nutrition: { kcal: '150', proteins: '5', fats: '4', carbs: '22' },
      },
    ];
    const sourceDay = day([soupItem]);
    const newItem = createNewDailyMenuItem(sourceDay, [group]);

    for (const portion of newItem.portions) {
      expect(portion.yield_amount).toBe('');
      expect(portion.nutrition.kcal).toBeNull();
    }
  });

  it('resequences day items sequentially without gaps', () => {
    const item1 = { ...menuItem('i1'), position: 1 };
    const item2 = { ...menuItem('i2'), position: 2 };
    const item4 = { ...menuItem('i4'), position: 5 };
    const testDay = day([item1, item2, item4]);

    const resequenced = resequenceDayItemPositions(testDay);
    expect(resequenced.items.map((i) => i.position)).toEqual([1, 2, 3]);
  });

  it('allows yield editing and removal on already-saved school-added items', () => {
    const savedSchoolItem: DailyMenuItem = {
      ...menuItem('db-item-6'),
      is_school_added: true,
      name: 'Хліб пшеничний',
    };
    expect(isSchoolAddedDailyMenuItem(savedSchoolItem)).toBe(true);

    const props = renderPanel({ day: day([menuItem('db-item-1'), savedSchoolItem]) });
    expect(screen.getByRole('button', { name: 'Видалити нову позицію Хліб пшеничний' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Видалити нову позицію Хліб пшеничний' }));
    expect(props.onRemoveItem).toHaveBeenCalledWith('db-item-6');

    fireEvent.change(screen.getByLabelText('Вихід для 6-11 років'), {
      target: { value: '45' },
    });
    expect(props.onPortionYieldChange).toHaveBeenCalledWith('db-item-6', 0, '45');
  });
});
