import { describe, expect, it } from 'vitest';

import { schoolListSchema, schoolSchema } from './School';

const school = {
  id: 'school-id',
  name: 'Ліцей №1',
  community: 'obukhivska',
  admin_owner_id: 'admin-id',
  is_active: true,
  created_at: '2026-07-03T08:00:00Z',
  updated_at: '2026-07-03T08:00:00Z',
};

describe('school schemas', () => {
  it('parses a school response', () => {
    expect(schoolSchema.parse(school)).toEqual(school);
  });

  it('parses a paginated school response', () => {
    expect(
      schoolListSchema.parse({
        items: [school],
        total: 1,
        offset: 0,
        limit: 20,
      })
    ).toMatchObject({
      total: 1,
      items: [school],
    });
  });

  it('rejects an invalid response', () => {
    expect(() =>
      schoolSchema.parse({
        ...school,
        is_active: 'yes',
      })
    ).toThrow();
  });

  it('accepts a school without a community', () => {
    expect(schoolSchema.parse({ ...school, community: null }).community).toBeNull();
  });
});
