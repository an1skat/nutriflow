import { z } from "zod";

import {
  ageGroupSchema,
  mealTypeSchema,
  menuItemKindSchema,
  weekdaySchema,
} from "@/entities/weekly-menu/model/WeeklyMenu";

const decimalStringSchema = z.string().trim().min(1);

export const menuRequirementDishSchema = z.object({
  menu_item_id: z.string().min(1),
  position: z.number().int().positive(),
  kind: menuItemKindSchema,
  name: z.string().min(1),
  recipe_card_number: z.string().nullable(),
  dish_card_id: z.string().nullable(),
  dish_card_version_id: z.string().nullable(),
  portion_variant_id: z.string().nullable(),
  product_ingredient_id: z.string().nullable(),
  yield_amount: z.string().min(1),
  children_count: z.number().int().positive(),
});

export const menuRequirementCellSchema = z.object({
  menu_item_id: z.string().min(1),
  net_per_person_g: decimalStringSchema,
});

export const menuRequirementIngredientRowSchema = z.object({
  key: z.string().min(1),
  ingredient_id: z.string().nullable(),
  ingredient_name: z.string().min(1),
  cells: z.array(menuRequirementCellSchema),
  per_person_total_g: decimalStringSchema,
  issue_total_raw_g: decimalStringSchema,
  issue_total_rounded_g: z.number().int().nonnegative(),
});

