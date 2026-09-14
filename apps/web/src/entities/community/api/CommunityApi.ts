import { apiClient, getCsrfHeaders } from '@/shared/api/HttpClient';
import type { PageRequest } from '@/shared/api/Pagination';
import { toApiPaginationParams } from '@/shared/api/Pagination';

import {
  type Community,
  type CommunityAdminOption,
  type CommunityList,
  type CommunitySchoolOption,
  type CreateCommunityPayload,
  type UpdateCommunityPayload,
  communityAdminOptionsSchema,
  communityListSchema,
  communitySchema,
  communitySchoolOptionsSchema,
} from '../model/Community';

export async function fetchCommunities(request: PageRequest): Promise<CommunityList> {
  const response = await apiClient.get<unknown>('/admin/communities', {
    params: toApiPaginationParams(request),
  });
  return communityListSchema.parse(response.data);
}

export async function fetchCommunityAdminOptions(): Promise<CommunityAdminOption[]> {
  const response = await apiClient.get<unknown>('/admin/communities/admin-options');
  return communityAdminOptionsSchema.parse(response.data);
}

export async function fetchCommunitySchoolOptions(): Promise<CommunitySchoolOption[]> {
  const response = await apiClient.get<unknown>('/admin/communities/school-options');
  return communitySchoolOptionsSchema.parse(response.data);
}

export async function createCommunity(payload: CreateCommunityPayload): Promise<Community> {
  const response = await apiClient.post<unknown>('/admin/communities', payload, {
    headers: getCsrfHeaders(),
  });
  return communitySchema.parse(response.data);
}

export async function updateCommunity(
  communityId: string,
  payload: UpdateCommunityPayload
): Promise<Community> {
  const response = await apiClient.patch<unknown>(`/admin/communities/${communityId}`, payload, {
    headers: getCsrfHeaders(),
  });
  return communitySchema.parse(response.data);
}

export async function addCommunitySchool(communityId: string, schoolId: string): Promise<void> {
  await apiClient.post(
    `/admin/communities/${communityId}/schools`,
    { school_id: schoolId },
    { headers: getCsrfHeaders() }
  );
}

export async function removeCommunitySchool(communityId: string, schoolId: string): Promise<void> {
  await apiClient.delete(`/admin/communities/${communityId}/schools/${schoolId}`, {
    headers: getCsrfHeaders(),
  });
}
