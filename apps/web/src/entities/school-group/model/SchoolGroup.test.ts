import { describe, expect, it } from 'vitest';

import { ageGroupLabels, schoolGroupListSchema, schoolGroupSchema } from './SchoolGroup';

const group = {
  id: 'group-id',
  school_id: 'school-id',
  name: '6-11 років',
  age_group: '6-11',
  is_active: true,
  created_at: '2026-07-03T08:00:00Z',
  updated_at: '2026-07-03T08:00:00Z',
};

describe('school group schemas', () => {
  it('parses a school group response', () => {
    expect(schoolGroupSchema.parse(group)).toEqual(group);
  });

  it('parses a paginated school group response', () => {
    expect(
      schoolGroupListSchema.parse({
        items: [group],
        total: 1,
        offset: 0,
        limit: 20,
      })
    ).toMatchObject({
      total: 1,
      items: [group],
    });
  });

  it('has labels for every supported age group', () => {
    expect(ageGroupLabels).toEqual({
      '6-11': '6-11 років',
      '11-14': '11-14 років',
      '14-18': '14-18 років',
    });
  });

  it('rejects invalid group payloads', () => {
    expect(() =>
      schoolGroupSchema.parse({
        ...group,
        age_group: '5-6',
      })
    ).toThrow();
  });
});
