import { describe, expect, it } from 'vitest';

import {
  generateMenuRequirementsResponseSchema,
  menuRequirementCalendarSchema,
  menuRequirementCommunityListSchema,
  menuRequirementReportGranularitySchema,
  menuRequirementReportSchema,
  menuRequirementSchema,
} from './MenuRequirement';

const requirement = {
  id: 'requirement-1',
  school_id: 'school-1',
  school_name: 'Ліцей №1',
  school_admin_owner_id: 'admin-1',
  school_admin_owner_username: 'admin.one',
  weekly_menu_id: 'menu-1',
  source_menu_id: 'source-1',
  menu_title: 'Меню на тиждень',
  meal_type: 'lunch',
  weekday: 'monday',
  service_date: '2026-07-06',
  school_group_id: 'group-1',
  school_group_name: '1-А',
  age_group: '6-11',
  dishes: [
    {
      menu_item_id: 'item-1',
      position: 1,
      kind: 'dish_card',
      name: 'Суп',
      recipe_card_number: '12',
      dish_card_id: 'dish-1',
      dish_card_version_id: 'version-1',
      portion_variant_id: 'portion-1',
      product_ingredient_id: null,
      yield_amount: '200',
      children_count: 3,
    },
  ],
  ingredient_rows: [
    {
      key: 'ingredient:carrot',
      ingredient_id: 'carrot',
      ingredient_name: 'Морква',
      cells: [
        {
          menu_item_id: 'item-1',
          net_per_person_g: '20.25',
          gross_per_person_g: '25',
        },
      ],
      per_person_total_g: '20.25',
      issue_total_raw_g: '60.75',
      issue_total_rounded_g: 61,
      gross_per_person_total_g: '25',
      gross_issue_total_raw_g: '75',
      gross_issue_total_rounded_g: 75,
    },
  ],
  source_day_hash: 'a'.repeat(64),
  revision: 1,
  generated_by: 'user-1',
  generated_at: '2026-07-06T12:00:00Z',
  created_at: '2026-07-06T12:00:00Z',
  updated_at: '2026-07-06T12:00:00Z',
} as const;

