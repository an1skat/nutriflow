import { apiClient, getCsrfHeaders } from '@/shared/api/HttpClient';
import type { PageRequest } from '@/shared/api/Pagination';
import { toApiPaginationParams } from '@/shared/api/Pagination';

import {
  type AdminUser,
  type AdminUserList,
  type CreateAdminUserPayload,
  type UpdateAdminUserPayload,
  adminUserListSchema,
  adminUserSchema,
} from '../model/AdminUser';

export async function fetchAdminUsers(request: PageRequest): Promise<AdminUserList> {
  const response = await apiClient.get<unknown>('/admin/admins', {
    params: toApiPaginationParams(request),
  });
  return adminUserListSchema.parse(response.data);
}

export async function fetchAdminUser(userId: string): Promise<AdminUser> {
  const response = await apiClient.get<unknown>(`/admin/admins/${userId}`);
  return adminUserSchema.parse(response.data);
}

export async function createAdminUser(payload: CreateAdminUserPayload): Promise<AdminUser> {
  const response = await apiClient.post<unknown>('/admin/admins', payload, {
    headers: getCsrfHeaders(),
  });
  return adminUserSchema.parse(response.data);
}

export async function updateAdminUser(
  userId: string,
  payload: UpdateAdminUserPayload
): Promise<AdminUser> {
  const response = await apiClient.patch<unknown>(`/admin/admins/${userId}`, payload, {
    headers: getCsrfHeaders(),
  });
  return adminUserSchema.parse(response.data);
}

export async function deleteAdminUser(userId: string): Promise<void> {
  await apiClient.delete(`/admin/admins/${userId}`, {
    headers: getCsrfHeaders(),
  });
}

export async function resetAdminUserPassword(userId: string, password: string): Promise<void> {
  await apiClient.post(
    `/admin/admins/${userId}/reset-password`,
    { password },
    {
      headers: getCsrfHeaders(),
    }
  );
}
