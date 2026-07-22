import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';

import { SchoolMenuPreviewDialog } from './SchoolMenuPreviewDialog';

const menu: WeeklyMenu = {
  id: 'menu-1',
  title: 'Меню школи №1',
  school_id: 'school-1',
  source_menu_id: 'template-1',
  meal_type: 'lunch',
  cycle_week: 2,
  starts_on: '2026-09-07',
  ends_on: '2026-09-11',
  status: 'published',
  days: [
    {
      weekday: 'monday',
      date: '2026-09-07',
      closed_at: null,
      closed_by: null,
      close_reason: null,
      items: [
        {
          id: 'item-1',
          position: 1,
          kind: 'dish_card',
          source_text: 'ТК-12',
          recipe_card_number: '12',
          dish_card_id: 'dish-1',
          dish_card_version_id: 'version-1',
          product_ingredient_id: null,
          product_name_snapshot: null,
          name: 'Суп овочевий',
          allergen_codes: ['9'],
          portions: [
            {
              age_group: '6-11',
              yield_amount: '200',
              dish_card_portion_variant_id: null,
              calculated_from: null,
              nutrition: {
                kcal: '120',
                proteins: '4',
                fats: '3',
                carbs: '19',
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
  notes: 'Меню погоджено.',
  source_file_name: null,
  source_sheet_name: null,
  published_at: '2026-09-01T10:00:00Z',
  revoked_at: null,
  revoked_by: null,
  revoke_reason: null,
  created_by: 'owner-1',
  updated_by: 'owner-1',
  created_at: '2026-09-01T09:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
};

describe('SchoolMenuPreviewDialog', () => {
  it('shows the saved menu in the shared preview table', () => {
    render(<SchoolMenuPreviewDialog menu={menu} onClose={() => {}} />);

    const dialog = screen.getByRole('dialog', { name: 'Меню школи №1' });

    expect(within(dialog).getByText('Суп овочевий')).toBeInTheDocument();
    expect(within(dialog).getByText('Меню погоджено.')).toBeInTheDocument();
    expect(within(dialog).getByText('6-11 років')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();

    render(<SchoolMenuPreviewDialog menu={menu} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
