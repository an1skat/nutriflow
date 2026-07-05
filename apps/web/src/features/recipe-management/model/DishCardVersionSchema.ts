import { z } from "zod";

const decimalString = z
  .string()
  .trim()
  .min(1, "Введіть значення")
  .regex(/^-?\d+(\.\d+)?$/, "Очікуємо десяткове число")
  .refine((value) => Number(value) >= 0, "Значення має бути ≥ 0");

const optionalDecimalString = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, "Очікуємо десяткове число")
  .or(z.literal(""));

const portionFormSchema = z.object({
  tempId: z.string().min(1),
  id: z.string().optional(),
  portion_grams: z
    .string()
    .trim()
    .min(1, "Введіть масу порції")
    .regex(/^-?\d+(\.\d+)?$/, "Очікуємо число")
    .refine((value) => Number(value) > 0, "Маса порції має бути > 0"),
  kcal: optionalDecimalString,
  proteins: optionalDecimalString,
  fats: optionalDecimalString,
  carbs: optionalDecimalString,
});

const ingredientFormSchema = z.object({
  tempId: z.string().min(1),
  ingredient_id: z.string().min(1).nullable(),
  ingredient_name_snapshot: z
    .string()
    .trim()
    .min(1, "Введіть назву інгредієнта")
    .max(200, "Назва надто довга"),
  group_key: z.string().trim().max(80).or(z.literal("")),
  alternative_label: z.string().trim().max(120).or(z.literal("")),
  notes: z.string().trim().max(1000).or(z.literal("")),
  amounts: z.record(
    z.string(),
    z.object({ gross: decimalString, net: decimalString }),
  ),
});

export const dishCardVersionFormSchema = z
  .object({
    technology_text: z.string().trim().max(5000).or(z.literal("")),
    allergen_ids: z.array(z.string()),
    portions: z.array(portionFormSchema).min(1, "Додайте хоча б одну порцію"),
    ingredients: z
      .array(ingredientFormSchema)
      .min(1, "Додайте хоча б один інгредієнт"),
  })
  .superRefine((data, ctx) => {
    for (const ingredient of data.ingredients) {
      for (const portion of data.portions) {
        if (!ingredient.amounts[portion.tempId]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["ingredients", "amounts", portion.tempId],
            message: `Вкажіть брутто/нетто для порції ${portion.portion_grams} г`,
          });
        }
      }
    }
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
          path: ["ingredients", "alternative_label"],
          message: "Для альтернативи вкажіть мітку",
        });
      }
    }
  });

export type DishCardVersionFormValues = z.infer<typeof dishCardVersionFormSchema>;
export type VersionPortionFormValues = z.infer<typeof portionFormSchema>;
export type VersionIngredientFormValues = z.infer<typeof ingredientFormSchema>;

export function orNull(value: string): string | null {
  return value.trim().length > 0 ? value.trim() : null;
}
