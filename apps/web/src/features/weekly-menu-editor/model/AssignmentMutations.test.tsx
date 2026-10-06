import { type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { cancelAssignment, publishWeeklyMenu } from '@/entities/weekly-menu/api/WeeklyMenuApi';
import { weeklyMenuQueryKeys } from '@/entities/weekly-menu/api/WeeklyMenuQueries';

import { useCancelAssignment, usePublishWeeklyMenu } from './UseWeeklyMenuMutations';

vi.mock('@/entities/weekly-menu/api/WeeklyMenuApi', () => ({
  cancelAssignment: vi.fn(),
  publishWeeklyMenu: vi.fn(),
}));

it.each(['replace', 'cancel'])(
  '%s refreshes active, history, detail and current week queries',
  async (action) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const keys = [
      weeklyMenuQueryKeys.list({ offset: 0, limit: 100, status: 'published' }),
      weeklyMenuQueryKeys.list({ offset: 0, limit: 100, status: 'revoked' }),
      weeklyMenuQueryKeys.detail('old'),
      weeklyMenuQueryKeys.currentWeekClosedDays('school'),
    ];
    for (const key of keys) client.setQueryData(key, { status: 'published' });
    vi.mocked(cancelAssignment).mockResolvedValue({ id: 'old', status: 'revoked' } as never);
    vi.mocked(publishWeeklyMenu).mockResolvedValue({
      created_menu_ids: ['new'],
      replaced_menu_ids: ['old'],
    } as never);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(
      () => ({ cancel: useCancelAssignment(), publish: usePublishWeeklyMenu('cycle') }),
      { wrapper }
    );
    await act(async () => {
      if (action === 'cancel')
        await hook.result.current.cancel.mutateAsync({ id: 'old', revision: 3 });
      else
        await hook.result.current.publish.mutateAsync({
          starts_on: '2026-10-05',
          replace_existing: true,
        });
    });
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    if (action === 'cancel')
      expect(client.getQueryData(keys[2])).toEqual({ id: 'old', status: 'revoked' });
    client.clear();
  }
);
