import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { MenuRequirementCalendarMonth } from '@/entities/menu-requirement/model/MenuRequirement';

import { type MealCalendarStatus, RequirementMealStatus } from './RequirementMealStatus';

const month: MenuRequirementCalendarMonth = {
  month: 10,
  date_from: '2026-10-01',
  date_to: '2026-10-31',
  total_days: 31,
  working_days: 5,
  generated_days: 5,
  missing_days: 0,
  stale_days: 0,
  status: 'complete',
  weeks: [
    {
      week_index: 2,
      date_from: '2026-10-05',
      date_to: '2026-10-09',
      generated_days: 5,
      missing_days: 0,
      stale_days: 0,
      status: 'complete',
      days: Array.from({ length: 5 }, (_, index) => ({
        service_date: `2026-10-0${5 + index}`,
        expected_requirements: 2,
        generated_requirements: 2,
        missing_requirements: 0,
        stale_requirements: 0,
        status: 'complete',
      })),
    },
  ],
};
const lunchMonth: MenuRequirementCalendarMonth = {
  ...month,
  weeks: month.weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => ({
      ...day,
      expected_requirements: 1,
      generated_requirements: 0,
      missing_requirements: 1,
      status: 'missing',
    })),
  })),
};
const calendars: MealCalendarStatus[] = [
  { mealType: 'breakfast', months: [month], state: 'ready' },
  { mealType: 'lunch', months: [lunchMonth], state: 'ready' },
];

describe('RequirementMealStatus', () => {
  it('names the missing meal on month and week cards even when no lunch was generated', () => {
    const { rerender } = render(<RequirementMealStatus calendars={calendars} monthNumber={10} />);
    expect(screen.getByText('Сніданок: готово')).toBeInTheDocument();
    expect(screen.getByText('Обід: не сформовано за 5 дн.')).toBeInTheDocument();
    rerender(<RequirementMealStatus calendars={calendars} weekFrom="2026-10-05" />);
    expect(screen.getByText('Обід: не сформовано за 5 дн.')).toBeInTheDocument();
  });

  it('shows the missing meal and requirement counts on the day card', () => {
    render(<RequirementMealStatus calendars={calendars} serviceDate="2026-10-05" />);
    expect(screen.getByText('Сніданок: готово')).toBeInTheDocument();
    expect(screen.getByText('Обід: не сформовано (0 із 1)')).toBeInTheDocument();
  });

  it('does not show placeholder data as current meal status', () => {
    render(
      <RequirementMealStatus calendars={[{ ...calendars[0], state: 'pending' }]} monthNumber={10} />
    );
    expect(screen.getByText('Сніданок: уточнюємо…')).toBeInTheDocument();
    expect(screen.queryByText('Сніданок: готово')).not.toBeInTheDocument();
  });

  it('distinguishes stale requirements, explicit no food, and no data', () => {
    const staleMonth = structuredClone(month);
    staleMonth.weeks[0].days[0].stale_requirements = 2;
    const { rerender } = render(
      <RequirementMealStatus
        calendars={[{ mealType: 'breakfast', months: [staleMonth], state: 'ready' }]}
        serviceDate="2026-10-05"
      />
    );
    expect(screen.getByText('Сніданок: потрібно оновити')).toBeInTheDocument();
    const noFood = structuredClone(month);
    noFood.weeks[0].days[0].not_served = true;
    rerender(
      <RequirementMealStatus
        calendars={[{ mealType: 'breakfast', months: [noFood], state: 'ready' }]}
        serviceDate="2026-10-05"
      />
    );
    expect(screen.getByText('Сніданок: не харчувалися')).toBeInTheDocument();
    rerender(<RequirementMealStatus calendars={calendars} monthNumber={11} />);
    expect(screen.getByText('Обід: немає даних')).toBeInTheDocument();
  });

  it('excludes days outside the selected calendar month', () => {
    const september = { ...month, month: 9, date_from: '2026-09-01', date_to: '2026-09-30' };
    render(
      <RequirementMealStatus
        calendars={[{ mealType: 'lunch', months: [september, lunchMonth], state: 'ready' }]}
        monthNumber={9}
      />
    );
    expect(screen.getByText('Обід: немає даних')).toBeInTheDocument();
  });
});
