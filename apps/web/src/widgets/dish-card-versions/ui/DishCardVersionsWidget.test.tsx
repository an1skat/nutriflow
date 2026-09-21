import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchDishCard,
  fetchDishCardVersions,
  setMainDishCardVersion,
} from '@/entities/recipe/api/RecipeApi';
import { useCurrentUser } from '@/entities/session/api/SessionQueries';

import { DishCardVersionsWidget } from './DishCardVersionsWidget';

vi.mock('@/entities/recipe/api/RecipeApi', () => ({
  fetchDishCard: vi.fn(),
  fetchDishCardVersions: vi.fn(),
  setMainDishCardVersion: vi.fn(),
}));

vi.mock('@/entities/session/api/SessionQueries', () => ({
  useCurrentUser: vi.fn(),
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

const versions = ['confirmed', 'confirmed', 'draft', 'import_preview', 'archived'].map(
  (status, index) => ({
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
  })
);

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

function renderWidget() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DishCardVersionsWidget dishCardId={dishCard.id} />
    </QueryClientProvider>
  );
}

describe('DishCardVersionsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let currentCard = { ...dishCard };
    vi.mocked(fetchDishCard).mockImplementation(async () => currentCard);
    vi.mocked(fetchDishCardVersions).mockResolvedValue({
      items: versions,
      total: versions.length,
      offset: 0,
      limit: 50,
    } as Awaited<ReturnType<typeof fetchDishCardVersions>>);
    vi.mocked(setMainDishCardVersion).mockImplementation(async (versionId) => {
      currentCard = { ...currentCard, current_version_id: versionId };
      return currentCard;
    });
  });

  it.each(['OWNER', 'TECHNOLOGIST'] as const)(
    'lets %s select confirmed and draft versions with refetch',
    async (role) => {
      mockUser(role);
      renderWidget();
      await screen.findByText('Основна');
      const row = (label: string) => within(screen.getByText(label).closest('tr')!);
      expect(screen.getAllByRole('button', { name: 'Зробити основною' })).toHaveLength(2);
      fireEvent.click(row('v1').getByRole('button', { name: 'Зробити основною' }));
      await waitFor(() => expect(row('v1').getByText('Основна')).toBeInTheDocument());
      expect(setMainDishCardVersion).toHaveBeenCalledWith('version-1');
      expect(row('v1').getByText('Підтверджено')).toBeInTheDocument();
      expect(row('v2').queryByText('Основна')).not.toBeInTheDocument();

      fireEvent.click(row('v3').getByRole('button', { name: 'Зробити основною' }));
      await waitFor(() => expect(row('v3').getByText('Основна')).toBeInTheDocument());
      expect(setMainDishCardVersion).toHaveBeenCalledWith('version-3');
      expect(row('v3').getByText('Чернетка')).toBeInTheDocument();
      expect(row('v1').queryByText('Основна')).not.toBeInTheDocument();
      expect(fetchDishCard).toHaveBeenCalledTimes(3);
      for (const label of ['v4', 'v5']) {
        expect(row(label).queryByRole('button')).not.toBeInTheDocument();
      }
    }
  );

  it('does not offer the action to an administrator', async () => {
    mockUser('ADMIN');
    renderWidget();
    await screen.findByText('Основна');
    expect(screen.queryByRole('button', { name: 'Зробити основною' })).not.toBeInTheDocument();
  });
});
