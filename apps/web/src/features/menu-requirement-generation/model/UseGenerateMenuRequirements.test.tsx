import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useGenerateMenuRequirements } from './UseGenerateMenuRequirements';

vi.mock('@/entities/menu-requirement/api/MenuRequirementApi', () => ({
  generateMenuRequirements: async () => ({ items: [] }),
}));

it('zero-result generation refreshes revision, stale markers and downstream reports', async () => {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(useGenerateMenuRequirements, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await act(async () => {
    await result.current.mutateAsync({
      weekly_menu_id: 'menu',
      weekday: 'monday',
      service_date: '2026-07-06',
    });
  });
  for (const key of ['weekly-menus', 'daily-menu-management', 'norm-compliance']) {
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['protected', key] });
  }
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['protected', 'menu-requirements', 'calendar'],
  });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['protected', 'menu-requirements', 'report'],
  });
});
