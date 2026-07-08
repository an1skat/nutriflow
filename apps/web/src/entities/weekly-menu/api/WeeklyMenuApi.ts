import { apiClient, getCsrfHeaders } from "@/shared/api/HttpClient";
import { toApiPaginationParams } from "@/shared/api/Pagination";

import {
  publishWeeklyMenuResponseSchema,
  weeklyMenuListSchema,
  weeklyMenuSchema,
  type PublishWeeklyMenuPayload,
  type PublishWeeklyMenuResponse,
  type WeeklyMenu,
  type WeeklyMenuList,
  type WeeklyMenuListRequest,
  type WeeklyMenuPayload,
  type WeeklyMenuUpdatePayload,
} from "../model/WeeklyMenu";

export async function fetchWeeklyMenus(
  request: WeeklyMenuListRequest,
): Promise<WeeklyMenuList> {
  const response = await apiClient.get<unknown>("/menus/weekly", {
    params: {
      ...toApiPaginationParams(request),
      school_id: request.school_id,
      source_menu_id: request.source_menu_id,
      template_only: request.template_only || undefined,
      status: request.status,
      meal_type: request.meal_type,
    },
  });

  return weeklyMenuListSchema.parse(response.data);
}

export async function fetchWeeklyMenu(menuId: string): Promise<WeeklyMenu> {
  const response = await apiClient.get<unknown>(`/menus/weekly/${menuId}`);
  return weeklyMenuSchema.parse(response.data);
}

export async function createWeeklyMenu(
  payload: WeeklyMenuPayload,
): Promise<WeeklyMenu> {
  const response = await apiClient.post<unknown>("/menus/weekly", payload, {
    headers: getCsrfHeaders(),
  });

  return weeklyMenuSchema.parse(response.data);
}

export async function updateWeeklyMenu(
  menuId: string,
  payload: WeeklyMenuUpdatePayload,
): Promise<WeeklyMenu> {
  const response = await apiClient.patch<unknown>(
    `/menus/weekly/${menuId}`,
    payload,
    {
      headers: getCsrfHeaders(),
    },
  );

  return weeklyMenuSchema.parse(response.data);
}

export async function archiveWeeklyMenu(menuId: string): Promise<WeeklyMenu> {
  const response = await apiClient.post<unknown>(
    `/menus/weekly/${menuId}/archive`,
    null,
    {
      headers: getCsrfHeaders(),
    },
  );

  return weeklyMenuSchema.parse(response.data);
}

export async function archiveSchoolWeeklyMenu(
  menuId: string,
): Promise<WeeklyMenu> {
  const response = await apiClient.post<unknown>(
    `/menus/weekly/${menuId}/school-archive`,
    null,
    {
      headers: getCsrfHeaders(),
    },
  );

  return weeklyMenuSchema.parse(response.data);
}

export async function restoreSchoolWeeklyMenu(
  menuId: string,
): Promise<WeeklyMenu> {
  const response = await apiClient.post<unknown>(
    `/menus/weekly/${menuId}/school-restore`,
    null,
    {
      headers: getCsrfHeaders(),
    },
  );

  return weeklyMenuSchema.parse(response.data);
}

export async function revokeWeeklyMenu(menuId: string): Promise<WeeklyMenu> {
  const response = await apiClient.post<unknown>(
    `/menus/weekly/${menuId}/revoke`,
    null,
    {
      headers: getCsrfHeaders(),
    },
  );

  return weeklyMenuSchema.parse(response.data);
}

export async function restoreWeeklyMenu(menuId: string): Promise<WeeklyMenu> {
  const response = await apiClient.post<unknown>(
    `/menus/weekly/${menuId}/restore`,
    null,
    {
      headers: getCsrfHeaders(),
    },
  );

  return weeklyMenuSchema.parse(response.data);
}

export async function deleteWeeklyMenu(menuId: string): Promise<void> {
  await apiClient.delete(`/menus/weekly/${menuId}`, {
    headers: getCsrfHeaders(),
  });
}

export async function publishWeeklyMenu(
  menuId: string,
  payload: PublishWeeklyMenuPayload,
): Promise<PublishWeeklyMenuResponse> {
  const response = await apiClient.post<unknown>(
    `/menus/weekly/${menuId}/publish`,
    payload,
    {
      headers: getCsrfHeaders(),
    },
  );

  return publishWeeklyMenuResponseSchema.parse(response.data);
}
