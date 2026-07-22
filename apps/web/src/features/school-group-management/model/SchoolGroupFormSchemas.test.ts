import { describe, expect, it } from 'vitest';

import { editSchoolGroupFormSchema, schoolGroupFormSchema } from './SchoolGroupFormSchemas';

describe('school group form schemas', () => {
  it('trims the group name and accepts standard age groups', () => {
    expect(
      schoolGroupFormSchema.parse({
        name: '  Молодша група  ',
        age_group: '6-11',
      })
    ).toEqual({
      name: 'Молодша група',
      age_group: '6-11',
    });
  });

  it('rejects unsupported age groups', () => {
    expect(
      schoolGroupFormSchema.safeParse({
        name: 'Підготовча група',
        age_group: '5-6',
      }).success
    ).toBe(false);
  });

  it('keeps the active flag in edit mode', () => {
    expect(
      editSchoolGroupFormSchema.parse({
        name: 'Старша група',
        is_active: false,
      }).is_active
    ).toBe(false);
  });
});
