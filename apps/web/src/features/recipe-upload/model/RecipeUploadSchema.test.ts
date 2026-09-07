import { describe, expect, it } from 'vitest';

import { orZero, recipeUploadSchema } from './RecipeUploadSchema';

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
          group_key: '',
          alternative_label: '',
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
});
