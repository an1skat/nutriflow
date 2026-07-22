import { z } from 'zod';

export const ingredientFormSchema = z.object({
  name: z.string().trim().min(1, 'Введіть назву інгредієнта').max(200, 'Назва надто довга'),
  unit: z.string().trim().min(1, 'Введіть одиницю').max(20, 'Одиниця надто довга'),
  aliases: z.string().trim().max(500).or(z.literal('')),
});

export const ingredientEditFormSchema = ingredientFormSchema.extend({
  is_active: z.boolean(),
});

export const allergenFormSchema = z.object({
  code: z.string().trim().min(1, 'Введіть код').max(80, 'Код надто довгий'),
  name: z.string().trim().min(1, 'Введіть назву').max(200, 'Назва надто довга'),
  description: z.string().trim().max(1000).or(z.literal('')),
});

export type IngredientFormValues = z.infer<typeof ingredientFormSchema>;
export type IngredientEditFormValues = z.infer<typeof ingredientEditFormSchema>;
export type AllergenFormValues = z.infer<typeof allergenFormSchema>;

export function parseAliases(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function orNull(value: string): string | null {
  return value.trim().length > 0 ? value.trim() : null;
}
