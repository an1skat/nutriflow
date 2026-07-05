"use client";

import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";

import type { PageRequest } from "@/shared/api/Pagination";

import {
  fetchAdminSchoolGroups,
  fetchOwnSchoolGroups,
} from "./SchoolGroupApi";

export const schoolGroupQueryKeys = {
  all: ["protected", "school-groups"] as const,
  adminSchool: (schoolId: string) =>
    [...schoolGroupQueryKeys.all, "admin", schoolId] as const,
  adminLists: (schoolId: string) =>
    [...schoolGroupQueryKeys.adminSchool(schoolId), "list"] as const,
  adminList: (schoolId: string, request: PageRequest) =>
    [...schoolGroupQueryKeys.adminLists(schoolId), request] as const,
  own: () => [...schoolGroupQueryKeys.all, "own"] as const,
  ownLists: () => [...schoolGroupQueryKeys.own(), "list"] as const,
  ownList: (request: PageRequest) =>
    [...schoolGroupQueryKeys.ownLists(), request] as const,
};

export function adminSchoolGroupsQueryOptions(
  schoolId: string,
  request: PageRequest,
) {
  return queryOptions({
    queryKey: schoolGroupQueryKeys.adminList(schoolId, request),
    queryFn: () => fetchAdminSchoolGroups(schoolId, request),
    placeholderData: keepPreviousData,
  });
}

export function ownSchoolGroupsQueryOptions(request: PageRequest) {
  return queryOptions({
    queryKey: schoolGroupQueryKeys.ownList(request),
    queryFn: () => fetchOwnSchoolGroups(request),
    placeholderData: keepPreviousData,
  });
}

export function useAdminSchoolGroups(
  schoolId: string,
  request: PageRequest,
) {
  return useQuery(adminSchoolGroupsQueryOptions(schoolId, request));
}

export function useOwnSchoolGroups(request: PageRequest) {
  return useQuery(ownSchoolGroupsQueryOptions(request));
}

export function useSchoolGroups(
  scope:
    | {
        mode: "admin";
        schoolId: string;
      }
    | {
        mode: "own";
      },
  request: PageRequest,
) {
  return useQuery({
    queryKey:
      scope.mode === "admin"
        ? schoolGroupQueryKeys.adminList(scope.schoolId, request)
        : schoolGroupQueryKeys.ownList(request),
    queryFn: () =>
      scope.mode === "admin"
        ? fetchAdminSchoolGroups(scope.schoolId, request)
        : fetchOwnSchoolGroups(request),
    placeholderData: keepPreviousData,
  });
}
