import { apiClient, getCsrfHeaders } from '@/shared/api/HttpClient';
import type { PageRequest } from '@/shared/api/Pagination';
import { toApiPaginationParams } from '@/shared/api/Pagination';

import {
  type CreateSchoolPayload,
  type DeleteSchoolPayload,
  type School,
  type SchoolList,
  type UpdateSchoolPayload,
  schoolListSchema,
  schoolSchema,
} from '../model/School';

export async function fetchSchools(request: PageRequest): Promise<SchoolList> {
  const response = await apiClient.get<unknown>('/admin/schools', {
    params: toApiPaginationParams(request),
  });
  return schoolListSchema.parse(response.data);
}

export async function fetchSchool(schoolId: string): Promise<School> {
  const response = await apiClient.get<unknown>(`/admin/schools/${schoolId}`);
  return schoolSchema.parse(response.data);
}

export async function createSchool(payload: CreateSchoolPayload): Promise<School> {
  const response = await apiClient.post<unknown>('/admin/schools', payload, {
    headers: getCsrfHeaders(),
  });
  return schoolSchema.parse(response.data);
}

export async function updateSchool(
  schoolId: string,
  payload: UpdateSchoolPayload
): Promise<School> {
  const response = await apiClient.patch<unknown>(`/admin/schools/${schoolId}`, payload, {
    headers: getCsrfHeaders(),
  });
  return schoolSchema.parse(response.data);
}

export async function deleteSchool(schoolId: string, payload?: DeleteSchoolPayload): Promise<void> {
  await apiClient.delete(`/admin/schools/${schoolId}`, {
    headers: getCsrfHeaders(),
    data: payload ?? {},
  });
}
