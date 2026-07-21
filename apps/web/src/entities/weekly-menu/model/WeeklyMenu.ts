import { z } from "zod";

export const mealTypeSchema = z.enum(["breakfast", "lunch"]);
export const weekdaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
export const weeklyMenuStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
  "revoked",
]);
export const menuItemKindSchema = z.enum(["dish_card", "product"]);
export const ageGroupSchema = z.enum(["6-11", "11-14", "14-18"]);
export const dayCloseReasonSchema = z.enum(["manual", "automatic"]);

export const WEEKDAY_LABELS: Record<z.infer<typeof weekdaySchema>, string> = {
  monday: "Понеділок",
  tuesday: "Вівторок",
  wednesday: "Середа",
  thursday: "Четвер",
  friday: "П’ятниця",
  saturday: "Субота",
  sunday: "Неділя",
};

export const AGE_GROUP_LABELS: Record<z.infer<typeof ageGroupSchema>, string> = {
  "6-11": "6-11 років",
  "11-14": "11-14 років",
  "14-18": "14-18 років",
};

export const WEEKDAY_ORDER: Array<z.infer<typeof weekdaySchema>> = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const DEFAULT_WEEKDAYS = WEEKDAY_ORDER.slice(0, 5);

const decimalStringSchema = z.string().trim().min(1);

export const menuNutritionSchema = z.object({
  kcal: decimalStringSchema.nullable(),
  proteins: decimalStringSchema.nullable(),
  fats: decimalStringSchema.nullable(),
  carbs: decimalStringSchema.nullable(),
});

const menuPortionCalculationSourceSchema = z.object({
  portion_variant_id: z.string().min(1),
  yield_amount: z.string().trim().min(1).max(40),
});

export const menuPortionSchema = z.object({
  age_group: ageGroupSchema,
  yield_amount: z.string().trim().min(1).max(40),
  dish_card_portion_variant_id: z.string().min(1).nullable(),
  calculated_from: menuPortionCalculationSourceSchema.nullable().default(null),
  nutrition: menuNutritionSchema,
});

export const menuItemServingCountSchema = z.object({
  school_group_id: z.string().min(1),
  age_group: ageGroupSchema,
  children_count: z.number().int().nonnegative(),
});

export const dailyMenuItemSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().positive(),
  kind: menuItemKindSchema,
  source_text: z.string().min(1).nullable(),
  recipe_card_number: z.string().min(1).nullable(),
  dish_card_id: z.string().min(1).nullable(),
  dish_card_version_id: z.string().min(1).nullable(),
  product_ingredient_id: z.string().min(1).nullable(),
  product_name_snapshot: z.string().min(1).nullable(),
  name: z.string().min(1),
  allergen_codes: z.array(z.string()),
  portions: z.array(menuPortionSchema).min(1),
  servings: z.array(menuItemServingCountSchema),
  notes: z.string().min(1).nullable(),
});

export const dailyMenuSchema = z.object({
  weekday: weekdaySchema,
  date: z.string().min(1).nullable(),
  items: z.array(dailyMenuItemSchema).min(1),
  notes: z.string().min(1).nullable(),
  closed_at: z.string().min(1).nullable(),
  closed_by: z.string().min(1).nullable(),
  close_reason: dayCloseReasonSchema.nullable(),
});

export const weeklyMenuSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  school_id: z.string().min(1).nullable(),
  source_menu_id: z.string().min(1).nullable(),
  meal_type: mealTypeSchema,
  cycle_week: z.number().int().positive().max(53).nullable(),
  starts_on: z.string().min(1).nullable(),
  ends_on: z.string().min(1).nullable(),
  status: weeklyMenuStatusSchema,
  days: z.array(dailyMenuSchema).min(1).max(7),
  notes: z.string().min(1).nullable(),
  source_file_name: z.string().min(1).nullable(),
  source_sheet_name: z.string().min(1).nullable(),
  published_at: z.string().min(1).nullable(),
  revoked_at: z.string().min(1).nullable(),
  revoked_by: z.string().min(1).nullable(),
  revoke_reason: z.string().min(1).nullable(),
  created_by: z.string().min(1).nullable(),
  updated_by: z.string().min(1).nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const weeklyMenuListSchema = z.object({
  items: z.array(weeklyMenuSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export const publishWeeklyMenuResponseSchema = z.object({
  source_menu_id: z.string().min(1),
  target_school_ids: z.array(z.string().min(1)),
  created_menu_ids: z.array(z.string().min(1)),
  replaced_menu_ids: z.array(z.string().min(1)),
  skipped_existing_school_ids: z.array(z.string().min(1)),
});

export type MealType = z.infer<typeof mealTypeSchema>;
export type Weekday = z.infer<typeof weekdaySchema>;
export type WeeklyMenuStatus = z.infer<typeof weeklyMenuStatusSchema>;
export type MenuItemKind = z.infer<typeof menuItemKindSchema>;
export type AgeGroup = z.infer<typeof ageGroupSchema>;
export type DayCloseReason = z.infer<typeof dayCloseReasonSchema>;
export type MenuNutrition = z.infer<typeof menuNutritionSchema>;
export type MenuPortion = z.infer<typeof menuPortionSchema>;
export type MenuItemServingCount = z.infer<typeof menuItemServingCountSchema>;
export type DailyMenuItem = z.infer<typeof dailyMenuItemSchema>;
export type DailyMenu = z.infer<typeof dailyMenuSchema>;
export type WeeklyMenu = z.infer<typeof weeklyMenuSchema>;
export type WeeklyMenuList = z.infer<typeof weeklyMenuListSchema>;
export type PublishWeeklyMenuResponse = z.infer<
  typeof publishWeeklyMenuResponseSchema
>;

export type WeeklyMenuListRequest = {
  offset: number;
  limit: number;
  school_id?: string;
  source_menu_id?: string;
  template_only?: boolean;
  status?: WeeklyMenuStatus;
  meal_type?: MealType;
  enabled?: boolean;
};

export type WeeklyMenuPayload = {
  title: string;
  school_id?: string | null;
  meal_type: MealType;
  cycle_week?: number | null;
  starts_on?: string | null;
  ends_on?: string | null;
  days: Array<{
    weekday: Weekday;
    date?: string | null;
    items: Array<{
      id?: string;
      position: number;
      kind: MenuItemKind;
      source_text?: string | null;
      recipe_card_number?: string | null;
      dish_card_id?: string | null;
      dish_card_version_id?: string | null;
      product_ingredient_id?: string | null;
      product_name_snapshot?: string | null;
      name: string;
      allergen_codes: string[];
      portions: Array<{
        age_group: AgeGroup;
        yield_amount: string;
        dish_card_portion_variant_id?: string | null;
        calculated_from?: {
          portion_variant_id: string;
          yield_amount: string;
        } | null;
        nutrition: {
          kcal?: string | null;
          proteins?: string | null;
          fats?: string | null;
          carbs?: string | null;
        };
      }>;
      servings?: MenuItemServingCount[];
      notes?: string | null;
    }>;
    notes?: string | null;
  }>;
  notes?: string | null;
  source_file_name?: string | null;
  source_sheet_name?: string | null;
};

export type WeeklyMenuUpdatePayload = Partial<WeeklyMenuPayload>;

export type PublishWeeklyMenuPayload = {
  school_ids?: string[];
  replace_existing?: boolean;
};
