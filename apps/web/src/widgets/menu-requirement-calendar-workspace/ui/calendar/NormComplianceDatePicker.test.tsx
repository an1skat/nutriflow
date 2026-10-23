import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { MenuRequirementCalendarMonth } from '@/entities/menu-requirement/model/MenuRequirement';

import { formatFullDay } from './CalendarFormatting';
import { NormComplianceDatePicker } from './NormComplianceDatePicker';
import type { MealCalendarStatus } from './RequirementMealStatus';

const dates = Array.from({ length: 31 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`);
const month = {
  date_from: dates[0],
  date_to: dates[30],
  month: 7,
  weeks: [
    {
      days: dates.map((service_date) => ({
        service_date,
        expected_requirements: 1,
        generated_requirements: 1,
        missing_requirements: 0,
        stale_requirements: 0,
        not_served: service_date === '2026-07-07',
      })),
    },
  ],
} as MenuRequirementCalendarMonth;
function setup(
  props: { month?: MenuRequirementCalendarMonth; mealCalendars?: MealCalendarStatus[] } = {}
) {
  const testMonth = props.month ?? month;
  const mealCalendars: MealCalendarStatus[] = props.mealCalendars ?? [
    { mealType: 'breakfast', state: 'ready', months: [testMonth] },
    { mealType: 'lunch', state: 'ready', months: [testMonth] },
  ];
  render(
    <NormComplianceDatePicker
      month={testMonth}
      mealCalendars={mealCalendars}
      reportHref="/norm-compliance?school_id=s1&meal_type=lunch"
      {...props}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Сформувати дотримання норм' }));
  const grid = screen.getByLabelText('Вибір днів дотримання норм');
  const day = (n: number) =>
    within(grid).getByRole('button', {
      name: new RegExp(formatFullDay(`2026-07-${String(n).padStart(2, '0')}`)),
    });
  return { day };
}

describe('NormComplianceDatePicker', () => {
  it('selects noncontiguous days, blocks invalid counts and transfers exact dates and filters', () => {
    const { day } = setup();
    expect(screen.getByRole('button', { name: 'Сформувати звіт' })).toBeDisabled();
    [1, 3, 6, 8].forEach((n) => fireEvent.click(day(n)));
    expect(screen.getByText(/Кількість днів має бути кратною 5/)).toBeInTheDocument();
    fireEvent.click(day(10));
    const href = screen.getByRole('link', { name: 'Сформувати звіт' }).getAttribute('href')!;
    const params = new URL(href, 'http://localhost').searchParams;
    expect(params.get('dates')).toBe('2026-07-01,2026-07-03,2026-07-06,2026-07-08,2026-07-10');
    expect(params.get('date_from')).toBe('2026-07-01');
    expect(params.get('date_to')).toBe('2026-07-10');
    expect(params.get('meal_type')).toBe('lunch');
    fireEvent.click(day(6));
    expect(day(6)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Сформувати звіт' })).toBeDisabled();
  });

  it('blocks weekends and explicitly labels not-served days, including while painting', () => {
    const { day } = setup();
    expect(day(4)).toBeDisabled();
    expect(day(7)).toBeDisabled();
    expect(day(7)).toHaveTextContent('Не харчувалися');
    expect(day(4)).toHaveTextContent('Вихідний');
    fireEvent.pointerDown(day(6), { button: 0, buttons: 1, pointerType: 'mouse' });
    fireEvent.pointerEnter(day(7), { buttons: 1 });
    expect(day(7)).toHaveAttribute('aria-pressed', 'false');
  });

  it('paints and removes days with the left mouse button', () => {
    const { day } = setup();
    fireEvent.pointerDown(day(1), { button: 0, buttons: 1, pointerType: 'mouse' });
    fireEvent.pointerEnter(day(2), { buttons: 1 });
    fireEvent.pointerEnter(day(3), { buttons: 1 });
    fireEvent.click(day(3));
    [1, 2, 3].forEach((n) => expect(day(n)).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.pointerDown(day(2), { button: 0, buttons: 1, pointerType: 'mouse' });
    fireEvent.pointerEnter(day(3), { buttons: 1 });
    fireEvent.click(day(3));
    expect(day(1)).toHaveAttribute('aria-pressed', 'true');
    [2, 3].forEach((n) => expect(day(n)).toHaveAttribute('aria-pressed', 'false'));
  });

  it('shows x2 and x3 multipliers and resets selection', () => {
    const { day } = setup();
    const available = [1, 2, 3, 6, 8, 9, 10, 13, 14, 15, 16, 17, 20, 21, 22];
    available.slice(0, 10).forEach((n) => fireEvent.click(day(n)));
    expect(screen.getByText(/Норми ×2/)).toBeInTheDocument();
    available.slice(10).forEach((n) => fireEvent.click(day(n)));
    expect(screen.getByText(/Норми ×3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Скинути вибір' }));
    expect(screen.getByText('Обрано днів: 0')).toBeInTheDocument();
  });

  it('requires ready menu requirements for selected dates', () => {
    const incomplete = structuredClone(month);
    incomplete.weeks[0].days[0].missing_requirements = 1;
    const { day } = setup({ month: incomplete });
    [1, 2, 3, 6, 8].forEach((n) => fireEvent.click(day(n)));
    expect(screen.getByRole('button', { name: 'Сформувати звіт' })).toBeDisabled();
    expect(screen.getByText(/01 лип.*Обід: немає меню-вимоги/)).toBeInTheDocument();
  });
});

it('fills the October calendar with September days and exports a cross-month week', () => {
  const monthDates = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
  const october = {
    ...month,
    month: 10,
    date_from: '2026-10-01',
    date_to: '2026-10-31',
    weeks: [
      {
        ...month.weeks[0],
        days: monthDates.map((service_date) => ({ ...month.weeks[0].days[0], service_date })),
      },
    ],
  };
  setup({ month: october });
  const grid = screen.getByLabelText('Вибір днів дотримання норм');
  expect(within(grid).getAllByRole('button')).toHaveLength(35);
  monthDates.forEach((date) =>
    fireEvent.click(within(grid).getByRole('button', { name: new RegExp(formatFullDay(date)) }))
  );
  const params = new URL(
    screen.getByRole('link', { name: 'Сформувати звіт' }).getAttribute('href')!,
    'http://localhost'
  ).searchParams;
  expect(params.get('dates')).toBe(monthDates.join(','));
});

it('uses the meal-specific not-served status instead of the combined calendar', () => {
  const breakfast = structuredClone(month);
  const lunch = structuredClone(month);
  lunch.weeks[0].days[6].not_served = false;
  const { day } = setup({
    month: lunch,
    mealCalendars: [
      { mealType: 'breakfast', state: 'ready', months: [breakfast] },
      { mealType: 'lunch', state: 'ready', months: [lunch] },
    ],
  });
  fireEvent.click(day(7));
  expect(day(7)).toHaveAttribute('aria-pressed', 'true');
  const mealToggle = screen.getByRole('group', { name: 'Прийом їжі для дотримання норм' });
  fireEvent.click(within(mealToggle).getByRole('button', { name: 'Сніданок' }));
  expect(day(7)).toBeDisabled();
  expect(day(7)).toHaveTextContent('Не харчувалися');
  fireEvent.click(day(7));
  expect(day(7)).toHaveAttribute('aria-pressed', 'false');
  [1, 2, 3, 6, 8].forEach((n) => fireEvent.click(day(n)));
  const params = new URL(
    screen.getByRole('link', { name: 'Сформувати звіт' }).getAttribute('href')!,
    'http://localhost'
  ).searchParams;
  expect(params.get('meal_type')).toBe('breakfast');
  expect(params.get('dates')).not.toContain('2026-07-07');
});

it('names each missing or stale date and meal even before five days are selected', () => {
  const incomplete = structuredClone(month);
  incomplete.weeks[0].days[0].missing_requirements = 1;
  incomplete.weeks[0].days[1].stale_requirements = 1;
  const { day } = setup({ month: incomplete });
  fireEvent.click(day(1));
  fireEvent.click(day(2));
  expect(screen.getByText(/01 лип.*Обід: немає меню-вимоги/)).toBeInTheDocument();
  expect(screen.getByText(/02 лип.*Обід: потрібно оновити меню-вимогу/)).toBeInTheDocument();
  expect(screen.getByText(/Кількість днів має бути кратною 5/)).toBeInTheDocument();
});

it('disables selection while meal statuses are loading or failed', () => {
  const { day } = setup({
    mealCalendars: [
      { mealType: 'lunch', state: 'pending' },
      { mealType: 'breakfast', state: 'error' },
    ],
  });
  expect(day(1)).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Обід: завантажуємо статуси днів');
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Прийом їжі для дотримання норм' })).getByRole(
      'button',
      { name: 'Сніданок' }
    )
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Сніданок: не вдалося завантажити статуси днів'
  );
  expect(day(1)).toBeDisabled();
});
