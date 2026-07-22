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
