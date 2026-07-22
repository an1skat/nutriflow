import { apiClient, getCsrfHeaders } from '@/shared/api/HttpClient';
import { toApiPaginationParams } from '@/shared/api/Pagination';

import {
  type MenuChangeRequest,
  type MenuChangeRequestList,
  type MenuChangeRequestSchoolOption,
  type MenuChangeRequestStatus,
  menuChangeRequestListSchema,
  menuChangeRequestSchema,
  menuChangeRequestSchoolOptionsSchema,
} from '../model/MenuChangeRequest';

export type MenuChangeRequestListRequest = {
  offset: number;
  limit: number;
  status?: MenuChangeRequestStatus;
  schoolId?: string;
};

export async function fetchMenuChangeRequests(
  request: MenuChangeRequestListRequest
): Promise<MenuChangeRequestList> {
  const response = await apiClient.get<unknown>('/menus/change-requests', {
    params: {
      ...toApiPaginationParams(request),
      status: request.status,
      school_id: request.schoolId,
    },
  });

  return menuChangeRequestListSchema.parse(response.data);
}

export async function fetchMenuChangeRequest(requestId: string): Promise<MenuChangeRequest> {
  const response = await apiClient.get<unknown>(`/menus/change-requests/${requestId}`);

  return menuChangeRequestSchema.parse(response.data);
}

export async function fetchMenuChangeRequestSchools(): Promise<MenuChangeRequestSchoolOption[]> {
  const response = await apiClient.get<unknown>('/menus/change-requests/schools');

  return menuChangeRequestSchoolOptionsSchema.parse(response.data);
}

export async function markMenuChangeRequestReviewed(requestId: string): Promise<MenuChangeRequest> {
  const response = await apiClient.post<unknown>(
    `/menus/change-requests/${requestId}/reviewed`,
    null,
    { headers: getCsrfHeaders() }
  );

  return menuChangeRequestSchema.parse(response.data);
}
