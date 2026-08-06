import { z } from 'zod';

export const schoolCommunitySchema = z.enum(['obukhivska']);

export const schoolCommunityLabels = {
  obukhivska: 'Обухівська громада',
} as const satisfies Record<SchoolCommunity, string>;

export const schoolSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  community: schoolCommunitySchema.nullable(),
  admin_owner_id: z.string().min(1).nullable(),
  is_active: z.boolean(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const schoolListSchema = z.object({
  items: z.array(schoolSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export type School = z.infer<typeof schoolSchema>;
export type SchoolList = z.infer<typeof schoolListSchema>;
export type SchoolCommunity = z.infer<typeof schoolCommunitySchema>;

export type CreateSchoolPayload = {
  name: string;
  community?: SchoolCommunity | null;
  admin_owner_id?: string | null;
};

export type UpdateSchoolPayload = CreateSchoolPayload & {
  is_active: boolean;
};
