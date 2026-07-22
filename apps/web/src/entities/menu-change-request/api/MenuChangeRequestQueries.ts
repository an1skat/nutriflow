'use client';

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  type MenuChangeRequestListRequest,
  fetchMenuChangeRequest,
  fetchMenuChangeRequestSchools,
  fetchMenuChangeRequests,
  markMenuChangeRequestReviewed,
} from './MenuChangeRequestApi';

export const menuChangeRequestQueryKeys = {
  all: ['protected', 'menu-change-requests'] as const,
  lists: () => [...menuChangeRequestQueryKeys.all, 'list'] as const,
  list: (request: MenuChangeRequestListRequest) =>
    [...menuChangeRequestQueryKeys.lists(), request] as const,
  details: () => [...menuChangeRequestQueryKeys.all, 'detail'] as const,
  detail: (requestId: string) => [...menuChangeRequestQueryKeys.details(), requestId] as const,
  schools: () => [...menuChangeRequestQueryKeys.all, 'schools'] as const,
};

export function menuChangeRequestsQueryOptions(request: MenuChangeRequestListRequest) {
  return queryOptions({
    queryKey: menuChangeRequestQueryKeys.list(request),
    queryFn: () => fetchMenuChangeRequests(request),
  });
}

export function useMenuChangeRequests(request: MenuChangeRequestListRequest, enabled = true) {
  return useQuery({
    ...menuChangeRequestsQueryOptions(request),
    enabled,
  });
}

export function useMenuChangeRequest(requestId: string | null) {
  return useQuery({
    queryKey: menuChangeRequestQueryKeys.detail(requestId ?? ''),
    queryFn: () => fetchMenuChangeRequest(requestId ?? ''),
    enabled: requestId !== null,
  });
}

export function useMenuChangeRequestSchools() {
  return useQuery({
    queryKey: menuChangeRequestQueryKeys.schools(),
    queryFn: fetchMenuChangeRequestSchools,
  });
}

export function useMarkMenuChangeRequestReviewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) => markMenuChangeRequestReviewed(requestId),
    onSuccess: async (request) => {
      queryClient.setQueryData(menuChangeRequestQueryKeys.detail(request.id), request);
      await queryClient.invalidateQueries({
        queryKey: menuChangeRequestQueryKeys.lists(),
      });
      await queryClient.invalidateQueries({
        queryKey: menuChangeRequestQueryKeys.schools(),
      });
    },
  });
}
