'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, FileSpreadsheet, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';

import { dishCardVersionQueryOptions } from '@/entities/recipe/api/RecipeQueries';
import type { DishCard } from '@/entities/recipe/model/Recipe';
import { useOwnSchoolGroups } from '@/entities/school-group/api/SchoolGroupQueries';
import type { SchoolGroup } from '@/entities/school-group/model/SchoolGroup';
import {
  dailyMenuQueryKeys,
  useRegenerateDailyRequirements,
} from '@/entities/weekly-menu/api/DailyMenuQueries';
import { useWeeklyMenu, useWeeklyMenus } from '@/entities/weekly-menu/api/WeeklyMenuQueries';
import type { DailyMenu, DailyMenuItem, WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';
import { WEEKDAY_LABELS } from '@/entities/weekly-menu/model/WeeklyMenu';
import {
  clearDailyMenuDraft,
  loadDailyMenuDraft,
  prepareDailyMenuDays,
  saveDailyMenuDraft,
  updateDailyMenuGroupChildrenCount,
} from '@/features/daily-menu/model/DailyMenuDraftStorage';
import { useReopenWeeklyMenuDay } from '@/features/day-reopening/model/UseReopenWeeklyMenuDay';
import { useGenerateMenuRequirements } from '@/features/menu-requirement-generation/model/UseGenerateMenuRequirements';
import {
  useCloseWeeklyMenuDay,
  useUpdateWeeklyMenu,
} from '@/features/weekly-menu-editor/model/UseWeeklyMenuMutations';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { formatDate } from '@/shared/lib/FormatDate';
import { normalizeGramAmount } from '@/shared/lib/Portion';
import { useConfirm } from '@/shared/ui/ConfirmDialog';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';
import { RequestError } from '@/shared/ui/RequestError';

import type { CatalogSelection } from './daily-menu/DailyMenuContent';
import {
  DayMenuPanel,
  buildDailyMenuUpdatePayload,
  buildDishCardReplacement,
  buildProductMenuItem,
  createNewDailyMenuItem,
  formatMenuDate,
  isSchoolAddedDailyMenuItem,
  resequenceDayItemPositions,
  resolveDayDate,
  sortDays,
} from './daily-menu/DailyMenuContent';

export type AdminDailyMenuContext = {
  menuId: string;
  weekday: DailyMenu['weekday'];
  schoolId: string;
  groups: SchoolGroup[];
  readOnly: boolean;
  requirementStale: boolean;
  requirementRevision?: number;
  onDirtyChange?: (dirty: boolean) => void;
};

export function DailyMenuSchoolWorkspace({ admin }: { admin?: AdminDailyMenuContext } = {}) {
  const confirm = useConfirm();
  const router = useRouter();
  const queryClient = useQueryClient();
  const menus = useWeeklyMenus({
    offset: 0,
    limit: 100,
    status: 'published',
    enabled: !admin,
  });
  const ownGroups = useOwnSchoolGroups({ offset: 0, limit: 100 }, !admin);
  const groups = admin
    ? { ...ownGroups, data: { items: admin.groups }, isPending: false, isError: false }
    : ownGroups;
  const reopenDay = useReopenWeeklyMenuDay(admin?.schoolId ?? '');
  const regenerate = useRegenerateDailyRequirements();
  const [adminStale, setAdminStale] = useState(false);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const effectiveMenuId = admin?.menuId ?? selectedMenuId ?? menus.data?.items[0]?.id ?? '';
  const selectedMenu = useWeeklyMenu(effectiveMenuId);
  const updateWeeklyMenu = useUpdateWeeklyMenu(effectiveMenuId);
  const closeWeeklyMenuDay = useCloseWeeklyMenuDay(effectiveMenuId);
  const generateMenuRequirements = useGenerateMenuRequirements();
  const [days, setDays] = useState<DailyMenu[]>([]);
  const [activeWeekday, setActiveWeekday] = useState<DailyMenu['weekday'] | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const initializedMenuKey = useRef<string | null>(null);
  const editingRevision = useRef<number | null>(null);
  const onDirtyChange = admin?.onDirtyChange;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const activeGroups = useMemo(
    () => groups.data?.items.filter((group) => admin || group.is_active) ?? [],
    [groups.data?.items, admin]
  );

  useEffect(() => {
    const menu = selectedMenu.data;

    if (!menu || !groups.data) {
      return;
    }

    const menuKey = `${menu.id}:${menu.revision}`;

    if (initializedMenuKey.current === menuKey || (admin && isDirty)) {
      return;
    }

    const draft = admin ? null : loadDailyMenuDraft(menu.id, menu.updated_at);
    const serverDays = prepareDailyMenuDays(sortDays(menu.days), activeGroups, Boolean(admin));
    const nextDays = draft ? prepareDailyMenuDays(sortDays(draft.days), activeGroups) : serverDays;

    initializedMenuKey.current = menuKey;
    editingRevision.current = menu.revision;
    setDays(nextDays);
    setActiveWeekday((currentWeekday) =>
      nextDays.some((day) => day.weekday === currentWeekday)
        ? currentWeekday
        : (nextDays[0]?.weekday ?? null)
    );
    setSavedAt(menu.updated_at);
    setIsDirty(Boolean(draft) && JSON.stringify(nextDays) !== JSON.stringify(serverDays));
  }, [activeGroups, groups.data, selectedMenu.data, admin, isDirty]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const warnAboutUnsavedChanges = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener('beforeunload', warnAboutUnsavedChanges);
    return () => window.removeEventListener('beforeunload', warnAboutUnsavedChanges);
  }, [isDirty]);

  const activeDay = days.find((day) => day.weekday === (admin?.weekday ?? activeWeekday)) ?? null;
  const adminReadOnly = Boolean(admin?.readOnly);
  const isActiveDayClosed = Boolean(activeDay?.closed_at);
  const canGenerateActiveDay =
    !isActiveDayClosed &&
    (activeDay?.items.some((item) => item.servings.some((serving) => serving.children_count > 0)) ??
      false);
  const changeMenu = async (menuId: string) => {
    if (isDirty) {
      const confirmed = await confirm({
        title: 'Перейти без збереження?',
        description:
          'Є незбережені зміни. Якщо перейти до іншого меню, поточні правки залишаться тільки в локальній чернетці.',
        confirmLabel: 'Перейти',
      });

      if (!confirmed) {
        return;
      }
    }

    initializedMenuKey.current = null;
    setSelectedMenuId(menuId);
  };

  const changeDish = async (itemId: string, selectedItem: CatalogSelection) => {
    if (!activeDay || activeDay.closed_at || adminReadOnly) {
      return;
    }

    const currentItem = activeDay.items.find((item) => item.id === itemId);

    if (!currentItem) {
      return;
    }

    const nextItem =
      selectedItem.kind === 'product'
        ? buildProductMenuItem(currentItem, selectedItem.ingredient)
        : await buildDishCardMenuItem(currentItem, selectedItem.dishCard);

    if (!nextItem) {
      return;
    }

    setDays((currentDays) =>
      currentDays.map((day) =>
        day.weekday !== activeDay.weekday
          ? day
          : {
              ...day,
              items: day.items.map((item) => (item.id === itemId ? nextItem : item)),
            }
      )
    );
    setIsDirty(true);
  };

  const addItem = async (selectedItem: CatalogSelection) => {
    if (!activeDay || activeDay.closed_at || adminReadOnly) {
      return;
    }

    const newItem = createNewDailyMenuItem(activeDay, activeGroups);
    const resolvedItem =
      selectedItem.kind === 'product'
        ? buildProductMenuItem(newItem, selectedItem.ingredient)
        : await buildDishCardMenuItem(newItem, selectedItem.dishCard);

    if (!resolvedItem) {
      return;
    }

    setDays((currentDays) =>
      currentDays.map((day) =>
        day.weekday === activeDay.weekday
          ? resequenceDayItemPositions({ ...day, items: [...day.items, resolvedItem] })
          : day
      )
    );
    setIsDirty(true);
  };

  const removeItem = (itemId: string) => {
    if (!activeDay || activeDay.closed_at || adminReadOnly) {
      return;
    }

    const item = activeDay.items.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }
    if (activeDay.items.length <= 1) {
      toast.error('У денному меню має залишитися хоча б одна позиція.');
      return;
    }

    setDays((currentDays) =>
      currentDays.map((day) =>
        day.weekday === activeDay.weekday
          ? resequenceDayItemPositions({
              ...day,
              items: day.items.filter((candidate) => candidate.id !== itemId),
            })
          : day
      )
    );
    setIsDirty(true);
  };

  const changePortionYield = (itemId: string, portionIndex: number, value: string) => {
    if (!activeDay || activeDay.closed_at || adminReadOnly) {
      return;
    }

    setDays((currentDays) =>
      currentDays.map((day) =>
        day.weekday !== activeDay.weekday
          ? day
          : {
              ...day,
              items: day.items.map((item) =>
                item.id !== itemId || !isSchoolAddedDailyMenuItem(item)
                  ? item
                  : {
                      ...item,
                      portions: item.portions.map((portion, index) =>
                        index === portionIndex ? { ...portion, yield_amount: value } : portion
                      ),
                    }
              ),
            }
      )
    );
    setIsDirty(true);
  };

  const buildDishCardMenuItem = async (
    currentItem: DailyMenuItem,
    dishCard: DishCard
  ): Promise<DailyMenuItem | null> => {
    if (!dishCard.current_version_id) {
      toast.error('У цієї техкарти немає поточної версії.');
      return null;
    }

    try {
      const version = await queryClient.ensureQueryData(
        dishCardVersionQueryOptions(dishCard.current_version_id)
      );

      const isCurrentDraft =
        version.status === 'draft' &&
        version.dish_card_id === dishCard.id &&
        version.id === dishCard.current_version_id;
      if (version.status !== 'confirmed' && version.status !== 'archived' && !isCurrentDraft) {
        toast.error('Поточна версія техкарти недоступна для розрахунків.');
        return null;
      }

      return buildDishCardReplacement(currentItem, dishCard, version);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      return null;
    }
  };

  const changeChildrenCount = (group: SchoolGroup, childrenCount: number) => {
    if (!activeDay || activeDay.closed_at || adminReadOnly) {
      return;
    }

    setDays((currentDays) =>
      updateDailyMenuGroupChildrenCount(currentDays, activeDay.weekday, group.id, childrenCount)
    );
    setIsDirty(true);
  };

  const saveChanges = async (): Promise<WeeklyMenu | null> => {
    const menu = selectedMenu.data;

    if (!menu || adminReadOnly || (admin && activeDay?.closed_at)) {
      return null;
    }

    const savedDays = admin
      ? menu.days.map((day) => (day.weekday === activeDay?.weekday ? activeDay : day))
      : days;
    const daysToValidate = admin
      ? (activeDay && !activeDay.closed_at ? [activeDay] : [])
      : savedDays.filter((day) => !day.closed_at);
    for (const day of daysToValidate) {
      for (const item of day.items) {
        for (const portion of item.portions) {
          const yieldVal = normalizeGramAmount(portion.yield_amount);
          if (yieldVal === null || yieldVal <= 0) {
            toast.error('Вкажіть коректний вихід порції для всіх вікових груп перед збереженням.');
            return null;
          }
        }
      }
    }

    if (!admin) saveDailyMenuDraft(menu.id, menu.updated_at, days);

    try {
      const updatedMenu = await updateWeeklyMenu.mutateAsync({
        ...buildDailyMenuUpdatePayload(savedDays, menu.days),
        revision: admin ? (editingRevision.current ?? menu.revision) : menu.revision,
      });
      clearDailyMenuDraft(menu.id);
      editingRevision.current = updatedMenu.revision;
      initializedMenuKey.current = `${updatedMenu.id}:${updatedMenu.revision}`;
      setDays(prepareDailyMenuDays(sortDays(updatedMenu.days), activeGroups, Boolean(admin)));
      setSavedAt(updatedMenu.updated_at);
      setIsDirty(false);
      if (admin) {
        setAdminStale(true);
        await queryClient.invalidateQueries({ queryKey: dailyMenuQueryKeys.all });
        toast.success('Зміни збережено.');
      } else {
        toast.success(
          'Зміни збережено. Якщо страву змінено або видалено, технолог отримав повідомлення.'
        );
      }
      return updatedMenu;
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      return null;
    }
  };

  const generateRequirement = async () => {
    const menu = selectedMenu.data;

    if (!menu || !activeDay || activeDay.closed_at || !canGenerateActiveDay) {
      return;
    }
    if (isDirty && !(await saveChanges())) {
      return;
    }

    try {
      const response = await generateMenuRequirements.mutateAsync({
        weekly_menu_id: menu.id,
        weekday: activeDay.weekday,
        service_date: resolveDayDate(menu, activeDay),
      });
      const groupsCount = response.items.length;
      toast.success(
        groupsCount === 1
          ? 'Меню-вимогу сформовано.'
          : `Сформовано меню-вимоги для ${groupsCount} груп.`
      );
      router.push('/menu-requirements');
    } catch (error) {
      const serverDays = prepareDailyMenuDays(sortDays(menu.days), activeGroups, Boolean(admin));
      setDays(serverDays);
      setSavedAt(menu.updated_at);
      setIsDirty(false);
      toast.error(getApiErrorMessage(error));
    }
  };

  const closeActiveDay = async () => {
    const menu = selectedMenu.data;

    if (!menu || !activeDay || activeDay.closed_at || !canGenerateActiveDay) {
      return;
    }

    const confirmed = await confirm({
      title: 'Закрити день?',
      description:
        'Усі зміни буде збережено, а фінальну меню-вимогу сформовано автоматично. Після закриття день не можна буде редагувати.',
      confirmLabel: 'Закрити день',
      variant: 'danger',
    });

    if (!confirmed) {
      return;
    }

    const savedMenu = isDirty ? await saveChanges() : menu;

    if (!savedMenu) {
      return;
    }

    try {
      const updatedMenu = await closeWeeklyMenuDay.mutateAsync(activeDay.weekday);
      clearDailyMenuDraft(menu.id);
      const nextDays = prepareDailyMenuDays(
        sortDays(updatedMenu.days),
        activeGroups,
        Boolean(admin)
      );
      initializedMenuKey.current = `${updatedMenu.id}:${updatedMenu.revision}`;
      setDays(nextDays);
      setActiveWeekday(activeDay.weekday);
      setSavedAt(updatedMenu.updated_at);
      setIsDirty(false);
      toast.success('День закрито, меню-вимогу сформовано.');
    } catch (error) {
      const serverDays = prepareDailyMenuDays(sortDays(savedMenu.days), activeGroups);
      setDays(serverDays);
      setSavedAt(savedMenu.updated_at);
      setIsDirty(false);
      toast.error(getApiErrorMessage(error));
    }
  };

  if (admin) {
    const busy = updateWeeklyMenu.isPending || reopenDay.isPending || regenerate.isPending;
    const readOnly = admin.readOnly || isActiveDayClosed || busy;
    const stale =
      adminStale ||
      admin.requirementStale ||
      (admin.requirementRevision !== undefined &&
        admin.requirementRevision !== selectedMenu.data?.revision);
    const reopen = async () => {
      try {
        await reopenDay.mutateAsync({ menuId: admin.menuId, weekday: admin.weekday });
        await queryClient.invalidateQueries({ queryKey: dailyMenuQueryKeys.all });
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    };
    const regenerateRequirements = async () => {
      if (!selectedMenu.data || isDirty || readOnly) return;
      if (
        !(await confirm({
          title: 'Переформувати меню-вимогу?',
          description:
            'Поточні дані меню-вимоги за цей день буде перераховано на основі виправленого денного меню.',
          confirmLabel: 'Переформувати',
        }))
      )
        return;
      try {
        await regenerate.mutateAsync({
          schoolId: admin.schoolId,
          menuId: admin.menuId,
          weekday: admin.weekday,
          revision: selectedMenu.data.revision,
        });
        setAdminStale(false);
        toast.success('Меню-вимогу переформовано.');
      } catch (error) {
        setAdminStale(true);
        toast.error(getApiErrorMessage(error));
      }
    };
    return (
      <section className="space-y-4">
        {selectedMenu.isError ? (
          <RequestError error={selectedMenu.error} onRetry={() => void selectedMenu.refetch()} />
        ) : null}
        {selectedMenu.isPending ? <LoadingSpinner label="Завантажуємо денне меню…" /> : null}
        {activeDay && selectedMenu.data ? (
          <>
            {admin.readOnly ? <p>Цей місяць доступний лише для перегляду.</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              {isActiveDayClosed && !admin.readOnly ? (
                <button
                  className="nf-button nf-button-primary"
                  disabled={busy}
                  onClick={() => void reopen()}
                >
                  Відкрити для редагування
                </button>
              ) : null}
              {!isActiveDayClosed && !admin.readOnly ? (
                <button
                  className="nf-button nf-button-primary"
                  disabled={busy || !isDirty}
                  onClick={() => void saveChanges()}
                >
                  Зберегти зміни
                </button>
              ) : null}
              {isDirty ? <p role="status">Є незбережені зміни</p> : null}
            </div>
            {stale ? (
              <div role="status" className="border border-amber-400 bg-amber-50 p-4">
                <p>Дані дня змінено. Меню-вимогу потрібно сформувати повторно.</p>
                {!admin.readOnly && !isActiveDayClosed ? (
                  <button
                    className="nf-button nf-button-secondary mt-2"
                    disabled={busy || isDirty}
                    onClick={() => void regenerateRequirements()}
                  >
                    Переформувати меню-вимогу
                  </button>
                ) : null}
                {isDirty ? <p>Спочатку збережіть зміни.</p> : null}
              </div>
            ) : (
              <p role="status">Меню-вимога актуальна.</p>
            )}
            <DayMenuPanel
              day={activeDay}
              displayDate={resolveDayDate(selectedMenu.data, activeDay)}
              groups={activeGroups}
              readOnly={readOnly}
              onDishChange={changeDish}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onPortionYieldChange={changePortionYield}
              onChildrenCountChange={changeChildrenCount}
            />
          </>
        ) : null}
      </section>
    );
  }

  return (
    <main className="nf-page nf-page-wide">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Облік харчування</p>
        <h1 className="nf-title">Денне меню</h1>
        <p className="nf-description">
          Оберіть день, за потреби замініть страви та вкажіть кількість дітей, які поїли кожну
          страву в кожній групі.
        </p>
      </header>

      <section
        className={`mb-5 border px-4 py-3 ${
          isActiveDayClosed
            ? 'border-slate-400 bg-slate-100 text-slate-700'
            : isDirty
              ? 'border-amber-400 bg-amber-50 text-amber-950'
              : 'border-slate-300 bg-slate-50 text-slate-700'
        }`}
        role="status"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {isActiveDayClosed ? (
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : isDirty ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <div>
              <p className="text-sm font-bold">
                {isActiveDayClosed
                  ? 'День закрито'
                  : isDirty
                    ? 'Є незбережені зміни'
                    : savedAt
                      ? 'Усі зміни збережено'
                      : 'Зміни ще не зберігалися'}
              </p>
              <p className="mt-0.5 text-xs">
                {isActiveDayClosed
                  ? 'Закритий день доступний тільки для перегляду. Редагування, збереження і повторне формування меню-вимоги вимкнені.'
                  : 'Збереження не виконується автоматично. Кількість дітей оновлюється без повідомлення технологу, а заміна страви потрапляє у його окрему вкладку.'}
                {savedAt ? ` Останнє збереження: ${formatDate(savedAt)}.` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="nf-button nf-button-secondary shrink-0"
              onClick={() => void saveChanges()}
              disabled={
                !selectedMenu.data ||
                !days.length ||
                isActiveDayClosed ||
                updateWeeklyMenu.isPending ||
                closeWeeklyMenuDay.isPending ||
                generateMenuRequirements.isPending
              }
            >
              {updateWeeklyMenu.isPending ? (
                <LoadingSpinner size="sm" label="Зберігаємо…" />
              ) : (
                <>
                  <Save className="size-4" aria-hidden />
                  Зберегти зміни
                </>
              )}
            </button>
            <button
              type="button"
              className="nf-button nf-button-secondary shrink-0"
              onClick={() => void closeActiveDay()}
              disabled={
                !selectedMenu.data ||
                !activeDay ||
                isActiveDayClosed ||
                !canGenerateActiveDay ||
                updateWeeklyMenu.isPending ||
                closeWeeklyMenuDay.isPending ||
                generateMenuRequirements.isPending
              }
              title={
                canGenerateActiveDay || isActiveDayClosed
                  ? undefined
                  : 'Вкажіть кількість дітей більше нуля хоча б для однієї страви'
              }
            >
              {closeWeeklyMenuDay.isPending ? (
                <LoadingSpinner size="sm" label="Закриваємо…" />
              ) : (
                <>
                  <Lock className="size-4" aria-hidden />
                  Закрити день
                </>
              )}
            </button>
            <button
              type="button"
              className="nf-button nf-button-primary shrink-0"
              onClick={() => void generateRequirement()}
              disabled={
                !selectedMenu.data ||
                !activeDay ||
                isActiveDayClosed ||
                !canGenerateActiveDay ||
                updateWeeklyMenu.isPending ||
                closeWeeklyMenuDay.isPending ||
                generateMenuRequirements.isPending
              }
              title={
                canGenerateActiveDay
                  ? undefined
                  : 'Вкажіть кількість дітей більше нуля хоча б для однієї страви'
              }
            >
              {generateMenuRequirements.isPending ? (
                <LoadingSpinner size="sm" label="Формуємо…" />
              ) : (
                <>
                  <FileSpreadsheet className="size-4" aria-hidden />
                  Сформувати меню-вимогу
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {menus.isError ? (
        <RequestError error={menus.error} onRetry={() => void menus.refetch()} />
      ) : null}
      {groups.isError ? (
        <div className="mb-5">
          <RequestError error={groups.error} onRetry={() => void groups.refetch()} />
        </div>
      ) : null}

      {menus.isPending || (effectiveMenuId && selectedMenu.isPending) ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <LoadingSpinner label="Завантажуємо денне меню…" />
          </div>
        </section>
      ) : null}

      {menus.data?.items.length === 0 ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <div className="nf-empty">Денне меню з’явиться після публікації тижневого меню.</div>
          </div>
        </section>
      ) : null}

      {selectedMenu.data && days.length ? (
        <div className="space-y-5">
          <section className="nf-panel">
            <div className="nf-panel-body flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-60 flex-1">
                <label htmlFor="daily-menu-source" className="nf-label">
                  Тижневе меню
                </label>
                <select
                  id="daily-menu-source"
                  className="nf-input max-w-xl"
                  value={effectiveMenuId}
                  onChange={(event) => void changeMenu(event.target.value)}
                >
                  {menus.data?.items.map((menu) => (
                    <option key={menu.id} value={menu.id}>
                      {menu.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-slate-600">
                {selectedMenu.data.meal_type === 'lunch' ? 'Обід' : 'Сніданок'}
                {selectedMenu.data.cycle_week ? ` · цикл ${selectedMenu.data.cycle_week}` : ''}
              </div>
            </div>
          </section>

          <div className="nf-tabs overflow-x-auto" role="tablist" aria-label="Дні тижневого меню">
            {days.map((day) => {
              const isActive = day.weekday === activeDay?.weekday;
              const isClosed = Boolean(day.closed_at);

              return (
                <button
                  key={day.weekday}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`nf-tab shrink-0 ${isActive ? 'nf-tab-active' : ''} ${
                    isClosed ? 'text-slate-400 line-through' : ''
                  }`}
                  onClick={() => setActiveWeekday(day.weekday)}
                >
                  {WEEKDAY_LABELS[day.weekday]}
                  <span
                    className={`ml-2 font-normal ${isClosed ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    {formatMenuDate(resolveDayDate(selectedMenu.data, day))}
                  </span>
                </button>
              );
            })}
          </div>

          {activeGroups.length === 0 && !groups.isPending ? (
            <div className="border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Немає активних груп. Додайте або активуйте групи, щоб вести кількість дітей.
            </div>
          ) : null}

          {activeDay ? (
            <DayMenuPanel
              day={activeDay}
              displayDate={resolveDayDate(selectedMenu.data, activeDay)}
              groups={activeGroups}
              readOnly={Boolean(activeDay.closed_at)}
              onDishChange={changeDish}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onPortionYieldChange={changePortionYield}
              onChildrenCountChange={changeChildrenCount}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