export const menuRequirementSchema = z.object({
  id: z.string().min(1),
  school_id: z.string().min(1),
  school_name: z.string().min(1),
  school_admin_owner_id: z.string().nullable(),
  school_admin_owner_username: z.string().nullable(),
  weekly_menu_id: z.string().min(1),
  source_menu_id: z.string().nullable(),
  menu_title: z.string().min(1),
  meal_type: mealTypeSchema,
  weekday: weekdaySchema,
  service_date: z.string().min(1),
  school_group_id: z.string().min(1),
  school_group_name: z.string().min(1),
  age_group: ageGroupSchema,
  dishes: z.array(menuRequirementDishSchema).min(1),
  ingredient_rows: z.array(menuRequirementIngredientRowSchema),
  source_day_hash: z.string().length(64),
  revision: z.number().int().positive(),
  generated_by: z.string().min(1),
  generated_at: z.string().min(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const menuRequirementListSchema = z.object({
  items: z.array(menuRequirementSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export const generateMenuRequirementsResponseSchema = z.object({
  items: z.array(menuRequirementSchema).min(1),
});

export const menuRequirementReportGranularitySchema = z.enum([
  "day",
  "week",
  "month",
]);

export const menuRequirementAggregateStatusSchema = z.enum([
  "complete",
  "missing",
  "stale",
  "mixed",
]);

export const menuRequirementDishKeyReliabilitySchema = z.enum([
  "stable",
  "name_fallback",
]);

export const menuRequirementCalendarDaySchema = z.object({
  service_date: z.string().min(1),
  expected_requirements: z.number().int().nonnegative(),
  generated_requirements: z.number().int().nonnegative(),
  missing_requirements: z.number().int().nonnegative(),
  stale_requirements: z.number().int().nonnegative(),
  status: menuRequirementAggregateStatusSchema,
});

export const menuRequirementCalendarWeekSchema = z.object({
  week_index: z.number().int().positive(),
  date_from: z.string().min(1),
  date_to: z.string().min(1),
  generated_days: z.number().int().nonnegative(),
  missing_days: z.number().int().nonnegative(),
  stale_days: z.number().int().nonnegative(),
  status: menuRequirementAggregateStatusSchema,
  days: z.array(menuRequirementCalendarDaySchema).length(5),
});

export const menuRequirementCalendarMonthSchema = z.object({
  month: z.number().int().min(1).max(12),
  date_from: z.string().min(1),
  date_to: z.string().min(1),
  total_days: z.number().int().positive(),
  working_days: z.number().int().nonnegative(),
  generated_days: z.number().int().nonnegative(),
  missing_days: z.number().int().nonnegative(),
  stale_days: z.number().int().nonnegative(),
  status: menuRequirementAggregateStatusSchema,
  weeks: z.array(menuRequirementCalendarWeekSchema),
});

export const menuRequirementCalendarSchema = z.object({
  school_id: z.string().min(1),
  school_name: z.string().min(1),
  year: z.number().int(),
  months: z.array(menuRequirementCalendarMonthSchema).length(12),
});

export const menuRequirementReportDishSchema = z.object({
  aggregate_key: z.string().min(1),
  name: z.string().min(1),
  kind: menuItemKindSchema,
  recipe_card_number: z.string().nullable(),
  yield_amount: z.string().min(1),
  key_reliability: menuRequirementDishKeyReliabilitySchema,
  children_count_total: z.number().int().nonnegative(),
});

export const menuRequirementReportBreakdownItemSchema = z.object({
  requirement_id: z.string().nullable(),
  service_date: z.string().min(1),
  school_group_id: z.string().min(1),
  school_group_name: z.string().min(1),
  menu_title: z.string().nullable(),
  net_per_person_g: decimalStringSchema.nullable(),
  children_count: z.number().int().nonnegative().nullable(),
  issue_total_raw_g: decimalStringSchema.nullable(),
  issue_total_rounded_g: z.number().int().nonnegative().nullable(),
  status: menuRequirementAggregateStatusSchema,
});

export const menuRequirementReportCellSchema = z.object({
  dish_key: z.string().min(1),
  net_per_person_g: decimalStringSchema,
  issue_total_raw_g: decimalStringSchema,
  issue_total_rounded_g: z.number().int().nonnegative(),
  breakdown: z.array(menuRequirementReportBreakdownItemSchema),
});

export const menuRequirementReportIngredientRowSchema = z.object({
  key: z.string().min(1),
  ingredient_id: z.string().nullable(),
  ingredient_name: z.string().min(1),
  cells: z.array(menuRequirementReportCellSchema),
  per_person_total_g: decimalStringSchema,
  issue_total_raw_g: decimalStringSchema,
  issue_total_rounded_g: z.number().int().nonnegative(),
});

export const menuRequirementReportGroupSchema = z.object({
  school_group_id: z.string().min(1),
  school_group_name: z.string().min(1),
  age_group: ageGroupSchema,
  dishes: z.array(menuRequirementReportDishSchema),
  ingredient_rows: z.array(menuRequirementReportIngredientRowSchema),
});

export const menuRequirementReportSchema = z.object({
  school_id: z.string().min(1),
  school_name: z.string().min(1),
  date_from: z.string().min(1),
  date_to: z.string().min(1),
  granularity: menuRequirementReportGranularitySchema,
  meal_type: mealTypeSchema.nullable(),
  school_group_id: z.string().nullable(),
  status: menuRequirementAggregateStatusSchema,
  missing_dates: z.array(z.string().min(1)),
  stale_dates: z.array(z.string().min(1)),
  groups: z.array(menuRequirementReportGroupSchema),
});

export const updateMenuRequirementPayloadSchema = z.object({
  ingredient_rows: z.array(
    z.object({
      key: z.string().min(1),
      ingredient_name: z.string().trim().min(1),
      cells: z.array(
        z.object({
          menu_item_id: z.string().min(1),
          net_per_person_g: decimalStringSchema,
        }),
      ),
    }),
  ),
});

export type MenuRequirementDish = z.infer<
  typeof menuRequirementDishSchema
>;
export type MenuRequirementCell = z.infer<typeof menuRequirementCellSchema>;
export type MenuRequirementIngredientRow = z.infer<
  typeof menuRequirementIngredientRowSchema
>;
export type MenuRequirement = z.infer<typeof menuRequirementSchema>;
export type MenuRequirementList = z.infer<typeof menuRequirementListSchema>;
export type GenerateMenuRequirementsResponse = z.infer<
  typeof generateMenuRequirementsResponseSchema
>;
export type MenuRequirementReportGranularity = z.infer<
  typeof menuRequirementReportGranularitySchema
>;
export type MenuRequirementAggregateStatus = z.infer<
  typeof menuRequirementAggregateStatusSchema
>;
export type MenuRequirementCalendar = z.infer<
  typeof menuRequirementCalendarSchema
>;
export type MenuRequirementCalendarMonth = z.infer<
  typeof menuRequirementCalendarMonthSchema
>;
export type MenuRequirementCalendarWeek = z.infer<
  typeof menuRequirementCalendarWeekSchema
>;
export type MenuRequirementCalendarDay = z.infer<
  typeof menuRequirementCalendarDaySchema
>;
export type MenuRequirementReport = z.infer<
  typeof menuRequirementReportSchema
>;
export type MenuRequirementReportDish = z.infer<
  typeof menuRequirementReportDishSchema
>;
export type MenuRequirementReportCell = z.infer<
  typeof menuRequirementReportCellSchema
>;
export type MenuRequirementReportBreakdownItem = z.infer<
  typeof menuRequirementReportBreakdownItemSchema
>;
export type MenuRequirementReportGroup = z.infer<
  typeof menuRequirementReportGroupSchema
>;
export type UpdateMenuRequirementPayload = z.infer<
  typeof updateMenuRequirementPayloadSchema
>;

export type MenuRequirementListRequest = {
  offset: number;
  limit: number;
  weekly_menu_id?: string;
  school_group_id?: string;
  service_date?: string;
  enabled?: boolean;
};

export type GenerateMenuRequirementsPayload = {
  weekly_menu_id: string;
  weekday: z.infer<typeof weekdaySchema>;
  service_date: string;
};

export type MenuRequirementCalendarRequest = {
  school_id: string;
  year: number;
  meal_type?: z.infer<typeof mealTypeSchema>;
  school_group_id?: string;
  enabled?: boolean;
};

export type MenuRequirementReportRequest = {
  school_id: string;
  date_from: string;
  date_to: string;
  granularity: MenuRequirementReportGranularity;
  meal_type?: z.infer<typeof mealTypeSchema>;
  school_group_id?: string;
  enabled?: boolean;
};
