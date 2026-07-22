'use client';

import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';

import type { PageRequest } from '@/shared/api/Pagination';

import { fetchSchoolUser, fetchSchoolUsers } from './SchoolUserApi';

export const schoolUserQueryKeys = {
  all: ['protected', 'admin', 'school-users'] as const,
  school: (schoolId: string) => [...schoolUserQueryKeys.all, schoolId] as const,
  lists: (schoolId: string) => [...schoolUserQueryKeys.school(schoolId), 'list'] as const,
  list: (schoolId: string, request: PageRequest) =>
    [...schoolUserQueryKeys.lists(schoolId), request] as const,
  detail: (schoolId: string, userId: string) =>
    [...schoolUserQueryKeys.school(schoolId), 'detail', userId] as const,
};

export function schoolUsersQueryOptions(schoolId: string, request: PageRequest) {
  return queryOptions({
    queryKey: schoolUserQueryKeys.list(schoolId, request),
    queryFn: () => fetchSchoolUsers(schoolId, request),
    placeholderData: keepPreviousData,
  });
}

export function schoolUserQueryOptions(schoolId: string, userId: string) {
  return queryOptions({
    queryKey: schoolUserQueryKeys.detail(schoolId, userId),
    queryFn: () => fetchSchoolUser(schoolId, userId),
  });
}

export function useSchoolUsers(schoolId: string, request: PageRequest) {
  return useQuery(schoolUsersQueryOptions(schoolId, request));
}

export function useSchoolUser(schoolId: string, userId: string) {
  return useQuery(schoolUserQueryOptions(schoolId, userId));
}
