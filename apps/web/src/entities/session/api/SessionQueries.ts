"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";

import { getCurrentUser } from "./SessionApi";

export const sessionQueryKeys = {
  all: ["auth"] as const,
  currentUser: () => [...sessionQueryKeys.all, "me"] as const,
};

export function currentUserQueryOptions() {
  return queryOptions({
    queryKey: sessionQueryKeys.currentUser(),
    queryFn: getCurrentUser,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

export function useCurrentUser() {
  return useQuery(currentUserQueryOptions());
}
