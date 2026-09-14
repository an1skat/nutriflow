import { describe, expect, it } from 'vitest';

import { communityListSchema, communitySchema } from './Community';

const community = {
  id: 'community-id',
  code: 'obukhivska',
  name: 'Обухівська громада',
  admin_owner_id: 'admin-id',
  admin_username: 'admin',
  school_count: 2,
  created_at: '2026-09-14T10:00:00Z',
  updated_at: '2026-09-14T10:00:00Z',
};

describe('community schemas', () => {
  it('parses community responses', () => {
    expect(communitySchema.parse(community)).toEqual(community);
    expect(
      communityListSchema.parse({
        items: [community],
        total: 1,
        offset: 0,
        limit: 20,
      }).items
    ).toEqual([community]);
  });

  it('rejects invalid community codes', () => {
    expect(() => communitySchema.parse({ ...community, code: 'Обухівська' })).toThrow();
  });
});
