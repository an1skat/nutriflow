import { z } from 'zod';

export const communityCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

export const communitySchema = z.object({
  id: z.string().min(1),
  code: communityCodeSchema,
  name: z.string().min(1),
  admin_owner_id: z.string().min(1).nullable(),
  admin_username: z.string().min(1).nullable(),
  school_count: z.number().int().nonnegative(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const communityListSchema = z.object({
  items: z.array(communitySchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export const communityAdminOptionsSchema = z.array(
  z.object({
    id: z.string().min(1),
    username: z.string().min(1),
  })
);

export const communitySchoolOptionsSchema = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    community: communityCodeSchema.nullable(),
  })
);

export type Community = z.infer<typeof communitySchema>;
export type CommunityList = z.infer<typeof communityListSchema>;
export type CommunityAdminOption = z.infer<typeof communityAdminOptionsSchema>[number];
export type CommunitySchoolOption = z.infer<typeof communitySchoolOptionsSchema>[number];

export type CreateCommunityPayload = {
  code: string;
  name: string;
  admin_owner_id: string | null;
};

export type UpdateCommunityPayload = {
  name?: string;
  admin_owner_id?: string | null;
};
