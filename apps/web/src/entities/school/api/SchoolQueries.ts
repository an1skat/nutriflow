'use client';

import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';

import type { PageRequest } from '@/shared/api/Pagination';

import { fetchSchool, fetchSchools } from './SchoolApi';

export const schoolQueryKeys = {
  all: ['protected', 'admin', 'schools'] as const,
  lists: () => [...schoolQueryKeys.all, 'list'] as const,
  list: (request: PageRequest) => [...schoolQueryKeys.lists(), request] as const,
  scope: (schoolId: string) => ['protected', 'admin', 'school', schoolId] as const,
  detail: (schoolId: string) => [...schoolQueryKeys.scope(schoolId), 'detail'] as const,
};

export function schoolsQueryOptions(request: PageRequest) {
  return queryOptions({
    queryKey: schoolQueryKeys.list(request),
    queryFn: () => fetchSchools(request),
    placeholderData: keepPreviousData,
  });
}

export function schoolQueryOptions(schoolId: string) {
  return queryOptions({
    queryKey: schoolQueryKeys.detail(schoolId),
    queryFn: () => fetchSchool(schoolId),
  });
}

export function useSchools(request: PageRequest, enabled = true) {
  return useQuery({
    ...schoolsQueryOptions(request),
    enabled,
  });
}

export function useSchool(schoolId: string) {
  return useQuery(schoolQueryOptions(schoolId));
}
