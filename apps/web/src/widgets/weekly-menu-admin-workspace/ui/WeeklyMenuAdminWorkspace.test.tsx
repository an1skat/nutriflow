import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { WeeklyMenuListRequest } from '@/entities/weekly-menu/model/WeeklyMenu';
import { ConfirmDialogProvider } from '@/shared/ui/ConfirmDialog';

import { WeeklyMenuAdminWorkspace } from './WeeklyMenuAdminWorkspace';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  cancel: vi.fn(),
  list: vi.fn(),
  copies: [] as Record<string, unknown>[],
}));
const cycle = {
  id: 'cycle',
  title: 'Правильний цикл',
  revision: 1,
  status: 'draft',
  days: [],
  updated_at: '2026-10-01',
  meal_type: 'lunch',
};
const instance = {
  ...cycle,
  id: 'instance',
  cycle_template_id: 'cycle',
  starts_on: '2026-10-05',
  ends_on: '2026-10-09',
};
const copy = {
  ...instance,
  id: 'old',
  school_id: 'school',
  source_menu_id: 'instance',
  title: 'Помилкове меню',
  status: 'published',
  revision: 3,
};
const unrelated = {
  ...copy,
  id: 'unrelated',
  source_menu_id: 'other-instance',
  title: 'Меню іншого тижня',
};
const result = {
  source_menu_id: 'instance',
  target_school_ids: ['school'],
  created_menu_ids: ['new'],
  replaced_menu_ids: ['old'],
  skipped_existing_school_ids: [],
};
const conflictError = {
  isAxiosError: true,
  response: {
    status: 409,
    data: {
      detail: {
        code: 'assignment_conflict',
        message: 'Конфлікт',
        conflicts: [
          {
            school_id: 'school',
            menu_id: 'old',
            revision: 3,
            existing_title: 'Помилкове меню',
            source_menu_id: 'wrong-instance',
            requested_title: 'Правильний цикл',
          },
        ],
      },
    },
  },
};
const legacyLabel = 'Оновлювати вже створені копії під час звичайної розсилки';

vi.mock('@/entities/session/api/SessionQueries', () => ({
  useCurrentUser: () => ({ data: { role: 'OWNER' } }),
}));
vi.mock('@/entities/school/api/SchoolQueries', () => ({
  schoolsQueryOptions: () => ({
    queryKey: ['test-schools'],
    queryFn: async () => ({
      items: [{ id: 'school', name: 'Академічний ліцей №4', is_active: true }],
    }),
  }),
}));
vi.mock('@/entities/community/api/CommunityQueries', () => ({
  useCommunities: () => ({ data: { items: [] } }),
}));
vi.mock('@/entities/menu-requirement/api/MenuRequirementQueries', () => ({
  menuRequirementCommunitiesQueryOptions: () => ({
    queryKey: ['test-communities'],
    queryFn: async () => [],
  }),
}));
vi.mock('@/features/access/model/AccessPolicy', () => ({ hasPermission: () => true }));
// Real query hooks and mutation callbacks: the mocked server filters by source and refetches after cancellation.
vi.mock('@/entities/weekly-menu/api/WeeklyMenuApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/weekly-menu/api/WeeklyMenuApi')>()),
  fetchWeeklyMenus: mocks.list,
  publishWeeklyMenu: mocks.publish,
  cancelAssignment: mocks.cancel,
}));
vi.mock('@/features/weekly-menu-editor/model/WeeklyMenuDraftStorage', () => ({
  loadWeeklyMenuDraft: () => null,
}));
vi.mock('@/features/weekly-menu-editor/model/WeeklyMenuFormSchema', () => ({
  weeklyMenuToFormValues: (menu: { title: string }) => ({ title: menu.title }),
  createBlankWeeklyMenuFormValues: () => ({}),
  formValuesToWeeklyMenuPayload: () => ({}),
}));
vi.mock('@/features/weekly-menu-editor/ui/WeeklyMenuEditorForm', () => ({
  WeeklyMenuEditorForm: ({ initialValues }: { initialValues: { title: string } }) => (
    <div data-testid="editor-cycle">{initialValues.title}</div>
  ),
}));
vi.mock('@/features/weekly-menu-excel/ui/WeeklyMenuExcelTools', () => ({
  WeeklyMenuExcelTools: () => null,
}));
vi.mock('./WeeklyMenuPicker', () => ({ WeeklyMenuPicker: () => null }));
vi.mock('@/features/weekly-menu-editor/model/UseWeeklyMenuMutations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/weekly-menu-editor/model/UseWeeklyMenuMutations')
  >()),
  useCreateWeeklyMenu: () => ({ isPending: false }),
  useUpdateWeeklyMenu: () => ({ isPending: false }),
  useArchiveWeeklyMenu: () => ({ isPending: false }),
  useRevokeWeeklyMenus: () => ({ isPending: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.copies = [];
  mocks.list.mockImplementation(async (request: WeeklyMenuListRequest) => ({
    items: request.template_only
      ? [cycle]
      : request.instances_only
        ? [instance]
        : mocks.copies.filter(
            (menu) =>
              menu.status === request.status && menu.source_menu_id === request.source_menu_id
          ),
    total: 0,
    offset: 0,
    limit: 100,
  }));
  mocks.publish.mockReset();
  mocks.publish.mockRejectedValueOnce(conflictError).mockResolvedValue(result);
  mocks.cancel.mockReset();
  mocks.cancel.mockImplementation(async (id: string) => {
    mocks.copies = mocks.copies.filter((menu) => menu.id !== id);
    return { ...copy, status: 'revoked' };
  });
});

