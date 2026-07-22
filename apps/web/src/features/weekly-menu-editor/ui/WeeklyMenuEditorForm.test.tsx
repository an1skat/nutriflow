import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  type WeeklyMenuFormValues,
  createBlankItem,
  createBlankWeeklyMenuFormValues,
} from '../model/WeeklyMenuFormSchema';
import { WeeklyMenuEditorForm } from './WeeklyMenuEditorForm';

vi.mock('@/entities/recipe/api/RecipeQueries', () => ({
  allergensQueryOptions: () =>
    queryOptions({
      queryKey: ['test', 'allergens'],
      queryFn: async () => ({
        items: [
          {
            id: 'allergen-1',
            code: 'ГЦ',
            name: 'Глютен',
            description: null,
            created_at: '2026-07-07T10:00:00Z',
            updated_at: '2026-07-07T10:00:00Z',
          },
        ],
        total: 1,
        offset: 0,
        limit: 50,
      }),
    }),
  dishCardQueryOptions: () =>
    queryOptions({
      queryKey: ['test', 'dish-card'],
      queryFn: async () => ({
        id: 'dish-card-1',
        card_number: '1.54',
        name: 'Салат',
        category: null,
        source: null,
        is_active: true,
        current_version_id: 'version-1',
        created_at: '2026-07-07T10:00:00Z',
        updated_at: '2026-07-07T10:00:00Z',
      }),
    }),
  dishCardVersionQueryOptions: () =>
    queryOptions({
      queryKey: ['test', 'dish-card-version'],
      queryFn: async () => ({
        id: 'version-1',
        dish_card_id: 'dish-card-1',
        version: 1,
        status: 'confirmed' as const,
        source_import_id: null,
        source_file_name: null,
        source_page: null,
        recognized_warnings: [],
        recognition_errors: [],
        allergen_ids: ['allergen-1'],
        technology_text: null,
        portion_variants: [],
        ingredient_amounts: [],
        created_at: '2026-07-07T10:00:00Z',
        updated_at: '2026-07-07T10:00:00Z',
        created_by: null,
      }),
    }),
  dishCardsQueryOptions: () =>
    queryOptions({
      queryKey: ['test', 'dish-cards'],
      queryFn: async () => ({
        items: [
          {
            id: 'dish-card-1',
            card_number: '1.54',
            name: 'Салат',
            category: null,
            source: null,
            is_active: true,
            current_version_id: 'version-1',
            created_at: '2026-07-07T10:00:00Z',
            updated_at: '2026-07-07T10:00:00Z',
          },
        ],
        total: 1,
        offset: 0,
        limit: 50,
      }),
    }),
  ingredientsQueryOptions: () =>
    queryOptions({
      queryKey: ['test', 'ingredients'],
      queryFn: async () => ({
        items: [],
        total: 0,
        offset: 0,
        limit: 50,
      }),
    }),
}));

