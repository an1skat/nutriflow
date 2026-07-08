"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { useWeeklyMenus } from "@/entities/weekly-menu/api/WeeklyMenuQueries";
import type { WeeklyMenu } from "@/entities/weekly-menu/model/WeeklyMenu";
import {
  useDeleteWeeklyMenu,
  useRestoreWeeklyMenu,
} from "@/features/weekly-menu-editor/model/UseWeeklyMenuMutations";
import { getApiErrorMessage } from "@/shared/api/HttpClient";
import { formatDate } from "@/shared/lib/FormatDate";
import { RequestError } from "@/shared/ui/RequestError";

function getMealTypeLabel(menu: WeeklyMenu) {
  return menu.meal_type === "lunch" ? "Обід" : "Сніданок";
}

export function WeeklyMenuArchiveWorkspace() {
  const menus = useWeeklyMenus({
    offset: 0,
    limit: 100,
    template_only: true,
    status: "archived",
  });

  return (
    <main className="nf-page nf-page-wide">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Меню</p>
        <h1 className="nf-title">Архів тижневих меню</h1>
        <p className="nf-description">
          Тут зберігаються архівовані меню. Їх можна повернути в роботу або
          видалити остаточно.
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
          {menus.isPending ? (
            <p role="status" className="text-sm text-slate-600">
              Завантажуємо архів…
            </p>
          ) : null}

          {menus.isError ? (
            <RequestError
              error={menus.error}
              onRetry={() => void menus.refetch()}
            />
          ) : null}

          {!menus.isPending && !menus.isError && menus.data?.items.length === 0 ? (
            <div className="nf-empty">Архів порожній.</div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            {menus.data?.items.map((menu) => (
              <WeeklyMenuArchiveItem key={menu.id} menu={menu} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function WeeklyMenuArchiveItem({ menu }: { menu: WeeklyMenu }) {
  const restoreMenu = useRestoreWeeklyMenu(menu.id);
  const deleteMenu = useDeleteWeeklyMenu(menu.id);

  const handleRestore = async () => {
    try {
      await restoreMenu.mutateAsync();
      toast.success("Меню повернуто з архіву.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Остаточно видалити меню "${menu.title}"? Цю дію неможливо скасувати.`,
      )
    ) {
      return;
    }

    try {
      await deleteMenu.mutateAsync();
      toast.success("Меню остаточно видалено.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <article className="border border-slate-300 bg-slate-100 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/55%)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-slate-800">
            {menu.title}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {getMealTypeLabel(menu)}
            {menu.cycle_week ? ` · цикл ${menu.cycle_week}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Архівовано/оновлено: {formatDate(menu.updated_at)}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="nf-button nf-button-secondary"
            disabled={restoreMenu.isPending || deleteMenu.isPending}
            onClick={() => void handleRestore()}
          >
            <RotateCcw className="size-4" aria-hidden />
            {restoreMenu.isPending ? "Повертаємо…" : "Повернути"}
          </button>
          <button
            type="button"
            className="nf-button nf-button-danger"
            disabled={restoreMenu.isPending || deleteMenu.isPending}
            onClick={() => void handleDelete()}
          >
            <Trash2 className="size-4" aria-hidden />
            {deleteMenu.isPending ? "Видаляємо…" : "Видалити"}
          </button>
        </div>
      </div>
    </article>
  );
}
