import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';

import { WeeklyMenuSchoolWorkspace } from './WeeklyMenuSchoolWorkspace';

const menus = [
  { id: 'past', title: 'Вересневе меню', starts_on: '2026-09-28', ends_on: '2026-10-02' },
  { id: 'current', title: 'Поточне меню', starts_on: '2026-10-05', ends_on: '2026-10-09' },
  { id: 'next', title: 'Наступне меню', starts_on: '2026-10-12', ends_on: '2026-10-16' },
];

vi.mock('@/entities/weekly-menu/api/WeeklyMenuQueries', () => ({
  useWeeklyMenus: (request: { status: string }) => ({
    data: { items: request.status === 'published' ? menus : [] },
    isPending: false,
    isError: false,
  }),
  useWeeklyMenu: (id: string) => ({
    data: menus.find((menu) => menu.id === id),
    isPending: !id,
    isError: false,
  }),
}));
vi.mock('@/features/weekly-menu-editor/model/UseWeeklyMenuMutations', () => ({
  useArchiveSchoolWeeklyMenu: () => ({ isPending: false }),
  useRestoreSchoolWeeklyMenu: () => ({ isPending: false }),
}));
vi.mock('@/shared/ui/ConfirmDialog', () => ({ useConfirm: () => vi.fn() }));
vi.mock('./WeeklyMenuSchoolTable', () => ({
  WeeklyMenuSchoolTable: ({ menu }: { menu: WeeklyMenu }) => (
    <div data-testid="selected-menu">{menu.title}</div>
  ),
}));

afterEach(() => vi.useRealTimers());

it.each([
  ['2026-10-11T12:00:00Z', 'Поточне меню'],
  ['2026-10-12T12:00:00Z', 'Наступне меню'],
])('opens the calendar week at %s', (now, title) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  render(<WeeklyMenuSchoolWorkspace />);
  expect(screen.getByTestId('selected-menu')).toHaveTextContent(title);
});

it('shows a missing assignment and still allows selecting a historical menu', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
  render(<WeeklyMenuSchoolWorkspace />);
  expect(screen.getByText('На цей тиждень меню не призначено.')).toBeInTheDocument();
  expect(screen.queryByTestId('selected-menu')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Вересневе меню/ }));
  expect(screen.getByTestId('selected-menu')).toHaveTextContent('Вересневе меню');
});
