'use client';

import { useState } from 'react';

import Link from 'next/link';

import { toast } from 'sonner';

import { useSchoolUsers } from '@/entities/school-user/api/SchoolUserQueries';
import { useSchool } from '@/entities/school/api/SchoolQueries';
import { useWeeklyMenus } from '@/entities/weekly-menu/api/WeeklyMenuQueries';
import type { WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';
import { EditSchoolForm } from '@/features/school-management/ui/EditSchoolForm';
import { CreateSchoolUserForm } from '@/features/school-user-management/ui/CreateSchoolUserForm';
import { useRevokeWeeklyMenu } from '@/features/weekly-menu-editor/model/UseWeeklyMenuMutations';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { formatDate } from '@/shared/lib/FormatDate';
import { useConfirm } from '@/shared/ui/ConfirmDialog';
import { PaginationControls } from '@/shared/ui/PaginationControls';
import { RequestError } from '@/shared/ui/RequestError';
import { StatusBadge } from '@/shared/ui/StatusBadge';
import { SchoolGroupsPanel } from '@/widgets/school-groups/ui/SchoolGroupsPanel';

import { SchoolMenuPreviewDialog } from './SchoolMenuPreviewDialog';

const PAGE_SIZE = 20;

export function SchoolDetails({ schoolId }: { schoolId: string }) {
  const school = useSchool(schoolId);
  const [offset, setOffset] = useState(0);
  const users = useSchoolUsers(schoolId, {
    offset,
    limit: PAGE_SIZE,
  });

  if (school.isPending) {
    return (
      <main className="nf-page">
        <p role="status" className="text-sm text-slate-600">
          Завантажуємо школу…
        </p>
      </main>
    );
  }

  if (school.isError) {
    return (
      <main className="nf-page">
        <RequestError error={school.error} onRetry={() => void school.refetch()} />
      </main>
    );
  }

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <Link href="/admin/schools" className="nf-link text-xs">
          ← До списку шкіл
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div>
            <p className="nf-eyebrow">Картка школи</p>
            <h1 className="nf-title">{school.data.name}</h1>
          </div>
          <StatusBadge isActive={school.data.is_active} />
        </div>
        <p className="nf-description">
          Код: <code>{school.data.code}</code> · Створено {formatDate(school.data.created_at)}
        </p>
      </header>

      <section className="nf-panel">
        <div className="nf-panel-header">
          <h2 className="nf-panel-title">Параметри школи</h2>
        </div>
        <div className="nf-panel-body">
          <EditSchoolForm school={school.data} />
        </div>
      </section>

      <details className="mt-5">
        <summary className="cursor-pointer border border-[var(--nf-line-strong)] bg-[var(--nf-panel-head)] px-4 py-3 text-sm font-bold text-slate-900">
          Групи школи
        </summary>
        <SchoolGroupsPanel mode="admin" schoolId={schoolId} />
      </details>

      <SchoolMenusPanel schoolId={schoolId} />

      <section className="nf-panel mt-5">
        <div className="nf-panel-header">
          <h2 className="nf-panel-title">Додати користувача школи</h2>
        </div>
        <div className="nf-panel-body">
          {school.data.is_active ? (
            <CreateSchoolUserForm schoolId={schoolId} />
          ) : (
            <p className="text-sm text-amber-800">
              Спочатку активуйте школу, щоб додавати користувачів.
            </p>
          )}
        </div>
      </section>

      <section className="nf-panel mt-5">
        <div className="nf-panel-header">
          <div>
            <h2 className="nf-panel-title">Користувачі</h2>
            {users.data ? (
              <p className="mt-0.5 text-xs text-slate-600">Записів: {users.data.total}</p>
            ) : null}
          </div>
        </div>

        <div className="nf-panel-body">
          {users.isPending ? (
            <p role="status" className="text-sm text-slate-600">
              Завантажуємо користувачів…
            </p>
          ) : null}
          {users.isError ? (
            <RequestError error={users.error} onRetry={() => void users.refetch()} />
          ) : null}
          {users.data?.items.length === 0 ? (
            <div className="nf-empty">Користувачів за цими параметрами немає.</div>
          ) : null}
          {users.data?.items.length ? (
            <div className="nf-table-wrap">
              <table className="nf-table">
                <thead>
                  <tr>
                    <th>Логін</th>
                    <th>Email</th>
                    <th className="w-36">Статус</th>
                    <th className="w-52">Оновлено</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <Link
                          href={`/admin/schools/${schoolId}/users/${user.id}`}
                          className="nf-link"
                        >
                          {user.username}
                        </Link>
                      </td>
                      <td>{user.email ?? 'Не вказано'}</td>
                      <td>
                        <StatusBadge
                          isActive={user.is_active}
                          activeLabel="Активний"
                          inactiveLabel="Неактивний"
                        />
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-600">
                        {formatDate(user.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {users.data ? (
            <PaginationControls
              offset={offset}
              limit={PAGE_SIZE}
              total={users.data.total}
              disabled={users.isFetching}
              onOffsetChange={setOffset}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function SchoolMenusPanel({ schoolId }: { schoolId: string }) {
  const [previewMenu, setPreviewMenu] = useState<WeeklyMenu | null>(null);
  const activeMenus = useWeeklyMenus({
    offset: 0,
    limit: 100,
    school_id: schoolId,
  });
  const archivedMenus = useWeeklyMenus({
    offset: 0,
    limit: 100,
    school_id: schoolId,
    status: 'archived',
  });
  const revokedMenus = useWeeklyMenus({
    offset: 0,
    limit: 100,
    school_id: schoolId,
    status: 'revoked',
  });

  const menus = [
    ...(activeMenus.data?.items ?? []),
    ...(archivedMenus.data?.items ?? []),
    ...(revokedMenus.data?.items ?? []),
  ].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  const isPending = activeMenus.isPending || archivedMenus.isPending || revokedMenus.isPending;
  const errors = [
    activeMenus.isError ? activeMenus.error : null,
    archivedMenus.isError ? archivedMenus.error : null,
    revokedMenus.isError ? revokedMenus.error : null,
  ].filter(Boolean);

  return (
    <section className="nf-panel mt-5">
      <div className="nf-panel-header">
        <div>
          <h2 className="nf-panel-title">Меню школи</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Опубліковані, локально архівовані та відкликані меню цієї школи.
          </p>
        </div>
      </div>
      <div className="nf-panel-body">
        {isPending ? (
          <p role="status" className="text-sm text-slate-600">
            Завантажуємо меню школи…
          </p>
        ) : null}

        {errors.map((error, index) => (
          <RequestError
            key={index}
            error={error}
            onRetry={() => {
              void activeMenus.refetch();
              void archivedMenus.refetch();
              void revokedMenus.refetch();
            }}
          />
        ))}

        {!isPending && errors.length === 0 && menus.length === 0 ? (
          <div className="nf-empty">Для цієї школи ще немає меню.</div>
        ) : null}

        {menus.length ? (
          <div className="nf-table-wrap">
            <table className="nf-table">
              <thead>
                <tr>
                  <th>Меню</th>
                  <th className="w-36">Статус</th>
                  <th className="w-44">Оновлено</th>
                  <th className="w-40">Дія</th>
                </tr>
              </thead>
              <tbody>
                {menus.map((menu) => (
                  <SchoolMenuRow key={menu.id} menu={menu} onPreview={() => setPreviewMenu(menu)} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      <SchoolMenuPreviewDialog menu={previewMenu} onClose={() => setPreviewMenu(null)} />
    </section>
  );
}

function SchoolMenuRow({ menu, onPreview }: { menu: WeeklyMenu; onPreview: () => void }) {
  const confirm = useConfirm();
  const revokeMenu = useRevokeWeeklyMenu(menu.id);

  const handleRevoke = async () => {
    const confirmed = await confirm({
      title: 'Відкликати меню у школи?',
      description: `Меню "${menu.title}" буде відкликано у цієї школи.`,
      confirmLabel: 'Відкликати',
      variant: 'danger',
    });

    if (!confirmed) {
      return;
    }

    try {
      await revokeMenu.mutateAsync();
      toast.success('Меню відкликано у школи.');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <tr>
      <td className="cursor-pointer" onClick={onPreview}>
        <button type="button" className="nf-link text-left font-medium">
          {menu.title}
        </button>
        <div className="mt-1 text-xs text-slate-600">
          {menu.meal_type === 'lunch' ? 'Обід' : 'Сніданок'}
          {menu.cycle_week ? ` · цикл ${menu.cycle_week}` : ''}
        </div>
      </td>
      <td>{getMenuStatusLabel(menu)}</td>
      <td className="whitespace-nowrap text-xs text-slate-600">{formatDate(menu.updated_at)}</td>
      <td>
        <div className="flex flex-wrap gap-2">
          {menu.status === 'revoked' ? (
            <span className="self-center text-xs text-slate-500">Відкликано</span>
          ) : (
            <button
              type="button"
              className="nf-button nf-button-danger"
              disabled={revokeMenu.isPending}
              onClick={() => void handleRevoke()}
            >
              {revokeMenu.isPending ? 'Відкликаємо…' : 'Відкликати'}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function getMenuStatusLabel(menu: WeeklyMenu) {
  if (menu.status === 'published') {
    return 'Опубліковано';
  }
  if (menu.status === 'archived') {
    return 'Архів школи';
  }
  if (menu.status === 'revoked') {
    return 'Відкликано';
  }
  return 'Чернетка';
}
