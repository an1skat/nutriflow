"use client";

import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";

import type { PageRequest } from "@/shared/api/Pagination";

import {
  fetchAdminUser,
  fetchAdminUsers,
} from "./AdminUserApi";

export const adminUserQueryKeys = {
  all: ["protected", "admin", "admins"] as const,
  lists: () => [...adminUserQueryKeys.all, "list"] as const,
  list: (request: PageRequest) =>
    [...adminUserQueryKeys.lists(), request] as const,
  detail: (userId: string) =>
    [...adminUserQueryKeys.all, "detail", userId] as const,
};

export function adminUsersQueryOptions(request: PageRequest) {
  return queryOptions({
    queryKey: adminUserQueryKeys.list(request),
    queryFn: () => fetchAdminUsers(request),
    placeholderData: keepPreviousData,
  });
}

export function adminUserQueryOptions(userId: string) {
  return queryOptions({
    queryKey: adminUserQueryKeys.detail(userId),
    queryFn: () => fetchAdminUser(userId),
  });
}

export function useAdminUsers(request: PageRequest) {
  return useQuery(adminUsersQueryOptions(request));
}

export function useAdminUser(userId: string) {
  return useQuery(adminUserQueryOptions(userId));
}
