"use client";

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  fetchMenuChangeRequests,
  markMenuChangeRequestReviewed,
  type MenuChangeRequestListRequest,
} from "./MenuChangeRequestApi";

export const menuChangeRequestQueryKeys = {
  all: ["protected", "menu-change-requests"] as const,
  lists: () => [...menuChangeRequestQueryKeys.all, "list"] as const,
  list: (request: MenuChangeRequestListRequest) =>
    [...menuChangeRequestQueryKeys.lists(), request] as const,
};

export function menuChangeRequestsQueryOptions(
  request: MenuChangeRequestListRequest,
) {
  return queryOptions({
    queryKey: menuChangeRequestQueryKeys.list(request),
    queryFn: () => fetchMenuChangeRequests(request),
  });
}

export function useMenuChangeRequests(request: MenuChangeRequestListRequest) {
  return useQuery(menuChangeRequestsQueryOptions(request));
}

export function useMarkMenuChangeRequestReviewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (requestId: string) => markMenuChangeRequestReviewed(requestId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: menuChangeRequestQueryKeys.lists(),
      });
    },
  });
}
