import { describe, expect, it } from 'vitest';

import { editSchoolFormSchema, schoolFormSchema } from './SchoolFormSchema';

describe('school form schemas', () => {
  it('trims the school name', () => {
    expect(
      schoolFormSchema.parse({
        name: '  Ліцей №1  ',
        community: 'obukhivska',
      })
    ).toEqual({
      name: 'Ліцей №1',
      community: 'obukhivska',
    });
  });

  it('requires a valid name', () => {
    expect(
      schoolFormSchema.safeParse({
        name: '',
        community: '',
      }).success
    ).toBe(false);
  });

  it('keeps the active flag in edit mode', () => {
    expect(
      editSchoolFormSchema.parse({
        name: 'Ліцей №1',
        community: '',
        is_active: false,
      }).is_active
    ).toBe(false);
  });

  it('accepts an explicitly empty community selection', () => {
    expect(
      schoolFormSchema.parse({
        name: 'Ліцей №1',
        community: '',
      }).community
    ).toBe('');
  });

  it('rejects an unknown community', () => {
    expect(
      schoolFormSchema.safeParse({
        name: 'Ліцей №1',
        community: 'unknown',
      }).success
    ).toBe(false);
  });
});
