import { z } from 'zod';

// Decimal values travel on the wire as strings (Pydantic serializes Decimal to
// string to preserve precision), so every numeric amount field is a string here.
const decimalString = z
  .string()
  .trim()
  .min(1, 'Введіть значення')
  .regex(/^-?\d+(\.\d+)?$/, 'Очікуємо десяткове число');

export const normativeGroupCodeSchema = z.enum([
  'vegetables',
  'fruits_berries',
  'juices',
  'dried_fruits_nuts_seeds',
  'cereals_grains_legumes',
  'potatoes',
  'bread',
  'fish',
  'poultry',
  'red_meat',
  'eggs',
  'dairy',
  'animal_fats',
  'vegetable_fats',
  'salt',
  'sugar',
  'cocoa',
  'tea',
]);

export const normativeContributionSchema = z.object({
  group_code: normativeGroupCodeSchema,
  amount: decimalString,
  unit: z.enum(['g', 'ml', 'item', 'portion']),
  basis: z.enum(['per_portion', 'per_source_unit']),
  portion_equivalent: decimalString.nullable(),
  product_variant: z.string().min(1).max(80).nullable(),
});

export const nutritionSchema = z.object({
  kcal: decimalString,
  proteins: decimalString,
  fats: decimalString,
  carbs: decimalString,
});

export const portionVariantSchema = z.object({
  id: z.string().min(1),
  age_group: z.enum(['6-11', '11-14', '14-18']).nullable(),
  portion_grams: decimalString.nullable(),
  output_grams: decimalString,
  nutrition: nutritionSchema,
  normative_contributions: z.array(normativeContributionSchema).default([]),
});

export const ingredientAmountSchema = z.object({
  ingredient_id: z.string().min(1).nullable(),
  ingredient_name_snapshot: z.string().trim().min(1).max(200),
  gross_amount: decimalString,
  net_amount: decimalString,
  unit: z.string().trim().min(1).max(20),
  amount_basis: z.literal('per_portion'),
  portion_variant_id: z.string().min(1),
  notes: z.string().trim().max(1000).nullable(),
});

export const allergenSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const ingredientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  normalized_name: z.string().min(1),
  unit: z.string().min(1),
  normative_group_id: z.string().min(1).nullable(),
  normative_contributions: z.array(normativeContributionSchema).default([]),
  aliases: z.array(z.string()),
  is_active: z.boolean(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const dishCardSchema = z.object({
  id: z.string().min(1),
  card_number: z.string().min(1),
  name: z.string().min(1),
  category: z.string().nullable(),
  source: z.string().nullable(),
  is_active: z.boolean(),
  current_version_id: z.string().min(1).nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const dishCardVersionSchema = z.object({
  id: z.string().min(1),
  dish_card_id: z.string().min(1),
  version: z.number().int().nonnegative(),
  status: z.enum(['draft', 'import_preview', 'confirmed', 'archived']),
  source_import_id: z.string().min(1).nullable(),
  source_file_name: z.string().nullable(),
  source_page: z.number().int().nullable(),
  recognized_warnings: z.array(z.string()),
  recognition_errors: z.array(z.string()),
  allergen_ids: z.array(z.string()),
  technology_text: z.string().nullable(),
  portion_variants: z.array(portionVariantSchema),
  ingredient_amounts: z.array(ingredientAmountSchema),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  created_by: z.string().min(1).nullable(),
});

export const allergenListSchema = z.object({
  items: z.array(allergenSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export const ingredientListSchema = z.object({
  items: z.array(ingredientSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export const dishCardListSchema = z.object({
  items: z.array(dishCardSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export const dishCardVersionListSchema = z.object({
  items: z.array(dishCardVersionSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export const validationIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  field: z.string().nullable(),
});

export const validationResponseSchema = z.object({
  blocking_errors: z.array(validationIssueSchema),
  warnings: z.array(validationIssueSchema),
  can_confirm: z.boolean(),
});

export type Nutrition = z.infer<typeof nutritionSchema>;
export type NormativeContribution = z.infer<typeof normativeContributionSchema>;
export type PortionVariant = z.infer<typeof portionVariantSchema>;
export type IngredientAmount = z.infer<typeof ingredientAmountSchema>;
export type Allergen = z.infer<typeof allergenSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type DishCard = z.infer<typeof dishCardSchema>;
export type DishCardVersion = z.infer<typeof dishCardVersionSchema>;
export type AllergenList = z.infer<typeof allergenListSchema>;
export type IngredientList = z.infer<typeof ingredientListSchema>;
export type DishCardList = z.infer<typeof dishCardListSchema>;
export type DishCardVersionList = z.infer<typeof dishCardVersionListSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ValidationResponse = z.infer<typeof validationResponseSchema>;

export type CreateDishCardPayload = {
  card_number: string;
  name: string;
  category?: string | null;
  source?: string | null;
};

export type CreateAllergenPayload = {
  code: string;
  name: string;
  description?: string | null;
};

export type CreateIngredientPayload = {
  name: string;
  unit: string;
  normative_group_id?: string | null;
  normative_contributions?: NormativeContribution[];
  aliases?: string[];
};

export type UpdateIngredientPayload = {
  name?: string;
  unit?: string;
  normative_group_id?: string | null;
  normative_contributions?: NormativeContribution[];
  aliases?: string[];
  is_active?: boolean;
};

export type UpdateAllergenPayload = {
  code?: string;
  name?: string;
  description?: string | null;
};

export type UpdateDishCardPayload = {
  card_number?: string;
  name?: string;
  category?: string | null;
  source?: string | null;
  is_active?: boolean;
};

export type UpdateDishCardVersionPayload = {
  source_file_name?: string | null;
  source_page?: number | null;
  recognized_warnings?: string[];
  recognition_errors?: string[];
  allergen_ids?: string[];
  technology_text?: string | null;
  portion_variants?: PortionVariant[];
  ingredient_amounts?: IngredientAmount[];
};

export type CreateDishCardVersionPayload = {
  source_file_name?: string | null;
  source_page?: number | null;
  recognized_warnings?: string[];
  recognition_errors?: string[];
  allergen_ids?: string[];
  technology_text?: string | null;
  portion_variants: PortionVariant[];
  ingredient_amounts: IngredientAmount[];
};

export type CalculateIngredientsPayload = {
  portion_variant_id: string;
  servings_count: number;
};