async function renderWorkspace() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ConfirmDialogProvider>
        <WeeklyMenuAdminWorkspace />
      </ConfirmDialogProvider>
    </QueryClientProvider>
  );
  await screen.findByRole('button', { name: 'Призначити цикл на тиждень' });
  await waitFor(() => expect(screen.getByTestId('editor-cycle')).toHaveTextContent(cycle.title));
  await screen.findByLabelText('Академічний ліцей №4');
  return client;
}

function startAssignment() {
  fireEvent.change(screen.getByLabelText('Початок тижня (понеділок)'), {
    target: { value: '2026-10-05' },
  });
  fireEvent.click(screen.getByLabelText('Академічний ліцей №4'));
  fireEvent.click(screen.getByRole('button', { name: 'Призначити цикл на тиждень' }));
}

async function openAssignment() {
  await renderWorkspace();
  startAssignment();
  return screen.findByRole('dialog');
}

it('separates calendar assignment controls from the legacy distribution checkbox', async () => {
  await renderWorkspace();
  const calendar = screen.getByRole('region', { name: 'Призначити цей цикл на новий тиждень' });
  const distribution = screen.getByRole('region', { name: 'Звичайна розсилка' });
  expect(within(calendar).getByLabelText('Початок тижня (понеділок)')).toBeInTheDocument();
  expect(within(calendar).getByLabelText('Академічний ліцей №4')).toBeInTheDocument();
  expect(
    within(calendar).getByRole('button', { name: 'Призначити цикл на тиждень' })
  ).toBeInTheDocument();
  expect(within(calendar).queryByLabelText(legacyLabel)).not.toBeInTheDocument();
  expect(within(distribution).getByLabelText(legacyLabel)).toBeChecked();
  expect(
    within(distribution).getByRole('button', { name: 'Розіслати школам' })
  ).toBeInTheDocument();
});

it('shows Ukrainian conflict details and sends reject by default', async () => {
  const dialog = await openAssignment();
  expect(within(dialog).getByText('На цей тиждень уже призначено інше меню')).toBeInTheDocument();
  expect(within(dialog).getByText('Було: Помилкове меню')).toBeInTheDocument();
  expect(within(dialog).getByText('Буде: Правильний цикл')).toBeInTheDocument();
  expect(mocks.publish).toHaveBeenCalledWith('cycle', {
    school_ids: ['school'],
    replace_existing: false,
    starts_on: '2026-10-05',
  });
});

it('dismissing replacement performs no replacement mutation', async () => {
  const dialog = await openAssignment();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Скасувати' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mocks.publish).toHaveBeenCalledTimes(1);
});

