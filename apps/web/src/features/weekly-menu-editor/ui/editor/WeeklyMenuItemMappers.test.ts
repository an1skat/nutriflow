import { describe, expect, it } from 'vitest';

import type { PortionVariant } from '@/entities/recipe/model/Recipe';

import { resolvePortionVariantByYield } from './WeeklyMenuItemMappers';

function variant(output: string): PortionVariant {
  return {
    id: `portion-${output}`,
    age_group: null,
    portion_grams: output,
    output_grams: output,
    nutrition: {
      kcal: '100',
      proteins: '5',
      fats: '3',
      carbs: '15',
    },
    normative_contributions: [],
  };
}

describe('resolvePortionVariantByYield', () => {
  const variants = [variant('50'), variant('75'), variant('120')];

  it('keeps an exact portion without scaling', () => {
    const resolution = resolvePortionVariantByYield(variants, '75', null);

    expect(resolution).toMatchObject({
      factor: 1,
      isScaled: false,
      variant: { output_grams: '75' },
    });
  });

  it('uses the nearest output and prefers the larger output on a tie', () => {
    expect(resolvePortionVariantByYield(variants, '100', null)).toMatchObject({
      isScaled: true,
      variant: { output_grams: '120' },
    });
    expect(resolvePortionVariantByYield(variants, '225', null)).toMatchObject({
      factor: 1.875,
      isScaled: true,
      variant: { output_grams: '120' },
    });
    expect(
      resolvePortionVariantByYield([variant('80'), variant('120')], '100', null)
    ).toMatchObject({
      isScaled: true,
      variant: { output_grams: '120' },
    });
  });
});
