import { z } from 'zod';

import {
  dailyMenuSchema,
  mealTypeSchema,
  weekdaySchema,
} from '@/entities/weekly-menu/model/WeeklyMenu';

export const menuChangeRequestStatusSchema = z.enum(['pending', 'reviewed']);

export const menuFieldChangeSchema = z.object({
  weekday: weekdaySchema,
  item_id: z.string().min(1),
  position: z.number().int().positive(),
  field: z.string().min(1),
  before_value: z.unknown().nullable(),
  after_value: z.unknown().nullable(),
});

export const menuChangeRequestSchema = z.object({
  id: z.string().min(1),
  menu_id: z.string().min(1),
  source_menu_id: z.string().min(1).nullable(),
  school_id: z.string().min(1),
  school_name: z.string().min(1),
  submitted_by: z.string().min(1),
  menu_title: z.string().min(1),
  meal_type: mealTypeSchema,
  cycle_week: z.number().int().positive().nullable(),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  days_snapshot: z.array(dailyMenuSchema).min(1),
  changes: z.array(menuFieldChangeSchema).min(1),
  status: menuChangeRequestStatusSchema,
  reviewed_by: z.string().min(1).nullable(),
  reviewed_at: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const menuChangeRequestListSchema = z.object({
  items: z.array(menuChangeRequestSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export const menuChangeRequestSchoolOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const menuChangeRequestSchoolOptionsSchema = z.array(menuChangeRequestSchoolOptionSchema);

export type MenuChangeRequestStatus = z.infer<typeof menuChangeRequestStatusSchema>;
export type MenuFieldChange = z.infer<typeof menuFieldChangeSchema>;
export type MenuChangeRequest = z.infer<typeof menuChangeRequestSchema>;
export type MenuChangeRequestList = z.infer<typeof menuChangeRequestListSchema>;
export type MenuChangeRequestSchoolOption = z.infer<typeof menuChangeRequestSchoolOptionSchema>;
