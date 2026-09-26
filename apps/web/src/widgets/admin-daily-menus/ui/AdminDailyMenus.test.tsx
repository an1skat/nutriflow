import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { AdminDailyMenus } from './AdminDailyMenus';

const mocks = vi.hoisted(() => ({ month: vi.fn() }));
vi.mock('@/shared/ui/ConfirmDialog', () => ({ useConfirm: () => async () => true }));
vi.mock('@/entities/weekly-menu/api/DailyMenuQueries', () => ({
  useDailyMenuSchools: () => ({ data: [{ id: 'owned', name: 'Власна школа' }] }),
  useDailyMenuMonth: mocks.month,
}));
vi.mock('@/widgets/daily-menu-school-workspace/ui/DailyMenuSchoolWorkspace', () => ({
  DailyMenuSchoolWorkspace: ({ admin }: { admin: { menuId: string; readOnly: boolean } }) => (
    <div>
      Editor {admin.menuId} {admin.readOnly ? 'readonly' : 'editable'}
    </div>
  ),
}));
beforeEach(() => {
  mocks.month.mockReturnValue({
    data: {
      today: '2026-09-26',
      groups: [],
      items: [
        {
          menu_id: 'breakfast',
          menu_title: 'Вересень',
          meal_type: 'breakfast',
          weekday: 'tuesday',
          date: '2026-09-01',
          closed_at: null,
          requirement_stale: true,
        },
        {
          menu_id: 'lunch',
          menu_title: 'Вересень',
          meal_type: 'lunch',
          weekday: 'tuesday',
          date: '2026-09-01',
          closed_at: '2026-09-01',
          requirement_stale: false,
        },
      ],
    },
  });
});
it('never mounts an editor for an inaccessible school supplied in the URL', () => {
  render(<AdminDailyMenus initialSchoolId="another-admin-school" />);
  expect(screen.getByText('Школа недоступна.')).toBeInTheDocument();
  expect(screen.queryByText(/Editor/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Переформувати/ })).not.toBeInTheDocument();
  expect(mocks.month).toHaveBeenCalledWith('', expect.any(String));
});
it('shows separate breakfast and lunch and routes both to the shared editor', async () => {
  render(<AdminDailyMenus initialSchoolId="owned" />);
  fireEvent.change(screen.getByLabelText('Місяць'), { target: { value: '2026-09' } });
  fireEvent.click(
    screen.getByRole('button', { name: /2026-09-01: Сніданок · Відкрито, Обід · Закрито/ })
  );
  expect(await screen.findByText('Editor breakfast editable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Обід · Вересень' }));
  expect(await screen.findByText('Editor lunch editable')).toBeInTheDocument();
});
