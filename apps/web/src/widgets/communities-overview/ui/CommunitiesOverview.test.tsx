import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCommunities,
  useCommunityAdminOptions,
  useCommunitySchoolOptions,
} from '@/entities/community/api/CommunityQueries';
import { useCurrentUser } from '@/entities/session/api/SessionQueries';
import {
  useAddCommunitySchool,
  useCreateCommunity,
  useRemoveCommunitySchool,
  useUpdateCommunity,
} from '@/features/community-management/model/UseCommunityMutations';

import { CommunitiesOverview } from './CommunitiesOverview';

vi.mock('@/entities/community/api/CommunityQueries', () => ({
  useCommunities: vi.fn(),
  useCommunityAdminOptions: vi.fn(),
  useCommunitySchoolOptions: vi.fn(),
}));
vi.mock('@/entities/session/api/SessionQueries', () => ({
  useCurrentUser: vi.fn(),
}));
vi.mock('@/features/community-management/model/UseCommunityMutations', () => ({
  useAddCommunitySchool: vi.fn(),
  useCreateCommunity: vi.fn(),
  useRemoveCommunitySchool: vi.fn(),
  useUpdateCommunity: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const community = {
  id: 'community-id',
  code: 'community-a',
  name: 'Громада А',
  admin_owner_id: 'admin-id',
  admin_username: 'lower.admin',
  school_count: 1,
  created_at: '2026-09-14T10:00:00Z',
  updated_at: '2026-09-14T10:00:00Z',
};

describe('community management invariants', () => {
  const updateCommunity = vi.fn();

  beforeEach(() => {
    updateCommunity.mockReset();
    updateCommunity.mockResolvedValue(undefined);
    vi.mocked(useCommunities).mockReturnValue({
      data: { items: [community], total: 1, offset: 0, limit: 20 },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCommunities>);
    vi.mocked(useCommunityAdminOptions).mockReturnValue({
      data: [{ id: 'admin-id', username: 'lower.admin' }],
    } as unknown as ReturnType<typeof useCommunityAdminOptions>);
    vi.mocked(useCommunitySchoolOptions).mockReturnValue({
      data: [
        { id: 'school-a', name: 'Школа А', community: 'community-a' },
        { id: 'school-b', name: 'Школа Б', community: null },
      ],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCommunitySchoolOptions>);
    vi.mocked(useCreateCommunity).mockReturnValue({
      mutateAsync: vi.fn(),
    } as unknown as ReturnType<typeof useCreateCommunity>);
    vi.mocked(useUpdateCommunity).mockReturnValue({
      mutateAsync: updateCommunity,
    } as unknown as ReturnType<typeof useUpdateCommunity>);
    vi.mocked(useAddCommunitySchool).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useAddCommunitySchool>);
    vi.mocked(useRemoveCommunitySchool).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useRemoveCommunitySchool>);
  });

  it('keeps code readonly and omits it from update payload', async () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      data: {
        id: 'owner-id',
        username: 'owner',
        email: 'owner@example.com',
        role: 'OWNER',
        school_id: null,
        permissions: ['schools.manage'],
        is_active: true,
      },
    } as ReturnType<typeof useCurrentUser>);

    render(<CommunitiesOverview />);

    const codeInputs = screen.getAllByRole('textbox', { name: 'Код' });
    expect(codeInputs).toHaveLength(2);
    expect(codeInputs[0]).not.toHaveAttribute('readonly');
    expect(codeInputs[1]).toHaveAttribute('readonly');

    fireEvent.change(screen.getAllByRole('textbox', { name: 'Назва' })[1], {
      target: { value: 'Оновлена громада А' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() =>
      expect(updateCommunity).toHaveBeenCalledWith({
        name: 'Оновлена громада А',
        admin_owner_id: 'admin-id',
      })
    );
  });

  it('hides all mutation controls without schools.manage', () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      data: {
        id: 'technologist-id',
        username: 'technologist',
        email: 'technologist@example.com',
        role: 'TECHNOLOGIST',
        school_id: null,
        permissions: ['menus.manage', 'recipes.view', 'recipes.manage'],
        is_active: true,
      },
    } as ReturnType<typeof useCurrentUser>);

    render(<CommunitiesOverview />);

    expect(screen.queryByRole('button', { name: 'Створити громаду' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Зберегти' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Додати' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Вилучити/ })).not.toBeInTheDocument();
    expect(screen.getByText('Громада А')).toBeInTheDocument();
  });
});
