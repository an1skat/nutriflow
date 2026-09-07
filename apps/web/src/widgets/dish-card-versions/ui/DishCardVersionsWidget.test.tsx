import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDishCard, useDishCardVersions } from '@/entities/recipe/api/RecipeQueries';
import { useCurrentUser } from '@/entities/session/api/SessionQueries';
import { useSetMainDishCardVersion } from '@/features/recipe-management/model/UseRecipeMutations';

import { DishCardVersionsWidget } from './DishCardVersionsWidget';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
}));

vi.mock('@/entities/recipe/api/RecipeQueries', () => ({
  useDishCard: vi.fn(),
  useDishCardVersions: vi.fn(),
}));

vi.mock('@/entities/session/api/SessionQueries', () => ({
  useCurrentUser: vi.fn(),
}));

vi.mock('@/features/recipe-management/model/UseRecipeMutations', () => ({
  useSetMainDishCardVersion: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const dishCard = {
  id: 'card-1',
  card_number: '1.1',
  name: 'Суп',
  category: 'Перші страви',
  source: null,
  is_active: true,
  current_version_id: 'version-2',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

const versions = ['confirmed', 'confirmed', 'draft'].map((status, index) => ({
  id: `version-${index + 1}`,
  dish_card_id: dishCard.id,
  version: index + 1,
  status,
  source_import_id: null,
  source_file_name: null,
  source_page: null,
  recognized_warnings: [],
  recognition_errors: [],
  allergen_ids: [],
  technology_text: null,
  portion_variants: [],
  ingredient_amounts: [],
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  created_by: null,
}));

function mockUser(role: 'OWNER' | 'ADMIN' | 'TECHNOLOGIST') {
  vi.mocked(useCurrentUser).mockReturnValue({
    data: {
      id: 'user-1',
      username: 'user',
      email: 'user@example.com',
      role,
      school_id: null,
      permissions: role === 'ADMIN' ? ['recipes.manage'] : [],
      is_active: true,
    },
  } as unknown as ReturnType<typeof useCurrentUser>);
}

describe('DishCardVersionsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDishCard).mockReturnValue({
      data: dishCard,
      error: null,
      isError: false,
      isPending: false,
    } as unknown as ReturnType<typeof useDishCard>);
    vi.mocked(useDishCardVersions).mockReturnValue({
      data: { items: versions, total: versions.length, offset: 0, limit: 50 },
      error: null,
      isError: false,
      isPending: false,
    } as unknown as ReturnType<typeof useDishCardVersions>);
    vi.mocked(useSetMainDishCardVersion).mockReturnValue({
      isPending: false,
      mutateAsync: mocks.mutateAsync,
    } as unknown as ReturnType<typeof useSetMainDishCardVersion>);
    mocks.mutateAsync.mockResolvedValue(dishCard);
  });

  it.each(['OWNER', 'TECHNOLOGIST'] as const)(
    'lets %s select another confirmed version',
    async (role) => {
      mockUser(role);
      render(<DishCardVersionsWidget dishCardId={dishCard.id} />);

      expect(screen.getByText('Основна')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Зробити основною' })).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: 'Зробити основною' }));

      await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith('version-1'));
    }
  );

  it('does not offer the action to an administrator', () => {
    mockUser('ADMIN');
    render(<DishCardVersionsWidget dishCardId={dishCard.id} />);

    expect(screen.queryByRole('button', { name: 'Зробити основною' })).not.toBeInTheDocument();
  });
});
