import { apiClient, getCsrfHeaders } from "@/shared/api/HttpClient";
import { toApiPaginationParams } from "@/shared/api/Pagination";

import {
  menuChangeRequestListSchema,
  menuChangeRequestSchema,
  type MenuChangeRequest,
  type MenuChangeRequestList,
  type MenuChangeRequestStatus,
} from "../model/MenuChangeRequest";

export type MenuChangeRequestListRequest = {
  offset: number;
  limit: number;
  status?: MenuChangeRequestStatus;
};

export async function fetchMenuChangeRequests(
  request: MenuChangeRequestListRequest,
): Promise<MenuChangeRequestList> {
  const response = await apiClient.get<unknown>("/menus/change-requests", {
    params: {
      ...toApiPaginationParams(request),
      status: request.status,
    },
  });

  return menuChangeRequestListSchema.parse(response.data);
}

export async function markMenuChangeRequestReviewed(
  requestId: string,
): Promise<MenuChangeRequest> {
  const response = await apiClient.post<unknown>(
    `/menus/change-requests/${requestId}/reviewed`,
    null,
    { headers: getCsrfHeaders() },
  );

  return menuChangeRequestSchema.parse(response.data);
}
