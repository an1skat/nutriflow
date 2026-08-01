import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCurrentWeekClosedDays } from '@/entities/weekly-menu/api/WeeklyMenuQueries';
import { useReopenWeeklyMenuDay } from '@/features/day-reopening/model/UseReopenWeeklyMenuDay';
import { ConfirmDialogProvider } from '@/shared/ui/ConfirmDialog';

import { SchoolDayReopeningPanel } from './SchoolDayReopeningPanel';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/entities/weekly-menu/api/WeeklyMenuQueries', () => ({
  useCurrentWeekClosedDays: vi.fn(),
}));

vi.mock('@/features/day-reopening/model/UseReopenWeeklyMenuDay', () => ({
  useReopenWeeklyMenuDay: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

const closedDaysData = {
  school_id: 'school-1',
  week_starts_on: '2026-07-06',
  week_ends_on: '2026-07-10',
  items: [
    {
      menu_id: 'menu-1',
      menu_title: 'Меню школи',
      meal_type: 'lunch' as const,
      weekday: 'monday' as const,
      date: '2026-07-06',
      closed_at: '2026-07-06T15:00:00Z',
      close_reason: 'manual' as const,
    },
  ],
};

function renderPanel() {
  return render(
    <ConfirmDialogProvider>
      <SchoolDayReopeningPanel schoolId="school-1" />
    </ConfirmDialogProvider>
  );
}

describe('SchoolDayReopeningPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCurrentWeekClosedDays).mockReturnValue({
      data: closedDaysData,
      error: null,
      isError: false,
      isPending: false,
      refetch: mocks.refetch,
    } as unknown as ReturnType<typeof useCurrentWeekClosedDays>);
    vi.mocked(useReopenWeeklyMenuDay).mockReturnValue({
      isPending: false,
      mutateAsync: mocks.mutateAsync,
      variables: undefined,
    } as unknown as ReturnType<typeof useReopenWeeklyMenuDay>);
    mocks.mutateAsync.mockResolvedValue(undefined);
  });

  it('reopens the selected closed day after confirmation', async () => {
    renderPanel();

    expect(screen.getByText('Понеділок')).toBeInTheDocument();
    expect(screen.getByText('Меню школи')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Відкрити день' }));
    const dialog = screen.getByRole('dialog', { name: 'Відкрити день повторно?' });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Відкрити день' }));

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        menuId: 'menu-1',
        weekday: 'monday',
      })
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('День відкрито повторно.');
  });

  it('does not reopen the day when confirmation is cancelled', async () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Відкрити день' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it('shows an empty state when the workweek has no closed days', () => {
    vi.mocked(useCurrentWeekClosedDays).mockReturnValue({
      data: { ...closedDaysData, items: [] },
      error: null,
      isError: false,
      isPending: false,
      refetch: mocks.refetch,
    } as unknown as ReturnType<typeof useCurrentWeekClosedDays>);

    renderPanel();

    expect(screen.getByText('Закритих днів за поточний тиждень немає.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Відкрити день' })).not.toBeInTheDocument();
  });
});
