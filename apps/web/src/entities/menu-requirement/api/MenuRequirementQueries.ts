"use client";

import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";

import type { MenuRequirementListRequest } from "../model/MenuRequirement";
import {
  fetchMenuRequirement,
  fetchMenuRequirements,
} from "./MenuRequirementApi";

export const menuRequirementQueryKeys = {
  all: ["protected", "menu-requirements"] as const,
  lists: () => [...menuRequirementQueryKeys.all, "list"] as const,
  list: (request: MenuRequirementListRequest) =>
    [...menuRequirementQueryKeys.lists(), request] as const,
  detail: (requirementId: string) =>
    [...menuRequirementQueryKeys.all, "detail", requirementId] as const,
};

export function menuRequirementsQueryOptions(
  request: MenuRequirementListRequest,
) {
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

export function useMenuRequirements(request: MenuRequirementListRequest) {
  return useQuery(menuRequirementsQueryOptions(request));
}

export function useMenuRequirement(requirementId: string) {
  return useQuery(menuRequirementQueryOptions(requirementId));
}