it.each([true, false])(
  'calendar replacement requires confirmation regardless of legacy checkbox=%s',
  async (checked) => {
    await renderWorkspace();
    if (!checked) fireEvent.click(screen.getByLabelText(legacyLabel));
    startAssignment();
    const dialog = await screen.findByRole('dialog');
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(mocks.publish).toHaveBeenLastCalledWith('cycle', {
      school_ids: ['school'],
      starts_on: '2026-10-05',
      replace_existing: false,
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Замінити призначення' }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(2));
    expect(mocks.publish).toHaveBeenLastCalledWith('cycle', {
      school_ids: ['school'],
      starts_on: '2026-10-05',
      replace_existing: true,
      expected_conflicts: [{ school_id: 'school', menu_id: 'old', revision: 3 }],
    });
  }
);

it.each([true, false])(
  'legacy distribution still uses its checkbox=%s and no calendar date',
  async (checked) => {
    mocks.publish.mockReset();
    mocks.publish.mockResolvedValue(result);
    await renderWorkspace();
    if (!checked) fireEvent.click(screen.getByLabelText(legacyLabel));
    fireEvent.change(screen.getByLabelText('Початок тижня (понеділок)'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.click(screen.getByLabelText('Академічний ліцей №4'));
    fireEvent.click(screen.getByRole('button', { name: 'Розіслати школам' }));
    await waitFor(() =>
      expect(mocks.publish).toHaveBeenCalledWith('cycle', {
        school_ids: ['school'],
        replace_existing: checked,
        starts_on: undefined,
      })
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  }
);

it.each(['fresh', 'replacement'])(
  'selects the used instance after %s assignment and keeps the cycle editor',
  async (action) => {
    mocks.copies = [copy, unrelated];
    if (action === 'fresh') {
      mocks.publish.mockReset();
      mocks.publish.mockResolvedValue(result);
    }
    await renderWorkspace();
    expect(screen.queryByRole('button', { name: 'Скасувати призначення' })).not.toBeInTheDocument();
    startAssignment();
    if (action === 'replacement') {
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Замінити призначення' }));
    }
    await screen.findByRole('button', { name: 'Скасувати призначення' });
    expect(screen.getByRole('button', { name: /Переглянути призначення/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('editor-cycle')).toHaveTextContent(cycle.title);
    expect(screen.queryByText(/Меню іншого тижня/)).not.toBeInTheDocument();
  }
);

it.each(['Назад', 'Скасувати призначення'])(
  'filters copies by selected instance and handles cancellation: %s',
  async (action) => {
    mocks.copies = [copy, unrelated];
    const client = await renderWorkspace();
    expect(screen.queryByRole('button', { name: 'Скасувати призначення' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Переглянути призначення/ }));
    const cancelButton = await screen.findByRole('button', { name: 'Скасувати призначення' });
    expect(screen.getByText(/Помилкове меню/)).toBeInTheDocument();
    expect(screen.queryByText(/Меню іншого тижня/)).not.toBeInTheDocument();
    fireEvent.click(cancelButton);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Скасувати призначення?')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/сформовані вимоги залишаться збереженими/)
    ).toBeInTheDocument();
    const readsBeforeCancel = mocks.list.mock.calls.filter(
      ([request]) => request.source_menu_id === 'instance' && request.status === 'published'
    ).length;
    fireEvent.click(within(dialog).getByRole('button', { name: action }));
    if (action === 'Назад') {
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mocks.cancel).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Скасувати призначення' })).toBeInTheDocument();
    } else {
      await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith('old', 3));
      expect(
        client
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.variables)
      ).toContainEqual({ id: 'old', revision: 3 });
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: 'Скасувати призначення' })
        ).not.toBeInTheDocument()
      );
      expect(
        mocks.list.mock.calls.filter(
          ([request]) => request.source_menu_id === 'instance' && request.status === 'published'
        ).length
      ).toBeGreaterThan(readsBeforeCancel);
      expect(mocks.copies).toEqual([unrelated]);
      expect(screen.queryByText(/Помилкове меню/)).not.toBeInTheDocument();
    }
  }
);