describe('menu requirement contract', () => {
  it('accepts an arbitrary calendar range report', () => {
    expect(menuRequirementReportGranularitySchema.parse('range')).toBe('range');
  });

  it('parses decimal values as exact strings', () => {
    const parsed = menuRequirementSchema.parse(requirement);

    expect(parsed.ingredient_rows[0].cells[0].net_per_person_g).toBe('20.25');
    expect(parsed.ingredient_rows[0].cells[0].gross_per_person_g).toBe('25');
    expect(parsed.ingredient_rows[0].issue_total_raw_g).toBe('60.75');
    expect(parsed.ingredient_rows[0].issue_total_rounded_g).toBe(61);
    expect(parsed.ingredient_rows[0].gross_issue_total_raw_g).toBe('75');
  });

  it('requires generated responses to contain at least one group', () => {
    expect(() => generateMenuRequirementsResponseSchema.parse({ items: [] })).toThrow();
    expect(
      generateMenuRequirementsResponseSchema.parse({ items: [requirement] }).items
    ).toHaveLength(1);
  });

  it('parses calendar responses with Monday-to-Friday workweeks', () => {
    const parsed = menuRequirementCalendarSchema.parse({
      school_id: 'school-1',
      school_name: 'Ліцей №1',
      year: 2026,
      months: Array.from({ length: 12 }, (_item, index) => ({
        month: index + 1,
        date_from: `2026-${String(index + 1).padStart(2, '0')}-01`,
        date_to: `2026-${String(index + 1).padStart(2, '0')}-28`,
        total_days: 28,
        working_days: 1,
        generated_days: index === 6 ? 1 : 0,
        missing_days: 0,
        stale_days: 0,
        status: 'complete',
        weeks: [
          {
            week_index: 1,
            date_from: index === 6 ? '2026-06-29' : `2026-${String(index + 1).padStart(2, '0')}-01`,
            date_to: index === 6 ? '2026-07-03' : `2026-${String(index + 1).padStart(2, '0')}-05`,
            generated_days: 0,
            missing_days: 0,
            stale_days: 0,
            status: 'complete',
            days: Array.from({ length: index === 6 ? 6 : 5 }, (_day, dayIndex) => ({
              service_date: `2026-07-${String(dayIndex + 6).padStart(2, '0')}`,
              expected_requirements: 3,
              generated_requirements: dayIndex === 3 ? 2 : 0,
              missing_requirements: dayIndex === 3 ? 1 : 3,
              stale_requirements: 0,
              status: 'missing',
            })),
          },
          {
            week_index: 5,
            date_from: `2026-${String(index + 1).padStart(2, '0')}-27`,
            date_to: `2026-${String(index + 1).padStart(2, '0')}-28`,
            generated_days: index === 6 ? 1 : 0,
            missing_days: 0,
            stale_days: 0,
            status: 'complete',
            days: Array.from({ length: 5 }, (_day, dayIndex) => ({
              service_date: `2026-07-${String(dayIndex + 27).padStart(2, '0')}`,
              expected_requirements: 0,
              generated_requirements: 0,
              missing_requirements: 0,
              stale_requirements: 0,
              status: 'complete',
            })),
          },
        ],
      })),
    });

    expect(parsed.months[6].weeks[0]).toMatchObject({
      date_from: '2026-06-29',
      date_to: '2026-07-03',
    });
    expect(parsed.months[6].weeks[0].days[3].generated_requirements).toBe(2);
    expect(parsed.months[6].weeks[0].days).toHaveLength(6);
  });

  it('parses report responses with cell breakdown items', () => {
    const parsed = menuRequirementReportSchema.parse({
      school_id: 'school-1',
      school_name: 'Ліцей №1',
      date_from: '2026-07-01',
      date_to: '2026-07-31',
      granularity: 'month',
      meal_type: 'lunch',
      school_group_id: null,
      status: 'mixed',
      missing_dates: ['2026-07-08'],
      stale_dates: ['2026-07-09'],
      groups: [
        {
          group_key: 'school-group:group-1',
          school_group_id: 'group-1',
          school_group_name: '6-11',
          age_group: '6-11',
          dishes: [
            {
              aggregate_key: 'dish:soup',
              name: 'Овочевий суп',
              kind: 'dish_card',
              recipe_card_number: '12',
              yield_amount: '200',
              key_reliability: 'stable',
              children_count_total: 123,
            },
          ],
          ingredient_rows: [
            {
              key: 'ingredient:carrot',
              ingredient_id: 'carrot',
              ingredient_name: 'Морква',
              cells: [
                {
                  dish_key: 'dish:soup',
                  net_per_person_g: '40.5',
                  gross_per_person_g: '50',
                  issue_total_raw_g: '4500.25',
                  issue_total_rounded_g: 4504,
                  gross_issue_total_raw_g: '5625',
                  gross_issue_total_rounded_g: 5625,
                  breakdown: [
                    {
                      requirement_id: 'requirement-1',
                      service_date: '2026-07-06',
                      school_id: 'school-1',
                      school_name: 'Ліцей №1',
                      school_group_id: 'group-1',
                      school_group_name: '6-11',
                      menu_title: 'Меню на тиждень',
                      net_per_person_g: '20.25',
                      gross_per_person_g: '25',
                      children_count: 30,
                      issue_total_raw_g: '607.5',
                      issue_total_rounded_g: 608,
                      gross_issue_total_raw_g: '750',
                      gross_issue_total_rounded_g: 750,
                      status: 'complete',
                    },
                    {
                      requirement_id: null,
                      service_date: '2026-07-08',
                      school_id: 'school-1',
                      school_name: 'Ліцей №1',
                      school_group_id: 'group-1',
                      school_group_name: '6-11',
                      menu_title: 'Меню на тиждень',
                      net_per_person_g: null,
                      gross_per_person_g: null,
                      children_count: null,
                      issue_total_raw_g: null,
                      issue_total_rounded_g: null,
                      gross_issue_total_raw_g: null,
                      gross_issue_total_rounded_g: null,
                      status: 'missing',
                    },
                  ],
                },
              ],
              per_person_total_g: '40.5',
              issue_total_raw_g: '4500.25',
              issue_total_rounded_g: 4504,
              gross_per_person_total_g: '50',
              gross_issue_total_raw_g: '5625',
              gross_issue_total_rounded_g: 5625,
            },
          ],
        },
      ],
    });

    expect(parsed.groups[0].ingredient_rows[0].cells[0].breakdown[1].status).toBe('missing');
    expect(parsed.groups[0].ingredient_rows[0].cells[0].gross_per_person_g).toBe('50');
  });

  it('parses the available community scope', () => {
    expect(
      menuRequirementCommunityListSchema.parse([
        {
          community: 'obukhivska',
          community_name: 'Обухівська громада',
          school_count: 2,
        },
      ])
    ).toEqual([
      {
        community: 'obukhivska',
        community_name: 'Обухівська громада',
        school_count: 2,
      },
    ]);
  });

  it('parses community calendar and report responses', () => {
    const months = Array.from({ length: 12 }, (_item, index) => ({
      month: index + 1,
      date_from: `2026-${String(index + 1).padStart(2, '0')}-01`,
      date_to: `2026-${String(index + 1).padStart(2, '0')}-28`,
      total_days: 28,
      working_days: 0,
      generated_days: 0,
      missing_days: 0,
      stale_days: 0,
      status: 'complete',
      weeks: [],
    }));
    const calendar = menuRequirementCalendarSchema.parse({
      community: 'obukhivska',
      community_name: 'Обухівська громада',
      school_count: 2,
      year: 2026,
      months,
    });
    const report = menuRequirementReportSchema.parse({
      community: 'obukhivska',
      community_name: 'Обухівська громада',
      school_count: 2,
      date_from: '2026-07-01',
      date_to: '2026-07-31',
      granularity: 'month',
      meal_type: null,
      status: 'complete',
      missing_dates: [],
      stale_dates: [],
      groups: [],
    });

    expect(calendar).toMatchObject({ community: 'obukhivska', school_count: 2 });
    expect(report).toMatchObject({ community_name: 'Обухівська громада', groups: [] });
  });
});
