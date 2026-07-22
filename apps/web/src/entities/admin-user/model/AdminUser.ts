import { z } from 'zod';

import { adminPermissionSchema } from '@/entities/session/model/Session';

export const adminUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'TECHNOLOGIST']),
  permissions: z.array(adminPermissionSchema),
  is_active: z.boolean(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const adminUserListSchema = z.object({
  items: z.array(adminUserSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});

export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUserList = z.infer<typeof adminUserListSchema>;

export type CreateAdminUserPayload = {
  username: string;
  email: string;
  password: string;
  role: AdminUser['role'];
  permissions: AdminUser['permissions'];
};

export type UpdateAdminUserPayload = Partial<{
  username: string;
  email: string;
  role: AdminUser['role'];
  permissions: AdminUser['permissions'];
  is_active: boolean;
}>;
