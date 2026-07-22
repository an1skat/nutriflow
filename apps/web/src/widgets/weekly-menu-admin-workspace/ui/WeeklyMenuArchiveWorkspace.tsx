'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';

import { Check, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useWeeklyMenus } from '@/entities/weekly-menu/api/WeeklyMenuQueries';
import type { WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';
import {
  useDeleteWeeklyMenu,
  useDeleteWeeklyMenus,
  useRestoreWeeklyMenu,
  useRestoreWeeklyMenus,
} from '@/features/weekly-menu-editor/model/UseWeeklyMenuMutations';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { formatDate } from '@/shared/lib/FormatDate';
import { useConfirm } from '@/shared/ui/ConfirmDialog';
import { RequestError } from '@/shared/ui/RequestError';

function getMealTypeLabel(menu: WeeklyMenu) {
  return menu.meal_type === 'lunch' ? 'Обід' : 'Сніданок';
}

export function WeeklyMenuArchiveWorkspace() {
  const confirm = useConfirm();
  const [selectedMenuIds, setSelectedMenuIds] = useState<string[]>([]);
  const menus = useWeeklyMenus({
    offset: 0,
    limit: 100,
    template_only: true,
    status: 'archived',
  });
  const archivedMenus = useMemo(() => menus.data?.items ?? [], [menus.data?.items]);
  const archivedMenuIds = useMemo(
    () => new Set(archivedMenus.map((menu) => menu.id)),
    [archivedMenus]
  );
  const effectiveSelectedMenuIds = useMemo(
    () => selectedMenuIds.filter((menuId) => archivedMenuIds.has(menuId)),
    [archivedMenuIds, selectedMenuIds]
  );
  const allSelected =
    archivedMenus.length > 0 && effectiveSelectedMenuIds.length === archivedMenus.length;
  const restoreMenus = useRestoreWeeklyMenus();
  const deleteMenus = useDeleteWeeklyMenus();
  const bulkActionPending = restoreMenus.isPending || deleteMenus.isPending;

  const toggleMenu = (menuId: string) => {
    setSelectedMenuIds((currentIds) =>
      currentIds.includes(menuId)
        ? currentIds.filter((id) => id !== menuId)
        : [...currentIds, menuId]
    );
  };

  const selectAll = () => {
    setSelectedMenuIds(archivedMenus.map((menu) => menu.id));
  };

  const clearSelection = () => {
    setSelectedMenuIds([]);
  };

  const handleRestoreSelected = async () => {
    if (!effectiveSelectedMenuIds.length) {
      return;
    }

    const confirmed = await confirm({
      title: 'Повернути вибрані меню з архіву?',
      description: `У роботу буде повернуто меню: ${effectiveSelectedMenuIds.length}.`,
      confirmLabel: 'Повернути',
    });

    if (!confirmed) {
      return;
    }

    try {
      const restored = await restoreMenus.mutateAsync(effectiveSelectedMenuIds);
      clearSelection();
      toast.success(`Меню повернуто з архіву: ${restored.length}.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleDeleteSelected = async () => {
    if (!effectiveSelectedMenuIds.length) {
      return;
    }

    const confirmed = await confirm({
      title: 'Остаточно видалити вибрані меню?',
      description: `Буде видалено меню: ${effectiveSelectedMenuIds.length}. Цю дію неможливо скасувати.`,
      confirmLabel: 'Видалити',
      variant: 'danger',
    });

    if (!confirmed) {
      return;
    }

    try {
      await deleteMenus.mutateAsync(effectiveSelectedMenuIds);
      clearSelection();
      toast.success(`Меню остаточно видалено: ${effectiveSelectedMenuIds.length}.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <main className="nf-page nf-page-wide">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Меню</p>
        <h1 className="nf-title">Архів тижневих меню</h1>
        <p className="nf-description">
          Тут зберігаються архівовані меню. Їх можна повернути в роботу або видалити остаточно.
        </p>
        <div className="mt-4">
          <Link href="/admin/menus" className="nf-button nf-button-secondary">
            До меню
          </Link>
        </div>
      </header>

      <section className="nf-panel border-slate-400 bg-slate-100">
        <div className="nf-panel-header bg-slate-200">
          <h2 className="nf-panel-title">Архів</h2>
        </div>
        <div className="nf-panel-body">
          <div className="mb-4 flex flex-col gap-3 border border-slate-300 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">
                Вибрано: {effectiveSelectedMenuIds.length} з {archivedMenus.length}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Позначте меню чекбоксами, щоб повернути або видалити їх разом.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="nf-button nf-button-secondary"
                disabled={!archivedMenus.length || allSelected || bulkActionPending}
                onClick={selectAll}
              >
                Обрати всі
              </button>
              <button
                type="button"
                className="nf-button nf-button-ghost"
                disabled={!effectiveSelectedMenuIds.length || bulkActionPending}
                onClick={clearSelection}
              >
                Очистити
              </button>
              <button
                type="button"
                className="nf-button nf-button-secondary"
                disabled={!effectiveSelectedMenuIds.length || bulkActionPending}
                onClick={() => void handleRestoreSelected()}
              >
                <RotateCcw className="size-4" aria-hidden />
                {restoreMenus.isPending ? 'Повертаємо…' : 'Повернути вибрані'}
              </button>
              <button
                type="button"
                className="nf-button nf-button-danger"
                disabled={!effectiveSelectedMenuIds.length || bulkActionPending}
                onClick={() => void handleDeleteSelected()}
              >
                <Trash2 className="size-4" aria-hidden />
                {deleteMenus.isPending ? 'Видаляємо…' : 'Видалити вибрані'}
              </button>
            </div>
          </div>

          {menus.isPending ? (
            <p role="status" className="text-sm text-slate-600">
              Завантажуємо архів…
            </p>
          ) : null}

          {menus.isError ? (
            <RequestError error={menus.error} onRetry={() => void menus.refetch()} />
          ) : null}

          {!menus.isPending && !menus.isError && archivedMenus.length === 0 ? (
            <div className="nf-empty">Архів порожній.</div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            {archivedMenus.map((menu) => (
              <WeeklyMenuArchiveItem
                key={menu.id}
                menu={menu}
                selected={effectiveSelectedMenuIds.includes(menu.id)}
                disabled={bulkActionPending}
                onToggle={() => toggleMenu(menu.id)}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function WeeklyMenuArchiveItem({
  menu,
  selected,
  disabled,
  onToggle,
}: {
  menu: WeeklyMenu;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const confirm = useConfirm();
  const restoreMenu = useRestoreWeeklyMenu(menu.id);
  const deleteMenu = useDeleteWeeklyMenu(menu.id);

  const handleRestore = async () => {
    try {
      await restoreMenu.mutateAsync();
      toast.success('Меню повернуто з архіву.');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Остаточно видалити меню?',
      description: `Меню "${menu.title}" буде видалено без можливості відновлення.`,
      confirmLabel: 'Видалити',
      variant: 'danger',
    });

    if (!confirmed) {
      return;
    }

    try {
      await deleteMenu.mutateAsync();
      toast.success('Меню остаточно видалено.');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <article
      className={`border p-4 shadow-[inset_0_1px_0_rgb(255_255_255/55%)] transition-colors ${
        selected
          ? 'border-[var(--nf-brand-dark)] bg-emerald-50 ring-1 ring-[var(--nf-brand)]'
          : 'border-slate-300 bg-slate-100'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <label className="mt-0.5 inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={selected}
              disabled={disabled || restoreMenu.isPending || deleteMenu.isPending}
              onChange={onToggle}
            />
            <span
              className={`inline-flex size-6 items-center justify-center border ${
                selected
                  ? 'border-[var(--nf-brand-dark)] bg-[var(--nf-brand)] text-white'
                  : 'border-slate-400 bg-white text-transparent'
              }`}
              aria-hidden
            >
              <Check className="size-4" />
            </span>
            <span className="sr-only">Обрати меню {menu.title}</span>
          </label>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-slate-800">{menu.title}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {getMealTypeLabel(menu)}
              {menu.cycle_week ? ` · цикл ${menu.cycle_week}` : ''}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Архівовано/оновлено: {formatDate(menu.updated_at)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="nf-button nf-button-secondary"
            disabled={disabled || restoreMenu.isPending || deleteMenu.isPending}
            onClick={() => void handleRestore()}
          >
            <RotateCcw className="size-4" aria-hidden />
            {restoreMenu.isPending ? 'Повертаємо…' : 'Повернути'}
          </button>
          <button
            type="button"
            className="nf-button nf-button-danger"
            disabled={disabled || restoreMenu.isPending || deleteMenu.isPending}
            onClick={() => void handleDelete()}
          >
            <Trash2 className="size-4" aria-hidden />
            {deleteMenu.isPending ? 'Видаляємо…' : 'Видалити'}
          </button>
        </div>
      </div>
    </article>
  );
}
