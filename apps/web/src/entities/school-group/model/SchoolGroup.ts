import { z } from 'zod';

export const ageGroupSchema = z.enum(['6-11', '11-14', '14-18']);

export const ageGroupLabels: Record<AgeGroup, string> = {
  '6-11': '6-11 років',
  '11-14': '11-14 років',
  '14-18': '14-18 років',
};

export const ageGroupOptions = ageGroupSchema.options.map((value) => ({
  value,
  label: ageGroupLabels[value],
}));

export const schoolGroupSchema = z.object({
  id: z.string().min(1),
  school_id: z.string().min(1),
  name: z.string().min(1),
  age_group: ageGroupSchema,
  is_active: z.boolean(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const schoolGroupListSchema = z.object({
  items: z.array(schoolGroupSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export type AgeGroup = z.infer<typeof ageGroupSchema>;
export type SchoolGroup = z.infer<typeof schoolGroupSchema>;
export type SchoolGroupList = z.infer<typeof schoolGroupListSchema>;

export type UpdateSchoolGroupPayload = {
  name?: string;
  is_active?: boolean;
};
