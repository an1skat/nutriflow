import { apiClient, getCsrfHeaders } from '@/shared/api/HttpClient';
import { toApiPaginationParams } from '@/shared/api/Pagination';

import {
  type GenerateMenuRequirementsPayload,
  type GenerateMenuRequirementsResponse,
  type MenuRequirement,
  type MenuRequirementCalendar,
  type MenuRequirementCalendarRequest,
  type MenuRequirementList,
  type MenuRequirementListRequest,
  type MenuRequirementReport,
  type MenuRequirementReportRequest,
  type UpdateMenuRequirementPayload,
  generateMenuRequirementsResponseSchema,
  menuRequirementCalendarSchema,
  menuRequirementListSchema,
  menuRequirementReportSchema,
  menuRequirementSchema,
} from '../model/MenuRequirement';

export async function fetchMenuRequirements(
  request: MenuRequirementListRequest
): Promise<MenuRequirementList> {
  const response = await apiClient.get<unknown>('/menu-requirements', {
    params: {
      ...toApiPaginationParams(request),
      weekly_menu_id: request.weekly_menu_id,
      school_group_id: request.school_group_id,
      service_date: request.service_date,
    },
  });
  return menuRequirementListSchema.parse(response.data);
}

export async function fetchMenuRequirement(requirementId: string): Promise<MenuRequirement> {
  const response = await apiClient.get<unknown>(`/menu-requirements/${requirementId}`);
  return menuRequirementSchema.parse(response.data);
}

export async function fetchMenuRequirementCalendar(
  request: MenuRequirementCalendarRequest
): Promise<MenuRequirementCalendar> {
  const response = await apiClient.get<unknown>('/menu-requirements/calendar', {
    params: {
      school_id: request.school_id,
      year: request.year,
      meal_type: request.meal_type,
      school_group_id: request.school_group_id,
    },
  });
  return menuRequirementCalendarSchema.parse(response.data);
}

export async function fetchMenuRequirementReport(
  request: MenuRequirementReportRequest
): Promise<MenuRequirementReport> {
  const response = await apiClient.get<unknown>('/menu-requirements/report', {
    params: {
      school_id: request.school_id,
      date_from: request.date_from,
      date_to: request.date_to,
      granularity: request.granularity,
      meal_type: request.meal_type,
      school_group_id: request.school_group_id,
    },
  });
  return menuRequirementReportSchema.parse(response.data);
}

export async function generateMenuRequirements(
  payload: GenerateMenuRequirementsPayload
): Promise<GenerateMenuRequirementsResponse> {
  const response = await apiClient.post<unknown>('/menu-requirements/generate', payload, {
    headers: getCsrfHeaders(),
  });
  return generateMenuRequirementsResponseSchema.parse(response.data);
}

export async function updateMenuRequirement(
  requirementId: string,
  payload: UpdateMenuRequirementPayload
): Promise<MenuRequirement> {
  const response = await apiClient.patch<unknown>(`/menu-requirements/${requirementId}`, payload, {
    headers: getCsrfHeaders(),
  });
  return menuRequirementSchema.parse(response.data);
}

export async function deleteMenuRequirement(requirementId: string): Promise<void> {
  await apiClient.delete(`/menu-requirements/${requirementId}`, {
    headers: getCsrfHeaders(),
  });
}
