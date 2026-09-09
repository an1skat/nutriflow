import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MenuChangeRequest } from '@/entities/menu-change-request/model/MenuChangeRequest';

import { MenuChangeRequestDialog } from './MenuChangeRequestDialog';

const request: MenuChangeRequest = {
  id: 'request-1',
  menu_id: 'menu-1',
  source_menu_id: 'source-1',
  school_id: 'school-1',
  school_name: 'Школа Трата',
  submitted_by: 'user-1',
  menu_title: 'Меню на тиждень',
  meal_type: 'lunch',
  cycle_week: 1,
  starts_on: '2026-07-13',
  ends_on: '2026-07-17',
  days_snapshot: [
    {
      weekday: 'monday',
      date: '2026-07-13',
      items: [
        {
          id: 'item-1',
          position: 1,
          kind: 'dish_card',
          source_text: null,
          recipe_card_number: '1.01',
          dish_card_id: null,
          dish_card_version_id: null,
          product_ingredient_id: null,
          product_name_snapshot: null,
          name: 'Каша гречана',
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
          is_school_added: false,
          is_school_customized: false,
        },
      ],
      notes: null,
      closed_at: null,
      closed_by: null,
      close_reason: null,
    },
  ],
  changes: [
    {
      weekday: 'monday',
      item_id: 'item-1',
      position: 1,
      field: 'name',
      before_value: 'Каша',
      after_value: 'Каша гречана',
    },
  ],
  status: 'pending',
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2026-07-13T10:30:00Z',
  updated_at: '2026-07-13T10:30:00Z',
};

describe('MenuChangeRequestDialog', () => {
  it('shows the full comparison and closes from its close button', async () => {
    const onClose = vi.fn();

    render(
      <MenuChangeRequestDialog
        open
        request={request}
        loading={false}
        error={null}
        onRetry={() => undefined}
        onClose={onClose}
      />
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Школа Трата')).toBeInTheDocument();
    expect(within(dialog).getByText('Було')).toBeInTheDocument();
    expect(within(dialog).getByText('Стало')).toBeInTheDocument();
    expect(within(dialog).getByText('Каша')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Каша гречана')).toHaveLength(2);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Закрити' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('describes a newly added school item in plain language', async () => {
    render(
      <MenuChangeRequestDialog
        open
        request={{
          ...request,
          changes: [
            {
              weekday: 'monday',
              item_id: 'item-2',
              position: 2,
              field: 'item_added',
              before_value: null,
              after_value: 'Хліб пшеничний',
            },
          ],
        }}
        loading={false}
        error={null}
        onRetry={() => undefined}
        onClose={() => undefined}
      />
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Понеділок — додано: Хліб пшеничний/)).toBeInTheDocument();
    expect(within(dialog).getAllByText('Додано позицію')).toHaveLength(2);
  });

  it('describes a removed school item in plain language', async () => {
    render(
      <MenuChangeRequestDialog
        open
        request={{
          ...request,
          changes: [
            {
              weekday: 'wednesday',
              item_id: 'item-2',
              position: 2,
              field: 'item_removed',
              before_value: 'Хліб пшеничний',
              after_value: null,
            },
          ],
        }}
        loading={false}
        error={null}
        onRetry={() => undefined}
        onClose={() => undefined}
      />
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Середа — видалено: Хліб пшеничний/)).toBeInTheDocument();
    expect(within(dialog).getAllByText('Видалено позицію')).toHaveLength(2);
  });
});
