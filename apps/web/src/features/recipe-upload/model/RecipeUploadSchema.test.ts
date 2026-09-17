import { zodResolver } from '@hookform/resolvers/zod';
import { describe, expect, it } from 'vitest';

import { orZero, recipeUploadSchema } from './RecipeUploadSchema';

function validRecipe() {
  return {
    card_number: '1.17',
    name: 'Салат',
    category: '',
    source: '',
    technology_text: '',
    selected_allergen_ids: [],
    allergens: [],
    portions: [
      {
        tempId: 'portion-1',
        portion_grams: '120',
        kcal: '0',
        proteins: '0',
        fats: '0',
        carbs: '0',
      },
    ],
    ingredients: [
      {
        tempId: 'ingredient-1',
        ingredient_name_snapshot: 'Морква',
        notes: '',
        amounts: {
          'portion-1': { gross: '10', net: '9' },
        } as Record<string, { gross: string; net: string }>,
      },
    ],
  };
}

function recipeMissingThirdPortionInSecondIngredient() {
  const values = validRecipe();
  values.portions.push(
    {
      tempId: 'portion-2',
      portion_grams: '180',
      kcal: '0',
      proteins: '0',
      fats: '0',
      carbs: '0',
    },
    {
      tempId: 'portion-3',
      portion_grams: '240',
      kcal: '0',
      proteins: '0',
      fats: '0',
      carbs: '0',
    }
  );
  values.ingredients[0].amounts['portion-2'] = { gross: '10', net: '9' };
  values.ingredients[0].amounts['portion-3'] = { gross: '10', net: '9' };
  values.ingredients.push({
    tempId: 'ingredient-2',
    ingredient_name_snapshot: 'Капуста',
    notes: '',
    amounts: {
      'portion-1': { gross: '8', net: '7' },
      'portion-2': { gross: '8', net: '7' },
    },
  });
  return values;
}

describe('recipe upload schema helpers', () => {
  it('maps empty nutrition input to zero', () => {
    expect(orZero('')).toBe('0');
    expect(orZero('   ')).toBe('0');
    expect(orZero(' 1.25 ')).toBe('1.25');
  });

  it('accepts decimal commas and normalizes them for the API', () => {
    const result = recipeUploadSchema.parse({
      card_number: '1.17',
      name: 'Салат',
      category: '',
      source: '',
      technology_text: '',
      selected_allergen_ids: [],
      allergens: [],
      portions: [
        {
          tempId: 'portion-1',
          portion_grams: '120,5',
          kcal: '82,8',
          proteins: '1,18',
          fats: '',
          carbs: '11.03',
        },
      ],
      ingredients: [
        {
          tempId: 'ingredient-1',
          ingredient_name_snapshot: 'Морква',
          notes: '',
          amounts: {
            'portion-1': { gross: '10,5', net: '9,25' },
          },
        },
      ],
    });

    expect(result.portions[0]).toMatchObject({
      portion_grams: '120.5',
      kcal: '82.8',
      proteins: '1.18',
      carbs: '11.03',
    });
    expect(result.ingredients[0].amounts['portion-1']).toEqual({
      gross: '10.5',
      net: '9.25',
    });
  });

  it('points a missing amount row at the second ingredient and third portion', () => {
    const values = recipeMissingThirdPortionInSecondIngredient();

    const result = recipeUploadSchema.safeParse(values);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ['ingredients', 1, 'amounts', 'portion-3'] })
      );
    }
  });

  it('gives react-hook-form the missing amount error under the correct ingredient', async () => {
    const values = recipeMissingThirdPortionInSecondIngredient();

    const result = await zodResolver(recipeUploadSchema)(
      values,
      {},
      {
        criteriaMode: 'firstError',
        fields: {},
        shouldUseNativeValidation: false,
      }
    );
    const errors = result.errors as unknown as {
      ingredients?: Array<{
        amounts?: Record<string, { message?: string }>;
      }>;
    };

    expect(errors.ingredients?.[1]?.amounts?.['portion-3']?.message).toBe(
      'Вкажіть брутто/нетто для порції 240 г'
    );
  });

  it('does not block deprecated alternative metadata', () => {
    const values = validRecipe();
    const result = recipeUploadSchema.safeParse({
      ...values,
      ingredients: [{ ...values.ingredients[0], group_key: 'seasonal', alternative_label: '' }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ingredients[0]).not.toHaveProperty('group_key');
      expect(result.data.ingredients[0]).not.toHaveProperty('alternative_label');
    }
  });

  it.each([
    ['gross', ''],
    ['gross', 'abc'],
    ['net', ''],
    ['net', '-1'],
  ] as const)('rejects %s = %j at the exact amount field', (field, value) => {
    const values = validRecipe();
    values.ingredients[0].amounts['portion-1'][field] = value;

    const result = recipeUploadSchema.safeParse(values);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
        'ingredients',
        0,
        'amounts',
        'portion-1',
        field,
      ]);
    }
  });

  it('rejects invalid decimals and missing card-level fields', () => {
    const values = validRecipe();
    values.card_number = '';
    values.ingredients[0].amounts['portion-1'].gross = '1..5';

    const result = recipeUploadSchema.safeParse(values);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([
          ['card_number'],
          ['ingredients', 0, 'amounts', 'portion-1', 'gross'],
        ])
      );
    }
  });
});