describe('WeeklyMenuEditorForm', () => {
  it('renders school readonly mode as text and shows allergens from linked dish card', async () => {
    const initialValues = createBlankWeeklyMenuFormValues();
    initialValues.title = 'Меню школи';
    initialValues.days = initialValues.days.slice(0, 1);
    initialValues.days[0].items[0].name = 'Салат';
    initialValues.days[0].items[0].recipe_card_number = '1.54';
    initialValues.days[0].items[0].dish_card_id = 'dish-card-1';
    initialValues.days[0].items[0].dish_card_version_id = 'version-1';
    initialValues.days[0].items[0].source_text = 'ТК № 1.54';
    initialValues.days[0].items[0].portions.forEach((portion) => {
      portion.yield_amount = '100';
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WeeklyMenuEditorForm
          initialValues={initialValues}
          mode="school-readonly"
          submitLabel=""
          saving={false}
          onSubmit={async () => {}}
          recipeCatalogEnabled={false}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('Меню школи')).toBeInTheDocument();
    expect(screen.queryByLabelText('Назва меню')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Назва позиції')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Позиція 1/i }));

    await waitFor(() => {
      expect(screen.getByText(/ГЦ/)).toBeInTheDocument();
      expect(screen.getByText(/Глютен/)).toBeInTheDocument();
    });
  });

  it('keeps only one dish position expanded per day', () => {
    const initialValues = createBlankWeeklyMenuFormValues();
    initialValues.days = initialValues.days.slice(0, 1);
    initialValues.days[0].items = [createBlankItem(), createBlankItem()];
    initialValues.days[0].items[0].name = 'Салат';
    initialValues.days[0].items[1].name = 'Каша';

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WeeklyMenuEditorForm
          initialValues={initialValues}
          mode="backoffice"
          submitLabel="Зберегти"
          saving={false}
          onSubmit={async () => {}}
          recipeCatalogEnabled={false}
        />
      </QueryClientProvider>
    );

    const firstPosition = screen.getByRole('button', { name: /Позиція 1/i });
    const secondPosition = screen.getByRole('button', { name: /Позиція 2/i });

    expect(firstPosition).toHaveAttribute('aria-expanded', 'false');
    expect(secondPosition).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(firstPosition);
    expect(firstPosition).toHaveAttribute('aria-expanded', 'true');
    expect(secondPosition).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByDisplayValue('Салат')).toBeInTheDocument();

    fireEvent.click(secondPosition);
    expect(firstPosition).toHaveAttribute('aria-expanded', 'false');
    expect(secondPosition).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByDisplayValue('Салат')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Каша')).toBeInTheDocument();
  });

  it('closes the technical card search after a card is selected', async () => {
    const initialValues = createBlankWeeklyMenuFormValues();
    initialValues.days = initialValues.days.slice(0, 1);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WeeklyMenuEditorForm
          initialValues={initialValues}
          mode="backoffice"
          submitLabel="Зберегти"
          saving={false}
          onSubmit={async () => {}}
          recipeCatalogEnabled
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Позиція 1/i }));
    fireEvent.click(await screen.findByRole('button', { name: /1\.54.*Салат/i }));

    expect(screen.getByText('Техкарту обрано')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Пошук ТК за номером або назвою')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Змінити техкарту' }));
    expect(screen.getByPlaceholderText('Пошук ТК за номером або назвою')).toBeInTheDocument();
  });

  it('preserves imported product nutrition and submits manual changes', async () => {
    const initialValues = createBlankWeeklyMenuFormValues();
    initialValues.title = 'Імпортоване меню';
    initialValues.days = initialValues.days.slice(0, 1);

    const product = initialValues.days[0].items[0];
    product.kind = 'product';
    product.source_text = 'пром. вироб.';
    product.name = 'Сік пастеризований';
    product.product_name_snapshot = 'Сік пастеризований';
    product.product_ingredient_id = 'ingredient-juice';
    product.portions.forEach((portion) => {
      portion.yield_amount = '200';
    });
    product.portions[0].nutrition = {
      kcal: '98.7',
      proteins: '1.2',
      fats: '0',
      carbs: '20.5',
    };

    const onSubmit = vi.fn(async (values: WeeklyMenuFormValues) => {
      void values;
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WeeklyMenuEditorForm
          initialValues={initialValues}
          mode="backoffice"
          submitLabel="Зберегти"
          saving={false}
          onSubmit={onSubmit}
          recipeCatalogEnabled={false}
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Позиція 1/i }));

    const kcalInput = screen.getByLabelText('Ккал, 6-11 років');
    expect(kcalInput).toHaveValue('98.7');
    expect(screen.getByLabelText('Білки, 6-11 років')).toHaveValue('1.2');

    fireEvent.change(kcalInput, { target: { value: '99.1' } });
    expect(kcalInput).toHaveValue('99.1');

    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submittedValues = onSubmit.mock.calls[0][0];
    expect(submittedValues.days[0].items[0].portions[0].nutrition).toEqual({
      kcal: '99.1',
      proteins: '1.2',
      fats: '0',
      carbs: '20.5',
    });
  });
});
