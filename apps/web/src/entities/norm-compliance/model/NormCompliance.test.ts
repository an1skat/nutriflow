import { describe, expect, it } from 'vitest';

import {
  complianceStatusClasses,
  complianceStatusLabels,
  normComplianceReportSchema,
} from './NormCompliance';

export const normComplianceFixture = {
  school_id: 'school-1',
  school_name: 'Ліцей №1',
  date_from: '2026-07-06',
  date_to: '2026-07-10',
  status: 'mixed',
  groups: [
    {
      school_group_id: 'group-1',
      school_group_name: '1-А',
      age_group: '6-11',
      status: 'mixed',
      sections: [
        {
          meal_type: 'lunch',
          status: 'mixed',
          expected_dates: ['2026-07-06', '2026-07-07'],
          missing_dates: ['2026-07-07'],
          stale_dates: ['2026-07-06'],
          rows: [
            {
              normative_group_code: 'vegetables',
              normative_group_name: 'Овочі',
              characteristic: 'Різноманітні та сезонні',
              frequency: 'Щодня разом із зеленню',
              source_appendix: '9-1',
              required_portions: '5',
              actual_portions: '3.5',
              required_amount: '500',
              actual_amount: '350.5',
              unit: 'g',
              percent: '70.1',
              deviation: '-149.5',
              status: 'under',
              tolerance: {
                minimum_percent: '90',
                maximum_percent: '110',
                description: '90–110%',
              },
              breakdown: [
                {
                  requirement_id: 'requirement-1',
                  service_date: '2026-07-06',
                  menu_item_id: 'item-1',
                  dish_name: 'Борщ',
                  source_type: 'ingredient',
                  source_id: 'ingredient-1',
                  source_name: 'Капуста',
                  amount: '100.5',
                  unit: 'g',
                  portion_equivalent: '1',
                },
              ],
              unmapped_items: [],
            },
          ],
          unmapped_items: [
            {
              requirement_id: 'requirement-2',
              service_date: '2026-07-07',
              menu_item_id: 'item-2',
              item_name: 'Салат овочевий',
              reason: 'No normative contribution snapshot is available',
            },
          ],
        },
      ],
    },
  ],
} as const;

describe('norm compliance contract', () => {
  it('parses a report and normalizes Decimal values for calculations', () => {
    const parsed = normComplianceReportSchema.parse(normComplianceFixture);

    expect(parsed.groups[0].sections[0].rows[0]).toMatchObject({
      required_amount: 500,
      actual_amount: 350.5,
      deviation: -149.5,
    });
  });

  it('maps statuses to Ukrainian labels and semantic color classes', () => {
    expect(complianceStatusLabels.complete).toBe('В нормі');
    expect(complianceStatusClasses.complete).toContain('emerald');
    expect(complianceStatusLabels.under).toBe('Нижче норми');
    expect(complianceStatusClasses.over).toContain('rose');
    expect(complianceStatusClasses.unmapped).toContain('amber');
  });
});
