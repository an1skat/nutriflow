import { describe, expect, it } from 'vitest';

import { editSchoolFormSchema, schoolFormSchema } from './SchoolFormSchema';

describe('school form schemas', () => {
  it('trims the school name', () => {
    expect(
      schoolFormSchema.parse({
        name: '  Ліцей №1  ',
      })
    ).toEqual({
      name: 'Ліцей №1',
    });
  });

  it('requires a valid name', () => {
    expect(
      schoolFormSchema.safeParse({
        name: '',
      }).success
    ).toBe(false);
  });

  it('keeps the active flag in edit mode', () => {
    expect(
      editSchoolFormSchema.parse({
        name: 'Ліцей №1',
        is_active: false,
      }).is_active
    ).toBe(false);
  });
});
