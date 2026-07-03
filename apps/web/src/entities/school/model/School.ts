import { z } from "zod";

export const schoolSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1),
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

export type CreateSchoolPayload = {
  name: string;
  code: string;
};

export type UpdateSchoolPayload = CreateSchoolPayload & {
  is_active: boolean;
};

export type DeleteSchoolPayload = {
  password?: string;
};
