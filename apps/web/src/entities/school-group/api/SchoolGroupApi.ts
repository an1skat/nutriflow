import { apiClient, getCsrfHeaders } from '@/shared/api/HttpClient';
import type { PageRequest } from '@/shared/api/Pagination';
import { toApiPaginationParams } from '@/shared/api/Pagination';

import {
  type SchoolGroup,
  type SchoolGroupList,
  type UpdateSchoolGroupPayload,
  schoolGroupListSchema,
  schoolGroupSchema,
} from '../model/SchoolGroup';

export async function fetchAdminSchoolGroups(
  schoolId: string,
  request: PageRequest
): Promise<SchoolGroupList> {
  const response = await apiClient.get<unknown>(`/admin/schools/${schoolId}/groups`, {
    params: toApiPaginationParams(request),
  });
  return schoolGroupListSchema.parse(response.data);
}

export async function fetchOwnSchoolGroups(request: PageRequest): Promise<SchoolGroupList> {
  const response = await apiClient.get<unknown>('/school/groups', {
    params: toApiPaginationParams(request),
  });
  return schoolGroupListSchema.parse(response.data);
}

export async function updateAdminSchoolGroup(
  schoolId: string,
  groupId: string,
  payload: UpdateSchoolGroupPayload
): Promise<SchoolGroup> {
  const response = await apiClient.patch<unknown>(
    `/admin/schools/${schoolId}/groups/${groupId}`,
    payload,
    {
      headers: getCsrfHeaders(),
    }
  );
  return schoolGroupSchema.parse(response.data);
}
