"use client";

import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";

import {
  fetchWeeklyMenu,
  fetchWeeklyMenus,
} from "./WeeklyMenuApi";
import type { WeeklyMenuListRequest } from "../model/WeeklyMenu";

export const weeklyMenuQueryKeys = {
  all: ["protected", "weekly-menus"] as const,
  lists: () => [...weeklyMenuQueryKeys.all, "list"] as const,
  list: (request: WeeklyMenuListRequest) =>
    [...weeklyMenuQueryKeys.lists(), request] as const,
  detail: (menuId: string) =>
    [...weeklyMenuQueryKeys.all, "detail", menuId] as const,
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
