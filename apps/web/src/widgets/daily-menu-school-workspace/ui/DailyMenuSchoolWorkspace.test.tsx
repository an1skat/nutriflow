import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchoolGroup } from '@/entities/school-group/model/SchoolGroup';
import type { DailyMenu, WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';

import { DailyMenuSchoolWorkspace } from './DailyMenuSchoolWorkspace';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  close: vi.fn(),
  fetchVersion: vi.fn(),
  confirm: vi.fn(),
  regenerate: vi.fn(),
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

const originalMenu: WeeklyMenu = {
  id: 'menu-1',
  title: 'Шкільне меню',
  school_id: 'school-1',
  source_menu_id: 'template-1',
  meal_type: 'lunch',
  cycle_week: 1,
  starts_on: '2026-07-06',
  ends_on: '2026-07-10',
  status: 'published',
  notes: null,
  source_file_name: null,
  source_sheet_name: null,
  published_at: '2026-07-01T00:00:00Z',
  revoked_at: null,
  revoked_by: null,
  revoke_reason: null,
  created_by: 'admin-1',
  updated_by: 'admin-1',
  revision: 1,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
  days: [
    {
      weekday: 'monday',
      date: '2026-07-06',
      notes: null,
      closed_at: null,
      closed_by: null,
      close_reason: null,
      items: [
        {
          id: 'soup',
          position: 1,
          kind: 'dish_card',
          source_text: null,
          recipe_card_number: '1.01',
          dish_card_id: 'card-soup',
          dish_card_version_id: 'version-soup',
          product_ingredient_id: null,
          product_name_snapshot: null,
          name: 'Суп',
          allergen_codes: [],
          servings: [{ school_group_id: group.id, age_group: group.age_group, children_count: 10 }],
          notes: null,
          is_school_added: false,
          is_school_customized: false,
          portions: [
            {
              age_group: '6-11',
              yield_amount: '200',
              dish_card_portion_variant_id: null,
              calculated_from: null,
              nutrition: { kcal: null, proteins: null, fats: null, carbs: null },
            },
          ],
        },
        {
          id: 'porridge',
          position: 2,
          kind: 'dish_card',
          source_text: null,
          recipe_card_number: '1.02',
          dish_card_id: 'card-porridge',
          dish_card_version_id: 'version-porridge',
          product_ingredient_id: null,
          product_name_snapshot: null,
          name: 'Каша',
          allergen_codes: [],
          servings: [{ school_group_id: group.id, age_group: group.age_group, children_count: 10 }],
          notes: null,
          is_school_added: false,
          is_school_customized: false,
          portions: [
            {
              age_group: '6-11',
              yield_amount: '200',
              dish_card_portion_variant_id: null,
              calculated_from: null,
              nutrition: { kcal: null, proteins: null, fats: null, carbs: null },
            },
          ],
        },
      ],
    },
  ],
};

const catalogCard = {
  id: 'new-card',
  name: 'Новий суп',
  card_number: '9.1',
  current_version_id: 'new-version',
};
let currentMenu = originalMenu;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/entities/weekly-menu/api/WeeklyMenuQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/weekly-menu/api/WeeklyMenuQueries')>()),
  useWeeklyMenus: () => ({ data: { items: [currentMenu] }, isPending: false, isError: false }),
  useWeeklyMenu: () => ({ data: currentMenu, isPending: false, isError: false }),
}));
vi.mock('@/entities/school-group/api/SchoolGroupQueries', () => ({
  useOwnSchoolGroups: () => ({ data: { items: [group] }, isPending: false, isError: false }),
}));
vi.mock('@/entities/recipe/api/RecipeQueries', () => ({
  dishCardVersionQueryOptions: (id: string) => ({
    queryKey: ['version', id],
    queryFn: mocks.fetchVersion,
  }),
  useDishCards: () => ({ data: { items: [catalogCard] }, isPending: false, isError: false }),
  useIngredients: () => ({ data: { items: [] }, isPending: false, isError: false }),
}));
vi.mock('@/features/weekly-menu-editor/model/UseWeeklyMenuMutations', () => ({
  useUpdateWeeklyMenu: () => ({ mutateAsync: mocks.update, isPending: false }),
  useCloseWeeklyMenuDay: () => ({ mutateAsync: mocks.close, isPending: false }),
}));
vi.mock('@/features/menu-requirement-generation/model/UseGenerateMenuRequirements', () => ({
  useGenerateMenuRequirements: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/shared/ui/ConfirmDialog', () => ({ useConfirm: () => mocks.confirm }));
vi.mock('@/shared/api/HttpClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api/HttpClient')>()),
  apiClient: { post: mocks.regenerate },
}));

