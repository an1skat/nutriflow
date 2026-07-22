import { describe, expect, it } from 'vitest';

import type { WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';

import { getMenuDateRangeLabel } from './WeeklyMenuSchoolTable';

describe('getMenuDateRangeLabel', () => {
  it('aligns legacy shifted dates with their named weekdays', () => {
    const menu = {
      days: [
        { weekday: 'monday', date: '2026-07-12' },
        { weekday: 'friday', date: '2026-07-16' },
      ],
    } as WeeklyMenu;

    const label = getMenuDateRangeLabel(menu);

    expect(label).toContain('13');
    expect(label).toContain('17');
    expect(label).not.toContain('12 липня');
  });
});
