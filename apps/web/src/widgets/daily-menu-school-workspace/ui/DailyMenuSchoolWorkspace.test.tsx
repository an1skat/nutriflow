import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchoolGroup } from '@/entities/school-group/model/SchoolGroup';
import type { WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';

import { DailyMenuSchoolWorkspace } from './DailyMenuSchoolWorkspace';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  close: vi.fn(),
}));

const group: SchoolGroup = {
  id: 'group-1', school_id: 'school-1', name: '1-А', age_group: '6-11', is_active: true,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
};

const originalMenu: WeeklyMenu = {
  id: 'menu-1', title: 'Шкільне меню', school_id: 'school-1', source_menu_id: 'template-1',
  meal_type: 'lunch', cycle_week: 1, starts_on: '2026-07-06', ends_on: '2026-07-10',
  status: 'published', notes: null, source_file_name: null, source_sheet_name: null,
  published_at: '2026-07-01T00:00:00Z', revoked_at: null, revoked_by: null,
  revoke_reason: null, created_by: 'admin-1', updated_by: 'admin-1', revision: 1,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  days: [{
    weekday: 'monday', date: '2026-07-06', notes: null, closed_at: null, closed_by: null,
    close_reason: null,
    items: [
      {
        id: 'soup', position: 1, kind: 'dish_card', source_text: null,
        recipe_card_number: '1.01', dish_card_id: 'card-soup', dish_card_version_id: 'version-soup',
        product_ingredient_id: null, product_name_snapshot: null, name: 'Суп',
        allergen_codes: [], servings: [{school_group_id: group.id, age_group: group.age_group, children_count: 10}],
        notes: null, is_school_added: false, is_school_customized: false,
        portions: [{age_group: '6-11', yield_amount: '200', dish_card_portion_variant_id: null,
          calculated_from: null, nutrition: {kcal: null, proteins: null, fats: null, carbs: null}}],
      },
      {
        id: 'porridge', position: 2, kind: 'dish_card', source_text: null,
        recipe_card_number: '1.02', dish_card_id: 'card-porridge', dish_card_version_id: 'version-porridge',
        product_ingredient_id: null, product_name_snapshot: null, name: 'Каша',
        allergen_codes: [], servings: [{school_group_id: group.id, age_group: group.age_group, children_count: 10}],
        notes: null, is_school_added: false, is_school_customized: false,
        portions: [{age_group: '6-11', yield_amount: '200', dish_card_portion_variant_id: null,
          calculated_from: null, nutrition: {kcal: null, proteins: null, fats: null, carbs: null}}],
      },
    ],
  }],
};

let currentMenu = originalMenu;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/entities/weekly-menu/api/WeeklyMenuQueries', () => ({
  useWeeklyMenus: () => ({ data: { items: [currentMenu] }, isPending: false, isError: false }),
  useWeeklyMenu: () => ({ data: currentMenu, isPending: false, isError: false }),
}));
vi.mock('@/entities/school-group/api/SchoolGroupQueries', () => ({
  useOwnSchoolGroups: () => ({ data: { items: [group] }, isPending: false, isError: false }),
}));
vi.mock('@/entities/recipe/api/RecipeQueries', () => ({
  useDishCards: () => ({ data: { items: [] }, isPending: false, isError: false }),
  useIngredients: () => ({ data: { items: [] }, isPending: false, isError: false }),
}));
vi.mock('@/features/weekly-menu-editor/model/UseWeeklyMenuMutations', () => ({
  useUpdateWeeklyMenu: () => ({ mutateAsync: mocks.update, isPending: false }),
  useCloseWeeklyMenuDay: () => ({ mutateAsync: mocks.close, isPending: false }),
}));
vi.mock('@/features/menu-requirement-generation/model/UseGenerateMenuRequirements', () => ({
  useGenerateMenuRequirements: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/shared/ui/ConfirmDialog', () => ({ useConfirm: () => async () => true }));

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
    mocks.update.mockReset();
    mocks.close.mockReset();
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
      ...originalMenu, revision: 2, updated_at: '2026-07-01T01:00:00Z',
      days: [{...originalMenu.days[0], items: [{...originalMenu.days[0].items[1], position: 1}]}],
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
