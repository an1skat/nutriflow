import { apiClient, getCsrfHeaders } from "@/shared/api/HttpClient";
import { toApiPaginationParams } from "@/shared/api/Pagination";

import {
  generateMenuRequirementsResponseSchema,
  menuRequirementListSchema,
  menuRequirementSchema,
  type GenerateMenuRequirementsPayload,
  type GenerateMenuRequirementsResponse,
  type MenuRequirement,
  type MenuRequirementList,
  type MenuRequirementListRequest,
} from "../model/MenuRequirement";

export async function fetchMenuRequirements(
  request: MenuRequirementListRequest,
): Promise<MenuRequirementList> {
  const response = await apiClient.get<unknown>("/menu-requirements", {
    params: {
      ...toApiPaginationParams(request),
      weekly_menu_id: request.weekly_menu_id,
      school_group_id: request.school_group_id,
      service_date: request.service_date,
    },
  });
  return menuRequirementListSchema.parse(response.data);
}

export async function fetchMenuRequirement(
  requirementId: string,
): Promise<MenuRequirement> {
  const response = await apiClient.get<unknown>(
    `/menu-requirements/${requirementId}`,
  );
  return menuRequirementSchema.parse(response.data);
}

export async function generateMenuRequirements(
  payload: GenerateMenuRequirementsPayload,
): Promise<GenerateMenuRequirementsResponse> {
  const response = await apiClient.post<unknown>(
    "/menu-requirements/generate",
    payload,
    {
      headers: getCsrfHeaders(),
    },
  );
  return generateMenuRequirementsResponseSchema.parse(response.data);
}
