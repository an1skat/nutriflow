import { z } from "zod";

export const schoolUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email().nullable(),
  role: z.literal("SCHOOL_USER"),
  school_id: z.string().min(1),
  is_active: z.boolean(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const schoolUserListSchema = z.object({
  items: z.array(schoolUserSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export type SchoolUser = z.infer<typeof schoolUserSchema>;
export type SchoolUserList = z.infer<typeof schoolUserListSchema>;

export type CreateSchoolUserPayload = {
  username: string;
  email: string | null;
  password: string;
};

export type UpdateSchoolUserPayload = {
  username: string;
  email: string | null;
  is_active: boolean;
};
