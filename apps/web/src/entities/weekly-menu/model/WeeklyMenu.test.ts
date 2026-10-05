import { afterEach, expect, it, vi } from 'vitest';

import { getDefaultWeeklyMenuId } from './WeeklyMenu';

it('opens the current week before a more recently assigned future week', () => {
  const menus = [
    { id: 'future', starts_on: '2026-10-12', ends_on: '2026-10-16' },
    { id: 'current', starts_on: '2026-10-05', ends_on: '2026-10-09' },
    { id: 'past', starts_on: '2026-09-28', ends_on: '2026-10-02' },
  ];
  expect(getDefaultWeeklyMenuId(menus, '2026-10-05')).toBe('current');
  expect(getDefaultWeeklyMenuId(menus, '2026-10-09')).toBe('current');
  expect(getDefaultWeeklyMenuId(menus, '2026-10-19')).toBeUndefined();
  expect(getDefaultWeeklyMenuId([], '2026-10-05')).toBeUndefined();
});

it.each(['2026-10-05', '2026-10-09', '2026-10-10', '2026-10-11'])(
  'selects the Monday of the calendar week on %s',
  (today) => {
    expect(
      getDefaultWeeklyMenuId(
        [
          { id: 'past', starts_on: '2026-09-28', ends_on: '2026-10-02' },
          { id: 'next', starts_on: '2026-10-12', ends_on: '2026-10-16' },
          { id: 'current', starts_on: '2026-10-05', ends_on: '2026-10-09' },
        ],
        today
      )
    ).toBe('current');
  }
);

it.each([
  ['2026-10-01', '2026-09-28'],
  ['2027-01-01', '2026-12-28'],
  ['2027-01-03', '2026-12-28'],
  ['2027-01-04', '2027-01-04'],
  ['2026-10-12', '2026-10-12'],
])('handles calendar boundaries on %s', (today, monday) => {
  expect(getDefaultWeeklyMenuId([{ id: 'week', starts_on: monday, ends_on: null }], today)).toBe(
    'week'
  );
});

afterEach(() => vi.useRealTimers());

it('uses Kyiv Monday while UTC is still Sunday', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-11T21:30:00Z'));
  expect(
    getDefaultWeeklyMenuId([
      { id: 'old', starts_on: '2026-10-05', ends_on: '2026-10-09' },
      { id: 'new', starts_on: '2026-10-12', ends_on: '2026-10-16' },
    ])
  ).toBe('new');
});
