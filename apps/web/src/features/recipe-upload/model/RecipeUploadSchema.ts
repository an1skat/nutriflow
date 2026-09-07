import { z } from 'zod';

const decimalString = z
  .string()
  .trim()
  .min(1, 'Введіть значення')
  .regex(/^-?\d+([.,]\d+)?$/, 'Очікуємо десяткове число')
  .transform((value) => value.replace(',', '.'))
  .refine((value) => Number(value) >= 0, 'Значення має бути ≥ 0');

// Optional decimal: empty string allowed; converted to null at submit time.
const optionalDecimalString = z
  .string()
  .trim()
  .regex(/^-?\d+([.,]\d+)?$/, 'Очікуємо десяткове число')
  .transform((value) => value.replace(',', '.'))
  .or(z.literal(''));

const allergenFormSchema = z.object({
  code: z.string().trim().min(1, 'Введіть код').max(80, 'Код надто довгий'),
  name: z.string().trim().min(1, 'Введіть назву').max(200, 'Назва надто довга'),
});

const portionFormSchema = z.object({
  tempId: z.string().min(1),
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
});

const ingredientFormSchema = z.object({
  tempId: z.string().min(1),
  ingredient_name_snapshot: z
    .string()
    .trim()
    .min(1, 'Введіть назву інгредієнта')
    .max(200, 'Назва надто довга'),
  group_key: z.string().trim().max(80).or(z.literal('')),
  alternative_label: z.string().trim().max(120).or(z.literal('')),
  notes: z.string().trim().max(1000).or(z.literal('')),
  // Map portionTempId -> { gross, net } for this ingredient.
  amounts: z.record(
    z.string(),
    z.object({
      gross: decimalString,
      net: decimalString,
    })
  ),
});

export const recipeUploadSchema = z
  .object({
    card_number: z.string().trim().min(1, 'Введіть номер карти').max(80, 'Номер надто довгий'),
    name: z.string().trim().min(1, 'Введіть назву страви').max(200, 'Назва надто довга'),
    category: z.string().trim().max(120).or(z.literal('')),
    source: z.string().trim().max(200).or(z.literal('')),
    technology_text: z.string().trim().max(5000).or(z.literal('')),
    selected_allergen_ids: z.array(z.string()),
    allergens: z.array(allergenFormSchema),
    portions: z.array(portionFormSchema).min(1, 'Додайте хоча б одну порцію'),
    ingredients: z.array(ingredientFormSchema).min(1, 'Додайте хоча б один інгредієнт'),
  })
  .superRefine((data, ctx) => {
    // Every ingredient must have an amount row for every portion.
    for (const ingredient of data.ingredients) {
      for (const portion of data.portions) {
        const amount = ingredient.amounts[portion.tempId];
        if (!amount) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['ingredients', 'amounts', portion.tempId],
            message: `Вкажіть брутто/нетто для порції ${portion.portion_grams} г`,
          });
        }
      }
    }
    // Alternative groups must have a label on every member.
    const grouped: Record<string, number> = {};
    for (const ingredient of data.ingredients) {
      if (ingredient.group_key) {
        grouped[ingredient.group_key] = (grouped[ingredient.group_key] ?? 0) + 1;
      }
    }
    for (const ingredient of data.ingredients) {
      if (
        ingredient.group_key &&
        grouped[ingredient.group_key] > 1 &&
        !ingredient.alternative_label
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ingredients', 'alternative_label'],
          message: 'Для альтернативи вкажіть варіант (напр. до 01.01)',
        });
      }
    }
  });

export type RecipeUploadFormValues = z.infer<typeof recipeUploadSchema>;
export type AllergenFormValues = z.infer<typeof allergenFormSchema>;
export type PortionFormValues = z.infer<typeof portionFormSchema>;
export type IngredientFormValues = z.infer<typeof ingredientFormSchema>;

// Helpers to convert empty strings to null at submit time.
export function orNull(value: string): string | null {
  return value.trim().length > 0 ? value.trim() : null;
}

export function orZero(value: string): string {
  return value.trim().length > 0 ? value.trim() : '0';
}
