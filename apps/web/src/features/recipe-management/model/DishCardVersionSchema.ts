import { z } from 'zod';

import { normativeContributionSchema } from '@/entities/recipe/model/Recipe';

const decimalString = z
  .string()
  .trim()
  .min(1, 'Введіть значення')
  .regex(/^-?\d+([.,]\d+)?$/, 'Очікуємо десяткове число')
  .transform((value) => value.replace(',', '.'))
  .refine((value) => Number(value) >= 0, 'Значення має бути ≥ 0');

const optionalDecimalString = z
  .string()
  .trim()
  .refine((value) => value === '' || /^-?\d+([.,]\d+)?$/.test(value), 'Очікуємо десяткове число')
  .transform((value) => value.replace(',', '.'))
  .refine((value) => value === '' || Number(value) >= 0, 'Значення має бути ≥ 0');

const portionFormSchema = z.object({
  tempId: z.string().min(1),
  id: z.string().optional(),
  portion_grams: z
    .string()
    .trim()
    .min(1, 'Введіть масу порції')
    .regex(/^-?\d+([.,]\d+)?$/, 'Очікуємо число')
    .transform((value) => value.replace(',', '.'))
    .refine((value) => Number(value) > 0, 'Маса порції має бути > 0'),
  kcal: optionalDecimalString,
  proteins: optionalDecimalString,
  fats: optionalDecimalString,
  carbs: optionalDecimalString,
  normative_contributions: z.array(normativeContributionSchema),
});

const ingredientFormSchema = z.object({
  tempId: z.string().min(1),
  ingredient_id: z.string().min(1).nullable(),
  ingredient_name_snapshot: z
    .string()
    .trim()
    .min(1, 'Введіть назву інгредієнта')
    .max(200, 'Назва надто довга'),
  notes: z.string().trim().max(1000).or(z.literal('')),
  amounts: z.record(z.string(), z.object({ gross: decimalString, net: decimalString })),
});

export const dishCardVersionFormSchema = z
  .object({
    technology_text: z.string().trim().max(5000).or(z.literal('')),
    allergen_ids: z.array(z.string()),
    portions: z.array(portionFormSchema).min(1, 'Додайте хоча б одну порцію'),
    ingredients: z.array(ingredientFormSchema).min(1, 'Додайте хоча б один інгредієнт'),
  })
  .superRefine((data, ctx) => {
    data.ingredients.forEach((ingredient, ingredientIndex) => {
      for (const portion of data.portions) {
        if (!ingredient.amounts[portion.tempId]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['ingredients', ingredientIndex, 'amounts', portion.tempId],
            message: `Вкажіть брутто/нетто для порції ${portion.portion_grams} г`,
          });
        }
      }
    });
  });

export type DishCardVersionFormValues = z.infer<typeof dishCardVersionFormSchema>;
export type VersionPortionFormValues = z.infer<typeof portionFormSchema>;
export type VersionIngredientFormValues = z.infer<typeof ingredientFormSchema>;

export function orNull(value: string): string | null {
  return value.trim().length > 0 ? value.trim() : null;
}

export function orZero(value: string): string {
  return value.trim().length > 0 ? value.trim() : '0';
}
