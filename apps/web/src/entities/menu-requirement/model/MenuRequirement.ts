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

export type MenuRequirementDish = z.infer<
  typeof menuRequirementDishSchema
>;
export type MenuRequirementIngredientRow = z.infer<
  typeof menuRequirementIngredientRowSchema
>;
export type MenuRequirement = z.infer<typeof menuRequirementSchema>;
export type MenuRequirementList = z.infer<typeof menuRequirementListSchema>;
export type GenerateMenuRequirementsResponse = z.infer<
  typeof generateMenuRequirementsResponseSchema
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
};
