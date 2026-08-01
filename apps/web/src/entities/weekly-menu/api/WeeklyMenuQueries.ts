'use client';

import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';

import type { WeeklyMenuListRequest } from '../model/WeeklyMenu';
import { fetchCurrentWeekClosedDays, fetchWeeklyMenu, fetchWeeklyMenus } from './WeeklyMenuApi';

export const weeklyMenuQueryKeys = {
  all: ['protected', 'weekly-menus'] as const,
  lists: () => [...weeklyMenuQueryKeys.all, 'list'] as const,
  list: (request: WeeklyMenuListRequest) => [...weeklyMenuQueryKeys.lists(), request] as const,
  detail: (menuId: string) => [...weeklyMenuQueryKeys.all, 'detail', menuId] as const,
  currentWeekClosedDays: (schoolId: string) =>
    [...weeklyMenuQueryKeys.all, 'current-week-closed-days', schoolId] as const,
};

export function weeklyMenusQueryOptions(request: WeeklyMenuListRequest) {
  return queryOptions({
    queryKey: weeklyMenuQueryKeys.list(request),
    queryFn: () => fetchWeeklyMenus(request),
    enabled: request.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

export function weeklyMenuQueryOptions(menuId: string) {
  return queryOptions({
    queryKey: weeklyMenuQueryKeys.detail(menuId),
    queryFn: () => fetchWeeklyMenu(menuId),
    enabled: menuId.length > 0,
  });
}

export function useWeeklyMenus(request: WeeklyMenuListRequest) {
  return useQuery(weeklyMenusQueryOptions(request));
}

export function useWeeklyMenu(menuId: string) {
  return useQuery(weeklyMenuQueryOptions(menuId));
}

export function useCurrentWeekClosedDays(schoolId: string) {
  return useQuery({
    queryKey: weeklyMenuQueryKeys.currentWeekClosedDays(schoolId),
    queryFn: () => fetchCurrentWeekClosedDays(schoolId),
    enabled: schoolId.length > 0,
  });
}
