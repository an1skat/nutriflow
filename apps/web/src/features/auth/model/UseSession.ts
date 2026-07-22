'use client';

import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { getCurrentUser, loginSession, logoutSession } from '@/entities/session/api/SessionApi';
import { sessionQueryKeys } from '@/entities/session/api/SessionQueries';
import type { AuthUser } from '@/entities/session/model/Session';

export function replaceAuthenticatedUser(queryClient: QueryClient, user: AuthUser | null): void {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] === 'protected',
  });
  queryClient.setQueryData(sessionQueryKeys.currentUser(), user);
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Parameters<typeof loginSession>[0]) => {
      await loginSession(input);

      const user = await getCurrentUser();

      if (!user) {
        throw new Error('Сервер не підтвердив створену сесію.');
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
