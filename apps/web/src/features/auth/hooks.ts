"use client";

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { getCurrentUser, loginSession, logoutSession } from "./api";
import type { AuthUser } from "./model";

export const authKeys = {
  all: ["auth"] as const,
  me: () => ["auth", "me"] as const,
};

export function currentUserQueryOptions() {
  return queryOptions({
    queryKey: authKeys.me(),
    queryFn: getCurrentUser,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

export function replaceAuthenticatedUser(
  queryClient: QueryClient,
  user: AuthUser | null,
): void {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] === "protected",
  });
  queryClient.setQueryData(authKeys.me(), user);
}

export function useCurrentUser() {
  return useQuery(currentUserQueryOptions());
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Parameters<typeof loginSession>[0]) => {
      await loginSession(input);

      const user = await getCurrentUser();

      if (!user) {
        throw new Error("Сервер не підтвердив створену сесію.");
      }

      return user;
    },
    onSuccess: (user) => {
      replaceAuthenticatedUser(queryClient, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutSession,
    onSuccess: () => {
      replaceAuthenticatedUser(queryClient, null);
    },
  });
}
