import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { SchoolGroup } from '@/entities/school-group/model/SchoolGroup';
import { type WeeklyMenu, weeklyMenuSchema } from '@/entities/weekly-menu/model/WeeklyMenu';
import { saveDailyMenuDraft } from '@/features/daily-menu/model/DailyMenuDraftStorage';

import { type AdminDailyMenuContext, DailyMenuSchoolWorkspace } from './DailyMenuSchoolWorkspace';

const mocks = vi.hoisted(() => ({
  menu: {} as WeeklyMenu,
  update: vi.fn(),
  reopen: vi.fn(),
  generate: vi.fn(),
  close: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/shared/ui/ConfirmDialog', () => ({ useConfirm: () => async () => true }));
vi.mock('@/entities/weekly-menu/api/WeeklyMenuQueries', () => ({
  useWeeklyMenu: () => ({ data: mocks.menu, isPending: false, isError: false }),
  useWeeklyMenus: () => ({ data: { items: [mocks.menu] }, isPending: false, isError: false }),
}));
vi.mock('@/entities/school-group/api/SchoolGroupQueries', () => ({
  useOwnSchoolGroups: () => ({ data: { items: groups }, isPending: false, isError: false }),
}));
vi.mock('@/features/weekly-menu-editor/model/UseWeeklyMenuMutations', () => ({
  useUpdateWeeklyMenu: () => ({ mutateAsync: mocks.update, isPending: false }),
  useCloseWeeklyMenuDay: () => ({ mutateAsync: mocks.close, isPending: false }),
}));
vi.mock('@/features/day-reopening/model/UseReopenWeeklyMenuDay', () => ({
  useReopenWeeklyMenuDay: () => ({ mutateAsync: mocks.reopen, isPending: false }),
}));
vi.mock('@/features/menu-requirement-generation/model/UseGenerateMenuRequirements', () => ({
  useGenerateMenuRequirements: () => ({ mutateAsync: mocks.generate, isPending: false }),
}));
vi.mock('@/entities/weekly-menu/api/DailyMenuQueries', () => ({
  dailyMenuQueryKeys: { all: ['daily-menus'] },
  useRegenerateDailyRequirements: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/entities/recipe/api/RecipeQueries', () => ({
  useDishCards: () => ({ data: { items: [] }, isPending: false, isError: false }),
  useIngredients: () => ({ data: { items: [] }, isPending: false, isError: false }),
}));

const groups: SchoolGroup[] = ['1-А', '1-Б'].map((name, index) => ({
  id: `group-${index}`,
  school_id: 'school',
  name,
  age_group: '6-11',
  is_active: true,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.menu = weeklyMenuSchema.parse({
    id: 'menu',
    title: 'Тижневе меню',
    school_id: 'school',
    source_menu_id: 'template',
    meal_type: 'lunch',
    cycle_week: null,
    starts_on: '2026-07-06',
    ends_on: '2026-07-10',
    status: 'published',
    days: [
      {
        weekday: 'monday',
        date: '2026-07-06',
        not_served: false,
        notes: null,
        closed_at: null,
        closed_by: null,
        close_reason: null,
        items: [
          {
            id: 'item',
            position: 1,
            kind: 'product',
            source_text: null,
            recipe_card_number: null,
            dish_card_id: null,
            dish_card_version_id: null,
            product_ingredient_id: 'bread',
            product_name_snapshot: 'Хліб',
            name: 'Хліб',
            allergen_codes: [],
            portions: [
              {
                age_group: '6-11',
                yield_amount: '100',
                dish_card_portion_variant_id: null,
                calculated_from: null,
                nutrition: { kcal: null, proteins: null, fats: null, carbs: null },
              },
            ],
            servings: groups.map((group) => ({
              school_group_id: group.id,
              age_group: group.age_group,
              children_count: 30,
            })),
            notes: null,
          },
        ],
      },
    ],
    notes: null,
    source_file_name: null,
    source_sheet_name: null,
    published_at: '2026-07-01T00:00:00Z',
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    created_by: 'admin',
    updated_by: 'admin',
    revision: 1,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  });
  mocks.update.mockImplementation(async (payload) => {
    mocks.menu = { ...mocks.menu, days: payload.days, revision: mocks.menu.revision + 1 };
    return mocks.menu;
  });
  mocks.reopen.mockImplementation(async () => {
    mocks.menu = {
      ...mocks.menu,
      revision: mocks.menu.revision + 1,
      days: mocks.menu.days.map((day) => ({
        ...day,
        closed_at: null,
        closed_by: null,
        close_reason: null,
      })),
    };
    return mocks.menu;
  });
  mocks.generate.mockResolvedValue({ items: [] });
  mocks.close.mockImplementation(async () => {
    mocks.menu = {
      ...mocks.menu,
      revision: mocks.menu.revision + 1,
      days: mocks.menu.days.map((day) => ({ ...day, closed_at: '2026-07-06T15:00:00Z' })),
    };
    return mocks.menu;
  });
});

function mount(mode: 'school' | 'admin') {
  const admin: AdminDailyMenuContext | undefined =
    mode === 'admin'
      ? {
          menuId: 'menu',
          weekday: 'monday',
          schoolId: 'school',
          groups,
          readOnly: false,
          requirementStale: false,
        }
      : undefined;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => (
    <QueryClientProvider client={queryClient}>
      <DailyMenuSchoolWorkspace admin={admin} />
    </QueryClientProvider>
  );
  return { ...render(view()), view };
}

function checkbox() {
  return screen.getByRole('checkbox', { name: 'Не харчувалися' });
}

function counts() {
  return groups.map((group) => screen.getByLabelText(`${group.name}: кількість дітей`));
}

it.each(['school', 'admin'] as const)(
  '%s: checkbox beside save zeros all groups and saves the flag',
  async (mode) => {
    mount(mode);
    const control = await screen.findByRole('checkbox', { name: 'Не харчувалися' });
    expect(control.closest('label')?.parentElement).toContainElement(
      screen.getByRole('button', { name: 'Зберегти зміни' })
    );
    counts().forEach((input) => expect(input).toHaveValue('30'));
    fireEvent.click(control);
    counts().forEach((input) => {
      expect(input).toHaveValue('0');
      expect(input).toBeDisabled();
      fireEvent.change(input, { target: { value: '99' } });
      expect(input).toHaveValue('0');
    });
    expect(screen.getByRole('button', { name: 'Зберегти зміни' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    const savedDay = mocks.update.mock.calls[0][0].days[0];
    expect(savedDay.not_served).toBe(true);
    expect(
      savedDay.items[0].servings.map((s: { children_count: number }) => s.children_count)
    ).toEqual([0, 0]);
    await waitFor(() => expect(checkbox()).toBeChecked());
    fireEvent.click(checkbox());
    counts().forEach((input) => {
      expect(input).toHaveValue('0');
      expect(input).toBeEnabled();
    });
    fireEvent.change(counts()[0], { target: { value: '7' } });
    expect(counts()[0]).toHaveValue('7');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    expect(mocks.update.mock.calls[1][0].days[0].not_served).toBe(false);
  }
);

it.each(['school', 'admin'] as const)('%s: a closed no-food day stays read-only', async (mode) => {
  mocks.menu.days[0].not_served = true;
  mocks.menu.days[0].closed_at = '2026-07-06T15:00:00Z';
  mount(mode);
  await screen.findByRole('checkbox', { name: 'Не харчувалися' });
  expect(checkbox()).toBeChecked();
  expect(checkbox()).toBeDisabled();
  counts().forEach((input) => {
    expect(input).toHaveValue('0');
    expect(input).toBeDisabled();
  });
});

it('admin can toggle after reopening without resurrecting counts', async () => {
  mocks.menu.days[0].not_served = true;
  mocks.menu.days[0].closed_at = '2026-07-06T15:00:00Z';
  const mounted = mount('admin');
  fireEvent.click(await screen.findByRole('button', { name: 'Відкрити для редагування' }));
  await waitFor(() => expect(mocks.reopen).toHaveBeenCalledOnce());
  mounted.rerender(mounted.view());
  await waitFor(() => expect(checkbox()).toBeEnabled());
  fireEvent.click(checkbox());
  expect(checkbox()).not.toBeChecked();
  counts().forEach((input) => expect(input).toHaveValue('0'));
});

it('normalizes a restored no-food draft and discards a draft from before a server save', async () => {
  const draftDays = structuredClone(mocks.menu.days);
  draftDays[0].not_served = true;
  saveDailyMenuDraft(mocks.menu.id, mocks.menu.updated_at, draftDays);
  const mounted = mount('school');
  await waitFor(() => expect(checkbox()).toBeChecked());
  counts().forEach((input) => expect(input).toHaveValue('0'));
  mounted.unmount();
  mocks.menu = { ...mocks.menu, revision: 2, updated_at: '2026-07-02T00:00:00Z' };
  mocks.menu.days[0].not_served = true;
  mount('school');
  await waitFor(() => expect(checkbox()).toBeChecked());
  counts().forEach((input) => expect(input).toHaveValue('0'));
  expect(window.localStorage.getItem('nutriflow:daily-menu:draft:menu')).toBeNull();
});

it('school can generate zero requirements and close a no-food day', async () => {
  mocks.menu.days[0].not_served = true;
  mount('school');
  await screen.findByRole('checkbox', { name: 'Не харчувалися' });
  fireEvent.click(screen.getByRole('button', { name: 'Сформувати меню-вимогу' }));
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Закрити день' }));
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  await waitFor(() => expect(checkbox()).toBeDisabled());
});
