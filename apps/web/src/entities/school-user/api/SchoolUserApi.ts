import { apiClient, getCsrfHeaders } from "@/shared/api/HttpClient";
import type { PageRequest } from "@/shared/api/Pagination";
import { toApiPaginationParams } from "@/shared/api/Pagination";

import {
  schoolUserListSchema,
  schoolUserSchema,
  type CreateSchoolUserPayload,
  type SchoolUser,
  type SchoolUserList,
  type UpdateSchoolUserPayload,
} from "../model/SchoolUser";

export async function fetchSchoolUsers(
  schoolId: string,
  request: PageRequest,
): Promise<SchoolUserList> {
  const response = await apiClient.get<unknown>(
    `/admin/schools/${schoolId}/users`,
    {
      params: toApiPaginationParams(request),
    },
  );
  return schoolUserListSchema.parse(response.data);
}

export async function fetchSchoolUser(
  schoolId: string,
  userId: string,
): Promise<SchoolUser> {
  const response = await apiClient.get<unknown>(
    `/admin/schools/${schoolId}/users/${userId}`,
  );
  return schoolUserSchema.parse(response.data);
}

export async function createSchoolUser(
  schoolId: string,
  payload: CreateSchoolUserPayload,
): Promise<SchoolUser> {
  const response = await apiClient.post<unknown>(
    `/admin/schools/${schoolId}/users`,
    payload,
    {
      headers: getCsrfHeaders(),
    },
  );
  return schoolUserSchema.parse(response.data);
}

export async function updateSchoolUser(
  schoolId: string,
  userId: string,
  payload: UpdateSchoolUserPayload,
): Promise<SchoolUser> {
  const response = await apiClient.patch<unknown>(
    `/admin/schools/${schoolId}/users/${userId}`,
    payload,
    {
      headers: getCsrfHeaders(),
    },
  );
  return schoolUserSchema.parse(response.data);
}

export async function deleteSchoolUser(
  schoolId: string,
  userId: string,
): Promise<void> {
  await apiClient.delete(`/admin/schools/${schoolId}/users/${userId}`, {
    headers: getCsrfHeaders(),
  });
}

export async function resetSchoolUserPassword(
  schoolId: string,
  userId: string,
  password: string,
): Promise<void> {
  await apiClient.post(
    `/admin/schools/${schoolId}/users/${userId}/reset-password`,
    { password },
    {
      headers: getCsrfHeaders(),
    },
  );
}
