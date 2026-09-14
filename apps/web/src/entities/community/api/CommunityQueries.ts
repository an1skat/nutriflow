'use client';

import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';

import type { PageRequest } from '@/shared/api/Pagination';

import {
  fetchCommunities,
  fetchCommunityAdminOptions,
  fetchCommunitySchoolOptions,
} from './CommunityApi';

export const communityQueryKeys = {
  all: ['protected', 'admin', 'communities'] as const,
  lists: () => [...communityQueryKeys.all, 'list'] as const,
  list: (request: PageRequest) => [...communityQueryKeys.lists(), request] as const,
  adminOptions: () => [...communityQueryKeys.all, 'admin-options'] as const,
  schoolOptions: () => [...communityQueryKeys.all, 'school-options'] as const,
};

export function communitiesQueryOptions(request: PageRequest) {
  return queryOptions({
    queryKey: communityQueryKeys.list(request),
    queryFn: () => fetchCommunities(request),
    placeholderData: keepPreviousData,
  });
}

export function useCommunities(request: PageRequest, enabled = true) {
  return useQuery({ ...communitiesQueryOptions(request), enabled });
}

export function useCommunityAdminOptions(enabled = true) {
  return useQuery({
    queryKey: communityQueryKeys.adminOptions(),
    queryFn: fetchCommunityAdminOptions,
    enabled,
  });
}

export function useCommunitySchoolOptions(enabled = true) {
  return useQuery({
    queryKey: communityQueryKeys.schoolOptions(),
    queryFn: fetchCommunitySchoolOptions,
    enabled,
  });
}
