'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';

import Link from 'next/link';

import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { adminUsersQueryOptions } from '@/entities/admin-user/api/AdminUserQueries';
import { schoolsQueryOptions } from '@/entities/school/api/SchoolQueries';
import { useCurrentUser } from '@/entities/session/api/SessionQueries';
import { useWeeklyMenus } from '@/entities/weekly-menu/api/WeeklyMenuQueries';
import type { WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';
import { hasPermission } from '@/features/access/model/AccessPolicy';
import {
  useArchiveWeeklyMenu,
  useCreateWeeklyMenu,
  usePublishWeeklyMenu,
  useRevokeWeeklyMenus,
  useUpdateWeeklyMenu,
} from '@/features/weekly-menu-editor/model/UseWeeklyMenuMutations';
import {
  type WeeklyMenuFormValues,
  createBlankWeeklyMenuFormValues,
  formValuesToWeeklyMenuPayload,
  weeklyMenuToFormValues,
} from '@/features/weekly-menu-editor/model/WeeklyMenuFormSchema';
import { WeeklyMenuEditorForm } from '@/features/weekly-menu-editor/ui/WeeklyMenuEditorForm';
import { WeeklyMenuExcelTools } from '@/features/weekly-menu-excel/ui/WeeklyMenuExcelTools';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { formatDate } from '@/shared/lib/FormatDate';
import { useConfirm } from '@/shared/ui/ConfirmDialog';
import { RequestError } from '@/shared/ui/RequestError';

import { WeeklyMenuPicker } from './WeeklyMenuPicker';

export function WeeklyMenuAdminWorkspace() {
  const confirm = useConfirm();
  const currentUser = useCurrentUser();
  const user = currentUser.data;
  const menus = useWeeklyMenus({
    offset: 0,
    limit: 100,
    template_only: true,
  });
  const createWeeklyMenu = useCreateWeeklyMenu();
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [isCreatingNewMenu, setIsCreatingNewMenu] = useState(false);
  const [newMenuRevision, setNewMenuRevision] = useState(0);
  const [menuOverride, setMenuOverride] = useState<WeeklyMenu | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);
  const [selectedRevokeCopyIds, setSelectedRevokeCopyIds] = useState<string[]>([]);

  const availableMenus = useMemo(() => {
    const items = menus.data?.items ?? [];

    if (!menuOverride) {
      return items;
    }

    const overrideExists = items.some((menu) => menu.id === menuOverride.id);

    if (!overrideExists) {
      return [menuOverride, ...items];
    }

    return items.map((menu) => (menu.id === menuOverride.id ? menuOverride : menu));
  }, [menuOverride, menus.data?.items]);

  useEffect(() => {
    if (isCreatingNewMenu || selectedMenuId || !availableMenus.length) {
      return;
    }

    startTransition(() => {
      setSelectedMenuId(availableMenus[0].id);
    });
  }, [availableMenus, isCreatingNewMenu, selectedMenuId]);

  const selectedMenu = useMemo(() => {
    if (isCreatingNewMenu || !selectedMenuId) {
      return null;
    }

    return availableMenus.find((menu) => menu.id === selectedMenuId) ?? null;
  }, [availableMenus, isCreatingNewMenu, selectedMenuId]);

  const updateWeeklyMenu = useUpdateWeeklyMenu(selectedMenu?.id ?? '');
  const archiveWeeklyMenu = useArchiveWeeklyMenu(selectedMenu?.id ?? '');
  const publishWeeklyMenu = usePublishWeeklyMenu(selectedMenu?.id ?? '');
  const revokeWeeklyMenus = useRevokeWeeklyMenus();
  const publishedMenuCopies = useWeeklyMenus({
    offset: 0,
    limit: 100,
    source_menu_id: selectedMenu?.id,
    status: 'published',
    enabled: Boolean(selectedMenu),
  });
  const archivedMenuCopies = useWeeklyMenus({
    offset: 0,
    limit: 100,
    source_menu_id: selectedMenu?.id,
    status: 'archived',
    enabled: Boolean(selectedMenu),
  });

  const canInspectSchools = Boolean(
    user && (hasPermission(user, 'schools.manage') || hasPermission(user, 'menus.manage'))
  );
  const canSelectTargetSchools = Boolean(
    user && (user.role === 'OWNER' || user.role === 'TECHNOLOGIST')
  );
  const canUseRecipeCatalog = Boolean(
    user &&
    (user.role === 'OWNER' ||
      hasPermission(user, 'recipes.manage') ||
      hasPermission(user, 'menus.manage'))
  );

  const schools = useQuery({
    ...schoolsQueryOptions({
      offset: 0,
      limit: 100,
    }),
    enabled: canInspectSchools,
  });

  const adminUsers = useQuery({
    ...adminUsersQueryOptions({
      offset: 0,
      limit: 100,
    }),
    enabled: user?.role === 'OWNER',
  });

  const activeSchools = useMemo(
    () => schools.data?.items.filter((school) => school.is_active) ?? [],
    [schools.data?.items]
  );
  const schoolById = useMemo(
    () => new Map((schools.data?.items ?? []).map((school) => [school.id, school])),
    [schools.data?.items]
  );
  const activeSchoolIds = useMemo(
    () => new Set(activeSchools.map((school) => school.id)),
    [activeSchools]
  );
  const effectiveSelectedSchoolIds = useMemo(
    () => selectedSchoolIds.filter((schoolId) => activeSchoolIds.has(schoolId)),
    [activeSchoolIds, selectedSchoolIds]
  );

  const ownerSchoolGroups = useMemo(() => {
    if (user?.role !== 'OWNER') {
      return [];
    }

    const adminLabelById = new Map(
      (adminUsers.data?.items ?? []).map((admin) => [admin.id, admin.username])
    );
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        schools: typeof activeSchools;
      }
    >();

    for (const school of activeSchools) {
      const key = school.admin_owner_id ?? 'unassigned';
      const label =
        school.admin_owner_id === null
          ? 'Без закріпленого адміністратора'
          : (adminLabelById.get(school.admin_owner_id) ?? `Адміністратор ${school.admin_owner_id}`);
      const existing = groups.get(key);

      if (existing) {
        existing.schools.push(school);
        continue;
      }

      groups.set(key, {
        key,
        label,
        schools: [school],
      });
    }

    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label, 'uk'));
  }, [activeSchools, adminUsers.data?.items, user?.role]);

  const revokableMenuCopies = useMemo(() => {
    const copies = [
      ...(publishedMenuCopies.data?.items ?? []),
      ...(archivedMenuCopies.data?.items ?? []),
    ];
    const uniqueCopies = new Map(copies.map((menu) => [menu.id, menu]));
    return [...uniqueCopies.values()].sort((left, right) =>
      left.title.localeCompare(right.title, 'uk')
    );
  }, [archivedMenuCopies.data?.items, publishedMenuCopies.data?.items]);

  const revokeSchoolGroups = useMemo(() => {
    const adminLabelById = new Map(
      (adminUsers.data?.items ?? []).map((admin) => [admin.id, admin.username])
    );
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        copies: WeeklyMenu[];
      }
    >();

    for (const copy of revokableMenuCopies) {
      const school = copy.school_id ? schoolById.get(copy.school_id) : undefined;
      const key = user?.role === 'OWNER' ? (school?.admin_owner_id ?? 'unassigned') : 'schools';
      const label =
        user?.role === 'OWNER'
          ? school?.admin_owner_id === null || school?.admin_owner_id === undefined
            ? 'Без закріпленого адміністратора'
            : (adminLabelById.get(school.admin_owner_id) ??
              `Адміністратор ${school.admin_owner_id}`)
          : 'Школи з цим меню';
      const existing = groups.get(key);

      if (existing) {
        existing.copies.push(copy);
        continue;
      }

      groups.set(key, {
        key,
        label,
        copies: [copy],
      });
    }

    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label, 'uk'));
  }, [adminUsers.data?.items, revokableMenuCopies, schoolById, user?.role]);

  const effectiveSelectedRevokeCopyIds = useMemo(() => {
    const revokableIds = new Set(revokableMenuCopies.map((copy) => copy.id));
    return selectedRevokeCopyIds.filter((copyId) => revokableIds.has(copyId));
  }, [revokableMenuCopies, selectedRevokeCopyIds]);

  const editorInitialValues = selectedMenu
    ? weeklyMenuToFormValues(selectedMenu)
    : createBlankWeeklyMenuFormValues();
  const editorKey = selectedMenu
    ? `${selectedMenu.id}:${selectedMenu.updated_at}`
    : `new:${newMenuRevision}`;

  const savePending = createWeeklyMenu.isPending || updateWeeklyMenu.isPending;

  const publishDisabled =
    !selectedMenu ||
    publishWeeklyMenu.isPending ||
    (canSelectTargetSchools && effectiveSelectedSchoolIds.length === 0) ||
    (canSelectTargetSchools && schools.isError);
  const revokeCopiesLoading = publishedMenuCopies.isPending || archivedMenuCopies.isPending;
  const revokeCopiesError =
    (publishedMenuCopies.isError ? publishedMenuCopies.error : null) ??
    (archivedMenuCopies.isError ? archivedMenuCopies.error : null);

  if (!user) {
    return null;
  }

  const handleSave = async (values: WeeklyMenuFormValues) => {
    const payload = formValuesToWeeklyMenuPayload(values);

    if (selectedMenu) {
      const updatedMenu = await updateWeeklyMenu.mutateAsync(payload);
      setMenuOverride(updatedMenu);
      toast.success('Тижневе меню збережено.');
      return;
    }

    const createdMenu = await createWeeklyMenu.mutateAsync(payload);
    setMenuOverride(createdMenu);
    setIsCreatingNewMenu(false);
    setSelectedMenuId(createdMenu.id);
    toast.success('Тижневе меню створено.');
  };

  const confirmSave = async (values: WeeklyMenuFormValues) => {
    const confirmed = await confirm({
      title: selectedMenu ? 'Зберегти зміни в меню?' : 'Створити меню?',
      description: 'Ви впевнені, що хочете зберегти меню?',
      confirmLabel: selectedMenu ? 'Зберегти' : 'Створити',
    });

    if (confirmed) {
      await handleSave(values);
    }
  };

  const handleImportedMenus = (importedMenus: WeeklyMenu[]) => {
    const firstMenu = importedMenus[0];
    if (!firstMenu) {
      return;
    }

    setIsCreatingNewMenu(false);
    setMenuOverride(firstMenu);
    setSelectedMenuId(firstMenu.id);
  };

  const handlePublish = async () => {
    if (!selectedMenu) {
      return;
    }

    const result = await publishWeeklyMenu.mutateAsync(
      canSelectTargetSchools
        ? {
            school_ids: effectiveSelectedSchoolIds,
            replace_existing: replaceExisting,
          }
        : {
            replace_existing: replaceExisting,
          }
    );

    toast.success(
      `Розсилку завершено. Створено: ${result.created_menu_ids.length}, оновлено: ${result.replaced_menu_ids.length}, пропущено: ${result.skipped_existing_school_ids.length}.`
    );
  };

  const handleArchiveSelected = async () => {
    if (!selectedMenu) {
      return;
    }

    const confirmed = await confirm({
      title: 'Архівувати тижневе меню?',
      description: `Меню "${selectedMenu.title}" буде перенесено в архів і відкликано в усіх школах.`,
      confirmLabel: 'Архівувати',
      variant: 'danger',
    });

    if (!confirmed) {
      return;
    }

    const archivedMenuId = selectedMenu.id;
    const nextMenu = availableMenus.find((menu) => menu.id !== archivedMenuId) ?? null;

    try {
      await archiveWeeklyMenu.mutateAsync();
      setMenuOverride((currentMenu) => (currentMenu?.id === archivedMenuId ? null : currentMenu));
      setSelectedMenuId(nextMenu?.id ?? null);
      setIsCreatingNewMenu(false);
      toast.success('Тижневе меню перенесено в архів і відкликано у школах.');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleRevokeSelectedCopies = async () => {
    if (!selectedMenu || !effectiveSelectedRevokeCopyIds.length) {
      return;
    }

    const confirmed = await confirm({
      title: 'Відкликати меню у вибраних школах?',
      description: `Меню "${selectedMenu.title}" буде відкликано у школах: ${effectiveSelectedRevokeCopyIds.length}.`,
      confirmLabel: 'Відкликати',
      variant: 'danger',
    });

    if (!confirmed) {
      return;
    }

    try {
      const revokedMenus = await revokeWeeklyMenus.mutateAsync(effectiveSelectedRevokeCopyIds);
      setSelectedRevokeCopyIds([]);
      toast.success(`Меню відкликано у школах: ${revokedMenus.length}.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <main className="nf-page nf-page-wide">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Меню</p>
        <h1 className="nf-title">Тижневе меню</h1>
        <p className="nf-description">
          Створюйте й редагуйте тижневі меню, а потім розсилайте їх школам. Для адміністратора
          розсилка піде лише у його школи, а власник і технолог можуть вручну обрати будь-які
          цільові школи.
        </p>
        <div className="mt-4">
          <Link href="/admin/menus/archive" className="nf-button nf-button-secondary">
            Архів меню
          </Link>
        </div>
      </header>

      <div className="space-y-5">
        <WeeklyMenuExcelTools
          selectedMenuId={selectedMenu?.id ?? null}
          onImported={handleImportedMenus}
        />

        <WeeklyMenuPicker
          menus={availableMenus}
          selectedMenu={selectedMenu}
          isCreatingNewMenu={isCreatingNewMenu}
          loading={menus.isPending}
          error={menus.isError ? menus.error : null}
          archiving={archiveWeeklyMenu.isPending}
          onRetry={() => void menus.refetch()}
          onSelect={(menuId) => {
            setIsCreatingNewMenu(false);
            setSelectedMenuId(menuId);
          }}
          onCreateNew={() => {
            setIsCreatingNewMenu(true);
            setSelectedMenuId(null);
            setMenuOverride(null);
            setNewMenuRevision((value) => value + 1);
          }}
          onArchiveSelected={() => void handleArchiveSelected()}
        />

        <WeeklyMenuEditorForm
          key={editorKey}
          initialValues={editorInitialValues}
          mode="backoffice"
          submitLabel={selectedMenu ? 'Зберегти меню' : 'Створити меню'}
          saving={savePending}
          onSubmit={confirmSave}
          recipeCatalogEnabled={canUseRecipeCatalog}
          headerNote={
            selectedMenu ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">
                  Редагується меню: {selectedMenu.title}
                </p>
                <p className="text-xs text-slate-600">
                  Статус: {selectedMenu.status} · Оновлено {formatDate(selectedMenu.updated_at)}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">Нове тижневе меню</p>
                <p className="text-xs text-slate-600">
                  Спочатку збережіть меню, а вже потім розсилайте його у школи.
                </p>
              </div>
            )
          }
        />

        {selectedMenu ? (
          <>
            <section className="nf-panel">
              <div className="nf-panel-header">
                <h2 className="nf-panel-title">Розсилка</h2>
              </div>
              <div className="nf-panel-body space-y-4">
                <label className="nf-checkbox-row">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(event) => setReplaceExisting(event.target.checked)}
                  />
                  <span className="text-sm text-slate-700">
                    Оновлювати вже розіслані копії меню
                  </span>
                </label>

                {canSelectTargetSchools ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="nf-button"
                        onClick={() =>
                          setSelectedSchoolIds(activeSchools.map((school) => school.id))
                        }
                      >
                        Обрати всі
                      </button>
                      <button
                        type="button"
                        className="nf-button nf-button-ghost"
                        onClick={() => setSelectedSchoolIds([])}
                      >
                        Очистити
                      </button>
                    </div>

                    {schools.isPending || (user.role === 'OWNER' && adminUsers.isPending) ? (
                      <p role="status" className="text-sm text-slate-600">
                        Завантажуємо школи для розсилки…
                      </p>
                    ) : null}

                    {schools.isError ? (
                      <RequestError error={schools.error} onRetry={() => void schools.refetch()} />
                    ) : null}

                    {user.role === 'OWNER' && adminUsers.isError ? (
                      <RequestError
                        error={adminUsers.error}
                        onRetry={() => void adminUsers.refetch()}
                      />
                    ) : null}

                    {(user.role === 'OWNER'
                      ? ownerSchoolGroups
                      : [
                          {
                            key: 'all-schools',
                            label: 'Усі активні школи',
                            schools: activeSchools,
                          },
                        ]
                    ).map((group) => (
                      <div key={group.key} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                            {group.label}
                          </p>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {group.schools.map((school) => (
                            <label key={school.id} className="nf-checkbox-row">
                              <input
                                type="checkbox"
                                checked={effectiveSelectedSchoolIds.includes(school.id)}
                                onChange={(event) =>
                                  setSelectedSchoolIds((previous) =>
                                    event.target.checked
                                      ? [...previous, school.id]
                                      : previous.filter((id) => id !== school.id)
                                  )
                                }
                              />
                              <span className="text-sm text-slate-700">{school.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : schools.data?.items.length ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-700">
                      Меню буде розіслано у всі активні школи, які закріплені за вашим акаунтом.
                    </p>
                    <ul className="grid gap-1 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-3">
                      {schools.data.items
                        .filter((school) => school.is_active)
                        .map((school) => (
                          <li key={school.id}>{school.name}</li>
                        ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-slate-700">
                    Розсилка піде у всі активні школи, закріплені за вашим адміністратором. Список
                    шкіл недоступний без додаткового права перегляду шкіл.
                  </p>
                )}

                <button
                  type="button"
                  disabled={publishDisabled}
                  className="nf-button nf-button-primary w-full sm:w-auto"
                  onClick={() => void handlePublish()}
                >
                  {publishWeeklyMenu.isPending ? 'Розсилаємо…' : 'Розіслати школам'}
                </button>
              </div>
            </section>

            <section className="nf-panel">
              <div className="nf-panel-header">
                <h2 className="nf-panel-title">Відкликання</h2>
              </div>
              <div className="nf-panel-body space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="nf-button"
                    disabled={!revokableMenuCopies.length}
                    onClick={() =>
                      setSelectedRevokeCopyIds(revokableMenuCopies.map((copy) => copy.id))
                    }
                  >
                    Обрати всі
                  </button>
                  <button
                    type="button"
                    className="nf-button nf-button-ghost"
                    disabled={!effectiveSelectedRevokeCopyIds.length}
                    onClick={() => setSelectedRevokeCopyIds([])}
                  >
                    Очистити
                  </button>
                </div>

                {revokeCopiesLoading ? (
                  <p role="status" className="text-sm text-slate-600">
                    Завантажуємо школи з цим меню…
                  </p>
                ) : null}

                {revokeCopiesError ? (
                  <RequestError
                    error={revokeCopiesError}
                    onRetry={() => {
                      void publishedMenuCopies.refetch();
                      void archivedMenuCopies.refetch();
                    }}
                  />
                ) : null}

                {!revokeCopiesLoading && !revokeCopiesError && revokableMenuCopies.length === 0 ? (
                  <div className="nf-empty">Це меню поки не розіслано жодній школі.</div>
                ) : null}

                {revokeSchoolGroups.map((group) => (
                  <div key={group.key} className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                      {group.label}
                    </p>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {group.copies.map((copy) => {
                        const school = copy.school_id ? schoolById.get(copy.school_id) : undefined;

                        return (
                          <label key={copy.id} className="nf-checkbox-row">
                            <input
                              type="checkbox"
                              checked={effectiveSelectedRevokeCopyIds.includes(copy.id)}
                              onChange={(event) =>
                                setSelectedRevokeCopyIds((previous) =>
                                  event.target.checked
                                    ? [...previous, copy.id]
                                    : previous.filter((id) => id !== copy.id)
                                )
                              }
                            />
                            <span className="text-sm text-slate-700">
                              {school?.name ?? `Школа ${copy.school_id ?? copy.id}`}
                              {copy.status === 'archived' ? ' · архів школи' : ''}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  disabled={
                    revokeWeeklyMenus.isPending || effectiveSelectedRevokeCopyIds.length === 0
                  }
                  className="nf-button nf-button-danger w-full sm:w-auto"
                  onClick={() => void handleRevokeSelectedCopies()}
                >
                  {revokeWeeklyMenus.isPending ? 'Відкликаємо…' : 'Відкликати у вибраних школах'}
                </button>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
