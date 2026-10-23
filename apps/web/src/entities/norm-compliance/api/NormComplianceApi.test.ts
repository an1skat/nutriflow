import { describe, expect, it } from 'vitest';

import { buildNormComplianceParams } from './NormComplianceApi';

describe('buildNormComplianceParams', () => {
  it('forms the backend request from active filters', () => {
    expect(
      buildNormComplianceParams({
        school_id: 'school-1',
        date_from: '2026-07-06',
        date_to: '2026-07-10',
        meal_type: 'lunch',
        school_group_id: 'group-1',
        enabled: true,
      })
    ).toEqual({
      school_id: 'school-1',
      date_from: '2026-07-06',
      date_to: '2026-07-10',
      meal_type: 'lunch',
      school_group_id: 'group-1',
    });
  });

  it('omits optional empty filters', () => {
    expect(
      buildNormComplianceParams({
        school_id: 'school-1',
        date_from: '2026-07-06',
        date_to: '2026-07-10',
      })
    ).toEqual({
      school_id: 'school-1',
      date_from: '2026-07-06',
      date_to: '2026-07-10',
      meal_type: undefined,
      school_group_id: undefined,
    });
  });
});

it('preserves individual dates for report and export parameters', () => {
  const dates = ['2026-07-01', '2026-07-03', '2026-07-06', '2026-07-08', '2026-07-10'];
  expect(
    buildNormComplianceParams({
      school_id: 'school-1',
      date_from: dates[0],
      date_to: dates[4],
      dates,
    }).dates
  ).toEqual(dates);
});