function renderWorkspace() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DailyMenuSchoolWorkspace />
    </QueryClientProvider>
  );
}

describe('daily menu draft and day closure', () => {
  beforeEach(() => {
    window.localStorage.clear();
    currentMenu = originalMenu;
    mocks.confirm.mockResolvedValue(true);
    mocks.update.mockReset();
    mocks.close.mockReset();
    vi.mocked(toast.error).mockClear();
    mocks.fetchVersion.mockReset();
  });

  it.each(['draft', 'confirmed', 'archived'])(
    'accepts the current %s version in the daily menu',
    async (status) => {
      mocks.fetchVersion.mockResolvedValue({
        id: 'new-version',
        dish_card_id: 'new-card',
        status,
        portion_variants: [
          {
            id: 'portion-new',
            age_group: '6-11',
            output_grams: '200',
            nutrition: { kcal: '42', proteins: '1', fats: '2', carbs: '3' },
          },
        ],
        ingredient_amounts: [],
        allergen_ids: [],
      });
      renderWorkspace();
      fireEvent.click(await screen.findByRole('button', { name: 'Суп' }));
      fireEvent.click(await screen.findByRole('option', { name: /Новий суп/ }));
      await screen.findByRole('button', { name: 'Видалити позицію Новий суп' });
      expect(toast.error).not.toHaveBeenCalled();
      expect(screen.getByText('Є незбережені зміни')).toBeInTheDocument();
    }
  );

  it.each([
    ['import_preview', 'new-version', 'new-card'],
    ['draft', 'other-version', 'new-card'],
    ['draft', 'new-version', 'other-card'],
  ])('rejects unusable version %s / %s / %s', async (status, id, dishCardId) => {
    mocks.fetchVersion.mockResolvedValue({ id, dish_card_id: dishCardId, status });
    renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: 'Суп' }));
    fireEvent.click(await screen.findByRole('option', { name: /Новий суп/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Поточна версія техкарти недоступна для розрахунків.'
      )
    );
    expect(screen.getByRole('button', { name: 'Видалити позицію Суп' })).toBeInTheDocument();
  });

  it('retries an unsaved restored deletion and does not close after another failed Save', async () => {
    mocks.update.mockRejectedValue(new Error('Save failed'));
    const view = renderWorkspace();
    await screen.findByRole('button', { name: 'Видалити позицію Суп' });
    fireEvent.click(screen.getByRole('button', { name: 'Видалити позицію Суп' }));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(window.localStorage.length).toBe(1);
    view.unmount();

    renderWorkspace();
    await screen.findByText('Є незбережені зміни');
    expect(screen.queryByRole('button', { name: 'Видалити позицію Суп' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрити день' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('clears dirty state after a successful Save and closes normally', async () => {
    const savedMenu: WeeklyMenu = {
      ...originalMenu,
      revision: 2,
      updated_at: '2026-07-01T01:00:00Z',
      days: [
        { ...originalMenu.days[0], items: [{ ...originalMenu.days[0].items[1], position: 1 }] },
      ],
    };
    mocks.update.mockImplementation(async () => {
      currentMenu = savedMenu;
      return savedMenu;
    });
    mocks.close.mockResolvedValue(savedMenu);
    renderWorkspace();
    await screen.findByRole('button', { name: 'Видалити позицію Суп' });
    fireEvent.click(screen.getByRole('button', { name: 'Видалити позицію Суп' }));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }));
    await screen.findByText('Усі зміни збережено');
    expect(window.localStorage.length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Закрити день' }));
    await waitFor(() => expect(mocks.close).toHaveBeenCalledWith('monday'));
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('does not remove the last dish from an open day', async () => {
    currentMenu = {
      ...originalMenu,
      days: [{ ...originalMenu.days[0], items: [originalMenu.days[0].items[1]] }],
    };
    renderWorkspace();
    const remove = await screen.findByRole('button', { name: 'Видалити позицію Каша' });
    fireEvent.click(remove);

    expect(screen.getByRole('button', { name: 'Видалити позицію Каша' })).toBeInTheDocument();
    expect(screen.queryByText('Є незбережені зміни')).not.toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

const warning = 'Дані дня змінено. Меню-вимогу потрібно сформувати повторно.';
function renderAdmin({ stale = false, readOnly = false } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DailyMenuSchoolWorkspace
        admin={{
          menuId: originalMenu.id,
          weekday: 'monday',
          schoolId: group.school_id,
          groups: [group],
          readOnly,
          requirementStale: stale,
        }}
      />
    </QueryClientProvider>
  );
  return { ...view, invalidate };
}

describe('admin daily corrections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    currentMenu = structuredClone(originalMenu);
    mocks.confirm.mockResolvedValue(true);
    mocks.regenerate.mockResolvedValue({ data: { ok: true } });
    mocks.update.mockImplementation(async (payload) => {
      currentMenu = { ...currentMenu, days: payload.days, revision: currentMenu.revision + 1 };
      return currentMenu;
    });
  });

  async function editAndSave(count: number) {
    fireEvent.change(await screen.findByRole('textbox', { name: '1-А: кількість дітей' }), {
      target: { value: String(count) },
    });
    fireEvent.blur(screen.getByRole('textbox', { name: '1-А: кількість дітей' }));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }));
    await screen.findByText(warning);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Зберегти зміни' })).toBeDisabled()
    );
  }

  it('save marks stale; confirmed regeneration refreshes dependent queries; another edit marks stale again', async () => {
    const { invalidate } = renderAdmin();
    await editAndSave(263);
    expect(mocks.regenerate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Переформувати меню-вимогу' }));
    await screen.findByText('Меню-вимога актуальна.');
    expect(mocks.confirm).toHaveBeenCalledWith({
      title: 'Переформувати меню-вимогу?',
      description:
        'Поточні дані меню-вимоги за цей день буде перераховано на основі виправленого денного меню.',
      confirmLabel: 'Переформувати',
    });
    expect(mocks.regenerate).toHaveBeenCalledWith(
      '/menus/daily/school-1/menu-1/monday/regenerate',
      { revision: 2 },
      expect.anything()
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['protected', 'menu-requirements'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['protected', 'norm-compliance'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['protected', 'daily-menu-management'] });
    await editAndSave(250);
    expect(screen.getByText(warning)).toBeInTheDocument();
  });

  it('cancelling confirmation never regenerates', async () => {
    mocks.confirm.mockResolvedValue(false);
    renderAdmin({ stale: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Переформувати меню-вимогу' }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.regenerate).not.toHaveBeenCalled();
    expect(screen.getByText(warning)).toBeInTheDocument();
  });

  it('failed regeneration retains saved data and warning and permits retry', async () => {
    mocks.regenerate.mockRejectedValueOnce(new Error('failed'));
    renderAdmin();
    await editAndSave(263);
    fireEvent.click(screen.getByRole('button', { name: 'Переформувати меню-вимогу' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByText(warning)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '1-А: кількість дітей' })).toHaveValue('263');
    fireEvent.click(screen.getByRole('button', { name: 'Переформувати меню-вимогу' }));
    await screen.findByText('Меню-вимога актуальна.');
  });

  it('retains server-derived stale warning on a fresh mount', async () => {
    renderAdmin({ stale: true });
    expect(await screen.findByText(warning)).toBeInTheDocument();
  });

  it('historical months are read-only and expose no mutation actions', async () => {
    renderAdmin({ stale: true, readOnly: true });
    expect(await screen.findByRole('textbox', { name: '1-А: кількість дітей' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Переформувати меню-вимогу' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Зберегти зміни' })).not.toBeInTheDocument();
  });

  it('admin active-day save ignores invalid unrelated open day', async () => {
    const tuesdayDay: DailyMenu = {
      ...originalMenu.days[0],
      weekday: 'tuesday',
      date: '2026-07-07',
      items: [originalMenu.days[0].items[0]],
    };
    const fridayDay: DailyMenu = {
      ...originalMenu.days[0],
      weekday: 'friday',
      date: '2026-07-10',
      items: [
        {
          ...originalMenu.days[0].items[0],
          id: 'friday-soup',
          portions: [
            {
              ...originalMenu.days[0].items[0].portions[0],
              yield_amount: '',
            },
          ],
        },
      ],
    };
    currentMenu = { ...originalMenu, days: [tuesdayDay, fridayDay] };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <DailyMenuSchoolWorkspace
          admin={{
            menuId: currentMenu.id,
            weekday: 'tuesday',
            schoolId: group.school_id,
            groups: [group],
            readOnly: false,
            requirementStale: false,
          }}
        />
      </QueryClientProvider>
    );

    fireEvent.change(await screen.findByRole('textbox', { name: '1-А: кількість дітей' }), {
      target: { value: '15' },
    });
    fireEvent.blur(screen.getByRole('textbox', { name: '1-А: кількість дітей' }));
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();

    const payload = mocks.update.mock.calls[0][0] as {
      days: Array<DailyMenu & { items: Array<{ servings: Array<{ children_count: number }> }> }>;
    };
    const savedTuesday = payload.days.find((d) => d.weekday === 'tuesday');
    expect(savedTuesday?.items[0].servings[0].children_count).toBe(15);

    const savedFriday = payload.days.find((d) => d.weekday === 'friday');
    expect(savedFriday?.weekday).toBe('friday');
    expect(savedFriday?.items).toEqual(fridayDay.items);
  });
});
