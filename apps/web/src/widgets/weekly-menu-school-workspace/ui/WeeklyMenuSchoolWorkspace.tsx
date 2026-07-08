"use client";

import { Archive, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  useWeeklyMenu,
  useWeeklyMenus,
} from "@/entities/weekly-menu/api/WeeklyMenuQueries";
import type { WeeklyMenu } from "@/entities/weekly-menu/model/WeeklyMenu";
import {
  useArchiveSchoolWeeklyMenu,
  useRestoreSchoolWeeklyMenu,
} from "@/features/weekly-menu-editor/model/UseWeeklyMenuMutations";
import { weeklyMenuToFormValues } from "@/features/weekly-menu-editor/model/WeeklyMenuFormSchema";
import { WeeklyMenuEditorForm } from "@/features/weekly-menu-editor/ui/WeeklyMenuEditorForm";
import { getApiErrorMessage } from "@/shared/api/HttpClient";
import { formatDate } from "@/shared/lib/FormatDate";
import { RequestError } from "@/shared/ui/RequestError";

export function WeeklyMenuSchoolWorkspace() {
  const menus = useWeeklyMenus({
    offset: 0,
    limit: 100,
    status: "published",
  });
  const archivedMenus = useWeeklyMenus({
    offset: 0,
    limit: 100,
    status: "archived",
  });
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const effectiveSelectedMenuId = selectedMenuId ?? menus.data?.items[0]?.id ?? null;
  const selectedMenu = useWeeklyMenu(effectiveSelectedMenuId ?? "");
  const archiveSelectedMenu = useArchiveSchoolWeeklyMenu(selectedMenu.data?.id ?? "");

  const editorInitialValues = useMemo(
    () => (selectedMenu.data ? weeklyMenuToFormValues(selectedMenu.data) : null),
    [selectedMenu.data],
  );

  const handleArchiveSelectedMenu = async () => {
    if (!selectedMenu.data) {
      return;
    }

    if (!window.confirm(`Архівувати меню "${selectedMenu.data.title}" у школі?`)) {
      return;
    }

    try {
      await archiveSelectedMenu.mutateAsync();
      setSelectedMenuId(null);
      toast.success("Меню перенесено в архів школи.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Меню школи</p>
        <h1 className="nf-title">Тижневе меню</h1>
        <p className="nf-description">
          Після входу школа одразу бачить опубліковане тижневе меню. Редагування
          на шкільному акаунті вимкнене.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="nf-panel">
            <div className="nf-panel-header">
              <h2 className="nf-panel-title">Доступні меню</h2>
            </div>
            <div className="nf-panel-body space-y-3">
              {menus.isPending ? (
                <p role="status" className="text-sm text-slate-600">
                  Завантажуємо меню…
                </p>
              ) : null}

              {menus.isError ? (
                <RequestError
                  error={menus.error}
                  onRetry={() => void menus.refetch()}
                />
              ) : null}

              {menus.data?.items.length === 0 ? (
                <div className="nf-empty">
                  Для вашої школи ще не опубліковано тижневих меню.
                </div>
              ) : null}

              {menus.data?.items.map((menu) => {
                const isActive = effectiveSelectedMenuId === menu.id;

                return (
                  <button
                    key={menu.id}
                    type="button"
                    onClick={() => setSelectedMenuId(menu.id)}
                    className={`w-full border p-3 text-left ${
                      isActive
                        ? "border-[var(--nf-brand-dark)] bg-[var(--nf-panel-head)]"
                        : "border-[var(--nf-line)] bg-white hover:bg-slate-50"
                    }`}
                  >
                    <p className="font-bold text-slate-900">{menu.title}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {menu.meal_type === "lunch" ? "Обід" : "Сніданок"}
                      {menu.cycle_week ? ` · цикл ${menu.cycle_week}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Опубліковано:{" "}
                      {menu.published_at
                        ? formatDate(menu.published_at)
                        : "дата не вказана"}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="nf-panel">
            <div className="nf-panel-header">
              <h2 className="nf-panel-title">Архів школи</h2>
            </div>
            <div className="nf-panel-body space-y-3">
              {archivedMenus.isPending ? (
                <p role="status" className="text-sm text-slate-600">
                  Завантажуємо архів…
                </p>
              ) : null}

              {archivedMenus.isError ? (
                <RequestError
                  error={archivedMenus.error}
                  onRetry={() => void archivedMenus.refetch()}
                />
              ) : null}

              {archivedMenus.data?.items.length === 0 ? (
                <div className="nf-empty">В архіві школи немає меню.</div>
              ) : null}

              {archivedMenus.data?.items.map((menu) => (
                <ArchivedSchoolMenuItem
                  key={menu.id}
                  menu={menu}
                  onRestored={(restoredMenuId) => {
                    setSelectedMenuId(restoredMenuId);
                  }}
                />
              ))}
            </div>
          </section>

          {selectedMenu.data ? (
            <section className="nf-panel">
              <div className="nf-panel-header">
                <h2 className="nf-panel-title">Деталі меню</h2>
              </div>
              <div className="nf-panel-body space-y-3">
                <p className="text-sm text-slate-700">
                  Опубліковане меню оновлено: {formatDate(selectedMenu.data.updated_at)}
                </p>
                <p className="text-sm text-slate-700">
                  Дата публікації:{" "}
                  {selectedMenu.data.published_at
                    ? formatDate(selectedMenu.data.published_at)
                    : "не вказана"}
                </p>
                <button
                  type="button"
                  className="nf-button nf-button-secondary w-full"
                  disabled={archiveSelectedMenu.isPending}
                  onClick={() => void handleArchiveSelectedMenu()}
                >
                  <Archive className="size-4" aria-hidden />
                  {archiveSelectedMenu.isPending
                    ? "Архівуємо…"
                    : "Архівувати у школі"}
                </button>
              </div>
            </section>
          ) : null}
        </aside>

        <div className="space-y-5">
          {selectedMenu.isPending && effectiveSelectedMenuId ? (
            <section className="nf-panel">
              <div className="nf-panel-body">
                <p role="status" className="text-sm text-slate-600">
                  Завантажуємо вибране меню…
                </p>
              </div>
            </section>
          ) : null}

          {selectedMenu.isError ? (
            <RequestError
              error={selectedMenu.error}
              onRetry={() => void selectedMenu.refetch()}
            />
          ) : null}

          {selectedMenu.data && editorInitialValues ? (
            <WeeklyMenuEditorForm
              key={`${selectedMenu.data.id}:${selectedMenu.data.updated_at}`}
              initialValues={editorInitialValues}
              mode="school-readonly"
              submitLabel=""
              saving={false}
              onSubmit={async () => {}}
              recipeCatalogEnabled={false}
              headerNote={
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-900">
                    Опубліковане меню для вашої школи
                  </p>
                  <p className="text-xs text-slate-600">
                    Це меню надійшло від адміністратора або власника і доступне
                    лише для перегляду.
                  </p>
                </div>
              }
            />
          ) : menus.isPending || selectedMenu.isPending ? null : (
            <section className="nf-panel">
              <div className="nf-panel-body">
                <div className="nf-empty">
                  Немає опублікованого меню. Дочекайтеся розсилки від
                  адміністратора або власника.
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function ArchivedSchoolMenuItem({
  menu,
  onRestored,
}: {
  menu: WeeklyMenu;
  onRestored: (menuId: string) => void;
}) {
  const restoreMenu = useRestoreSchoolWeeklyMenu(menu.id);

  const handleRestore = async () => {
    try {
      const restoredMenu = await restoreMenu.mutateAsync();
      onRestored(restoredMenu.id);
      toast.success("Меню повернуто в роботу.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <div className="border border-[var(--nf-line)] bg-white p-3">
      <p className="font-bold text-slate-900">{menu.title}</p>
      <p className="mt-1 text-xs text-slate-600">
        {menu.meal_type === "lunch" ? "Обід" : "Сніданок"}
        {menu.cycle_week ? ` · цикл ${menu.cycle_week}` : ""}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Архівовано: {formatDate(menu.updated_at)}
      </p>
      <button
        type="button"
        className="nf-button nf-button-secondary mt-3 w-full"
        disabled={restoreMenu.isPending}
        onClick={() => void handleRestore()}
      >
        <RotateCcw className="size-4" aria-hidden />
        {restoreMenu.isPending ? "Повертаємо…" : "Повернути"}
      </button>
    </div>
  );
}
