import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type WeeklyMenuFormValues,
  createBlankItem,
  createBlankWeeklyMenuFormValues,
} from '../model/WeeklyMenuFormSchema';
import { WeeklyMenuEditorForm } from './WeeklyMenuEditorForm';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

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
        portion_variants: [
          {
            id: 'orange-100',
            age_group: null,
            portion_grams: '100',
            output_grams: '100',
            nutrition: { kcal: '50', proteins: '0.9', fats: '0.2', carbs: '11' },
            normative_contributions: [],
          },
          {
            id: 'banana-100',
            age_group: null,
            portion_grams: '100',
            output_grams: '100',
            nutrition: { kcal: '95', proteins: '1.5', fats: '0.2', carbs: '21.8' },
            normative_contributions: [],
          },
        ],
        ingredient_amounts: [
          {
            ingredient_id: 'orange',
            ingredient_name_snapshot: 'Апельсин',
            gross_amount: '149',
            net_amount: '100',
            unit: 'g',
            amount_basis: 'per_portion' as const,
            portion_variant_id: 'orange-100',
            notes: null,
          },
          {
            ingredient_id: 'banana',
            ingredient_name_snapshot: 'Банан',
            gross_amount: '167',
            net_amount: '100',
            unit: 'g',
            amount_basis: 'per_portion' as const,
            portion_variant_id: 'banana-100',
            notes: null,
          },
        ],
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
        items: [
          {
            id: 'ingredient-juice',
            name: 'Сік пастеризований',
            normalized_name: 'сік пастеризований',
            unit: 'ml',
            normative_group_id: null,
            normative_contributions: [],
            is_active: true,
            created_at: '2026-07-07T10:00:00Z',
            updated_at: '2026-07-07T10:00:00Z',
          },
        ],
        total: 1,
        offset: 0,
        limit: 50,
      }),
    }),
}));

describe('WeeklyMenuEditorForm', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('never offers Saturday or Sunday as new weekly-menu days', () => {
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
          recipeCatalogEnabled={false}
        />
      </QueryClientProvider>
    );

    expect(screen.getByRole('button', { name: 'Додати Вівторок' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Додати П’ятниця' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Додати Субота' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Додати Неділя' })).not.toBeInTheDocument();
  });

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

  it('shows selected state for industrial products', () => {
    const initialValues = createBlankWeeklyMenuFormValues();
    initialValues.title = 'Меню з виробом';
    initialValues.days = initialValues.days.slice(0, 1);
    const product = initialValues.days[0].items[0];
    product.kind = 'product';
    product.name = 'Сік пастеризований';
    product.product_name_snapshot = 'Сік пастеризований';
    product.product_ingredient_id = 'ingredient-juice';
    product.portions.forEach((portion) => {
      portion.yield_amount = '200';
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
          onSubmit={async () => {}}
          recipeCatalogEnabled
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Позиція 1/i }));

    expect(screen.getByText('Промисловий виріб обрано')).toBeInTheDocument();
    expect(screen.getAllByText('Сік пастеризований')).toHaveLength(2);
    expect(
      screen.queryByPlaceholderText('Пошук інгредієнта або готового виробу')
    ).not.toBeInTheDocument();
  });

  it('toasts and opens the nearest invalid menu position', async () => {
    const initialValues = createBlankWeeklyMenuFormValues();
    initialValues.title = 'Меню з помилкою';
    initialValues.days = initialValues.days.slice(0, 2);
    initialValues.days[0].items[0].name = 'Салат';
    initialValues.days[0].items[0].portions.forEach((portion) => {
      portion.yield_amount = '100';
    });
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

    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await screen.findByText('Вкажіть назву страви або продукту');
    expect(toast.error).toHaveBeenCalledWith('Є незаповнені дані. Я підсвітив найближче місце.', {
      id: 'weekly-menu-validation-error',
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByText(/Форма не збереглась/)).not.toBeInTheDocument();
  });

  it('autosaves editable weekly menu drafts', async () => {
    const initialValues = createBlankWeeklyMenuFormValues();
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
          recipeCatalogEnabled={false}
          draftKey="menu-draft"
          draftBaseUpdatedAt="base-1"
        />
      </QueryClientProvider>
    );

    fireEvent.change(screen.getByLabelText('Назва меню'), {
      target: { value: 'Чернетка меню' },
    });

    await waitFor(() => {
      const rawDraft = window.localStorage.getItem('nutriflow:weekly-menu:draft:menu-draft');
      expect(rawDraft).not.toBeNull();
      expect(JSON.parse(rawDraft ?? '{}').values.title).toBe('Чернетка меню');
    });
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

  it('selects a 12.01 product and stores its exact portion variants and nutrition', async () => {
    const initialValues = createBlankWeeklyMenuFormValues();
    initialValues.title = 'Меню з фруктами';
    initialValues.days = initialValues.days.slice(0, 1);
    const fruit = initialValues.days[0].items[0];
    fruit.name = 'Банани';
    fruit.recipe_card_number = '12.01';
    fruit.dish_card_id = 'dish-card-fruit';
    fruit.dish_card_version_id = 'version-1';
    fruit.portions.forEach((portion) => {
      portion.yield_amount = '100';
    });

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
          recipeCatalogEnabled
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /Позиція 1/i }));
    const productSelect = screen.getByLabelText('Назва позиції');
    await screen.findByRole('option', { name: 'Банан' });
    expect(productSelect).toHaveValue('');

    fireEvent.change(productSelect, { target: { value: 'Банан' } });
    expect(productSelect).toHaveValue('Банан');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submittedFruit = onSubmit.mock.calls[0][0].days[0].items[0];
    expect(submittedFruit.name).toBe('Банан');
    expect(submittedFruit.portions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dish_card_portion_variant_id: 'banana-100',
          nutrition: { kcal: '95', proteins: '1.5', fats: '0.2', carbs: '21.8' },
        }),
      ])
    );
  });
});
