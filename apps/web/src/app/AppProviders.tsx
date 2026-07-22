'use client';

import { type ReactNode, useEffect, useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';

import { replaceAuthenticatedUser } from '@/features/auth/model/UseSession';
import { subscribeToSessionExpired } from '@/shared/api/HttpClient';
import { ConfirmDialogProvider } from '@/shared/ui/ConfirmDialog';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
          mutations: {
            retry: false,
          },
        },
      })
  );

  useEffect(
    () =>
      subscribeToSessionExpired(() => {
        replaceAuthenticatedUser(queryClient, null);
      }),
    [queryClient]
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          duration: 5000,
          className: 'font-sans',
        }}
      />
      {process.env.NODE_ENV === 'development' ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
