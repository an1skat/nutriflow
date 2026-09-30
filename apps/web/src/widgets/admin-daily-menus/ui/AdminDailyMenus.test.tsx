import { fireEvent, render, screen, within } from '@testing-library/react';
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
  fireEvent.click(
    screen.getByRole('button', { name: /2026-09-01: Сніданок · Відкрито, Обід · Закрито/ })
  );
  expect(await screen.findByText('Editor breakfast editable')).toBeInTheDocument();
  const mealContainer = screen.getByLabelText('Меню обраного дня');
  const breakfastBtn = within(mealContainer).getByRole('button', { name: /Сніданок/ });
  const lunchBtn = within(mealContainer).getByRole('button', { name: /Обід/ });
  expect(breakfastBtn).toHaveAttribute('aria-pressed', 'true');
  expect(lunchBtn).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(lunchBtn);
  expect(await screen.findByText('Editor lunch editable')).toBeInTheDocument();
  expect(breakfastBtn).toHaveAttribute('aria-pressed', 'false');
  expect(lunchBtn).toHaveAttribute('aria-pressed', 'true');
});

it('allows shifting months with previous and next buttons', () => {
  render(<AdminDailyMenus initialSchoolId="owned" />);
  expect(mocks.month).toHaveBeenCalledWith('owned', '2026-09');

  fireEvent.click(screen.getByRole('button', { name: 'Попередній місяць' }));
  expect(mocks.month).toHaveBeenCalledWith('owned', '2026-08');

  fireEvent.click(screen.getByRole('button', { name: 'Наступний місяць' }));
  expect(mocks.month).toHaveBeenCalledWith('owned', '2026-09');
});

it('allows opening the month picker, switching year and selecting a month', () => {
  render(<AdminDailyMenus initialSchoolId="owned" />);
  const pickerTrigger = screen.getByRole('button', { name: /Місяць:/ });
  fireEvent.click(pickerTrigger);

  const dialog = screen.getByRole('dialog', { name: 'Календар вибору місяця' });
  expect(dialog).toBeInTheDocument();

  // Shift year forward
  fireEvent.click(screen.getByRole('button', { name: 'Наступний рік' }));
  expect(screen.getByText('2027')).toBeInTheDocument();

  // Select March 2027
  fireEvent.click(screen.getByRole('button', { name: 'Бер' }));
  expect(mocks.month).toHaveBeenCalledWith('owned', '2027-03');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('marks past days editable and future days readonly regardless of month', async () => {
  mocks.month.mockReturnValue({
    data: {
      today: '2026-09-26',
      groups: [],
      items: [
        {
          menu_id: 'past-day',
          menu_title: 'Минулий',
          meal_type: 'lunch',
          weekday: 'monday',
          date: '2026-08-10',
          closed_at: null,
          requirement_stale: false,
        },
        {
          menu_id: 'future-day',
          menu_title: 'Майбутній',
          meal_type: 'lunch',
          weekday: 'monday',
          date: '2026-09-28',
          closed_at: null,
          requirement_stale: false,
        },
      ],
    },
  });

  render(<AdminDailyMenus initialSchoolId="owned" />);

  // Select August in MonthPicker
  fireEvent.click(screen.getByRole('button', { name: /Місяць:/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Сер' }));
  fireEvent.click(screen.getByRole('button', { name: /2026-08-10/ }));
  expect(await screen.findByText('Editor past-day editable')).toBeInTheDocument();

  // Select September in MonthPicker
  fireEvent.click(screen.getByRole('button', { name: /Місяць:/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Вер' }));
  fireEvent.click(screen.getByRole('button', { name: /2026-09-28/ }));
  expect(await screen.findByText('Editor future-day readonly')).toBeInTheDocument();
});
