import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';

import { WeeklyMenuPicker } from './WeeklyMenuPicker';

function createMenu(
  id: string,
  title: string,
  mealType: WeeklyMenu['meal_type'],
  cycleWeek: number
): WeeklyMenu {
  return {
    id,
    title,
    school_id: null,
    source_menu_id: null,
    meal_type: mealType,
    cycle_week: cycleWeek,
    starts_on: null,
    ends_on: null,
    status: 'draft',
    days: [
      {
        weekday: 'monday',
        date: null,
        closed_at: null,
        closed_by: null,
        close_reason: null,
        items: [
          {
            id: `${id}-item`,
            position: 1,
            kind: 'product',
            source_text: null,
            recipe_card_number: null,
            dish_card_id: null,
            dish_card_version_id: null,
            product_ingredient_id: null,
            product_name_snapshot: 'Чай',
            name: 'Чай',
            allergen_codes: [],
            portions: [
              {
                age_group: '6-11',
                yield_amount: '200',
                dish_card_portion_variant_id: null,
                calculated_from: null,
                nutrition: {
                  kcal: null,
                  proteins: null,
                  fats: null,
                  carbs: null,
                },
              },
            ],
            servings: [],
            notes: null,
          },
        ],
        notes: null,
      },
    ],
    notes: null,
    source_file_name: null,
    source_sheet_name: null,
    published_at: null,
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    created_by: null,
    updated_by: null,
    revision: 1,
    created_at: '2026-07-07T10:00:00Z',
    updated_at: '2026-07-07T10:00:00Z',
  };
}

const breakfastMenu = createMenu('breakfast', 'Весняні сніданки', 'breakfast', 1);
const lunchMenu = createMenu('lunch', 'Літні обіди', 'lunch', 2);

describe('WeeklyMenuPicker', () => {
  it('opens the menu list, filters it and selects a menu', () => {
    const onSelect = vi.fn();

    render(
      <WeeklyMenuPicker
        menus={[breakfastMenu, lunchMenu]}
        selectedMenu={breakfastMenu}
        isCreatingNewMenu={false}
        loading={false}
        error={null}
        archiving={false}
        onRetry={() => {}}
        onSelect={onSelect}
        onCreateNew={() => {}}
        onArchiveSelected={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Весняні сніданки/i }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Пошук меню' }), {
      target: { value: 'обід' },
    });

    const dialog = screen.getByRole('dialog', { name: 'Вибір тижневого меню' });
    expect(within(dialog).queryByText('Весняні сніданки')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Літні обіди/i }));

    expect(onSelect).toHaveBeenCalledWith('lunch');
    expect(screen.queryByRole('searchbox', { name: 'Пошук меню' })).not.toBeInTheDocument();
  });

  it('starts creation through the separate new menu action', () => {
    const onCreateNew = vi.fn();

    render(
      <WeeklyMenuPicker
        menus={[breakfastMenu]}
        selectedMenu={breakfastMenu}
        isCreatingNewMenu={false}
        loading={false}
        error={null}
        archiving={false}
        onRetry={() => {}}
        onSelect={() => {}}
        onCreateNew={onCreateNew}
        onArchiveSelected={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Нове меню' }));

    expect(onCreateNew).toHaveBeenCalledOnce();
  });

  it('archives the selected menu through the separate archive action', () => {
    const onArchiveSelected = vi.fn();

    render(
      <WeeklyMenuPicker
        menus={[breakfastMenu]}
        selectedMenu={breakfastMenu}
        isCreatingNewMenu={false}
        loading={false}
        error={null}
        archiving={false}
        onRetry={() => {}}
        onSelect={() => {}}
        onCreateNew={() => {}}
        onArchiveSelected={onArchiveSelected}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Архівувати' }));

    expect(onArchiveSelected).toHaveBeenCalledOnce();
  });
});
