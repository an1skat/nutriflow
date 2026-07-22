'use client';

import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';

import type {
  MenuRequirementCalendarRequest,
  MenuRequirementListRequest,
  MenuRequirementReportRequest,
} from '../model/MenuRequirement';
import {
  fetchMenuRequirement,
  fetchMenuRequirementCalendar,
  fetchMenuRequirementReport,
  fetchMenuRequirements,
} from './MenuRequirementApi';

export const menuRequirementQueryKeys = {
  all: ['protected', 'menu-requirements'] as const,
  lists: () => [...menuRequirementQueryKeys.all, 'list'] as const,
  list: (request: MenuRequirementListRequest) =>
    [...menuRequirementQueryKeys.lists(), request] as const,
  detail: (requirementId: string) =>
    [...menuRequirementQueryKeys.all, 'detail', requirementId] as const,
  calendars: () => [...menuRequirementQueryKeys.all, 'calendar'] as const,
  calendar: (request: MenuRequirementCalendarRequest) =>
    [...menuRequirementQueryKeys.calendars(), request] as const,
  reports: () => [...menuRequirementQueryKeys.all, 'report'] as const,
  report: (request: MenuRequirementReportRequest) =>
    [...menuRequirementQueryKeys.reports(), request] as const,
};

export function menuRequirementsQueryOptions(request: MenuRequirementListRequest) {
  return queryOptions({
    queryKey: menuRequirementQueryKeys.list(request),
    queryFn: () => fetchMenuRequirements(request),
    enabled: request.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

export function menuRequirementQueryOptions(requirementId: string) {
  return queryOptions({
    queryKey: menuRequirementQueryKeys.detail(requirementId),
    queryFn: () => fetchMenuRequirement(requirementId),
    enabled: requirementId.length > 0,
  });
}

export function menuRequirementCalendarQueryOptions(request: MenuRequirementCalendarRequest) {
  return queryOptions({
    queryKey: menuRequirementQueryKeys.calendar(request),
    queryFn: () => fetchMenuRequirementCalendar(request),
    enabled: (request.enabled ?? true) && request.school_id.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function menuRequirementReportQueryOptions(request: MenuRequirementReportRequest) {
  return queryOptions({
    queryKey: menuRequirementQueryKeys.report(request),
    queryFn: () => fetchMenuRequirementReport(request),
    enabled:
      (request.enabled ?? true) &&
      request.school_id.length > 0 &&
      request.date_from.length > 0 &&
      request.date_to.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useMenuRequirements(request: MenuRequirementListRequest) {
  return useQuery(menuRequirementsQueryOptions(request));
}

export function useMenuRequirement(requirementId: string) {
  return useQuery(menuRequirementQueryOptions(requirementId));
}

export function useMenuRequirementCalendar(request: MenuRequirementCalendarRequest) {
  return useQuery(menuRequirementCalendarQueryOptions(request));
}

export function useMenuRequirementReport(request: MenuRequirementReportRequest) {
  return useQuery(menuRequirementReportQueryOptions(request));
}
