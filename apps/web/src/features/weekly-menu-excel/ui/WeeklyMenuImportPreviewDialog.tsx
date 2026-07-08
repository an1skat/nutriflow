"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  X,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import {
  getImportPreviewSummary,
  type WeeklyMenuImportPreview,
} from "../model/WeeklyMenuExcel";
import { WeeklyMenuImportPreviewTable } from "./WeeklyMenuImportPreviewTable";

type WeeklyMenuImportPreviewDialogProps = {
  open: boolean;
  preview: WeeklyMenuImportPreview | null;
  activeSheet: number;
  previewExpired: boolean;
  commitPending: boolean;
  commitDisabled: boolean;
  onActiveSheetChange: (index: number) => void;
  onClose: () => void;
  onCommit: () => void;
};

export function WeeklyMenuImportPreviewDialog({
  open,
  preview,
  activeSheet,
  previewExpired,
  commitPending,
  commitDisabled,
  onActiveSheetChange,
  onClose,
  onCommit,
}: WeeklyMenuImportPreviewDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  const previewSummary = useMemo(
    () => (preview ? getImportPreviewSummary(preview) : null),
    [preview],
  );

  if (!open || !preview) {
    return null;
  }

  const diagnostics = preview.diagnostics;
  const errors = diagnostics.filter((diagnostic) => diagnostic.level === "error");
  const warnings = diagnostics.filter(
    (diagnostic) => diagnostic.level === "warning",
  );
  const safeActiveSheet =
    activeSheet < preview.menus.length ? activeSheet : 0;
  const activePreviewMenu = preview.menus[safeActiveSheet];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[1px] sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-menu-preview-title"
        className="flex max-h-[90vh] w-full max-w-[1220px] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl"
      >
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              {preview.commit_ready && !previewExpired ? (
                <CheckCircle2 size={19} className="shrink-0 text-emerald-700" />
              ) : (
                <AlertTriangle size={19} className="shrink-0 text-amber-700" />
              )}
              <h2
                id="weekly-menu-preview-title"
                className="truncate text-base font-bold text-slate-950"
              >
                Попередній перегляд меню
              </h2>
            </div>
            <p className="mt-1 truncate text-sm text-slate-600">
              {preview.filename}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="nf-button nf-button-primary"
              disabled={commitDisabled}
              onClick={onCommit}
            >
              {commitPending ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <CheckCircle2 size={15} />
              )}
              Імпортувати {previewSummary?.menus ?? 0} тиж.
            </button>
            <button
              type="button"
              className="nf-button nf-button-ghost"
              aria-label="Закрити preview"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-5">
            <SummaryTile label="Тижні" value={previewSummary?.menus ?? 0} />
            <SummaryTile label="Дні" value={previewSummary?.days ?? 0} />
            <SummaryTile label="Позиції" value={previewSummary?.items ?? 0} />
            <SummaryTile label="Помилки" value={errors.length} tone="danger" />
            <SummaryTile
              label="Попередження"
              value={warnings.length}
              tone="warning"
            />
          </div>

          {previewExpired ? (
            <div className="nf-error">
              Термін дії цього preview минув. Натисніть «Перевірити файл» ще раз.
            </div>
          ) : null}

          {diagnostics.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {errors.length ? (
                <DiagnosticList
                  title="Помилки"
                  diagnostics={errors}
                  tone="error"
                />
              ) : null}
              {warnings.length ? (
                <DiagnosticList
                  title="Попередження"
                  diagnostics={warnings}
                  tone="warning"
                />
              ) : null}
            </div>
          ) : (
            <div className="border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Формат файлу коректний, критичних зауважень немає.
            </div>
          )}

          {preview.menus.length ? (
            <div className="grid min-h-0 gap-4 xl:grid-cols-[230px_minmax(0,1fr)]">
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-slate-500">
                  Аркуші файлу
                </p>
                <div className="max-h-64 space-y-2 overflow-auto pr-1 xl:max-h-[58vh]">
                  {preview.menus.map((entry, index) => {
                    const isActive = safeActiveSheet === index;

                    return (
                      <button
                        key={`${entry.sheet_name}-${index}`}
                        type="button"
                        className={`w-full border px-3 py-2 text-left text-sm transition ${
                          isActive
                            ? "border-[var(--nf-brand-dark)] bg-[var(--nf-brand)] text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                        onClick={() => onActiveSheetChange(index)}
                      >
                        <span className="flex items-center gap-2 font-bold">
                          <FileSpreadsheet size={14} />
                          {entry.sheet_name}
                        </span>
                        <span
                          className={`mt-1 block text-xs ${
                            isActive ? "text-white/80" : "text-slate-500"
                          }`}
                        >
                          {entry.menu.cycle_week
                            ? `Тиждень ${entry.menu.cycle_week}`
                            : "Без номера тижня"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {activePreviewMenu ? (
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-950">
                        {activePreviewMenu.menu.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-600">
                        {activePreviewMenu.menu.meal_type === "lunch"
                          ? "Обід"
                          : "Сніданок"}
                        {activePreviewMenu.menu.cycle_week
                          ? ` · тиждень ${activePreviewMenu.menu.cycle_week}`
                          : ""}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500">
                      Чинний до{" "}
                      {new Date(preview.expires_at).toLocaleString("uk-UA")}
                    </p>
                  </div>

                  <WeeklyMenuImportPreviewTable menu={activePreviewMenu.menu} />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="nf-empty">
              У файлі не знайдено жодного тижневого меню для перегляду.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger" | "warning";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-white text-slate-800";

  return (
    <div className={`border px-3 py-2 ${toneClass}`}>
      <div className="text-[11px] font-bold uppercase opacity-75">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function DiagnosticList({
  title,
  diagnostics,
  tone,
}: {
  title: string;
  diagnostics: WeeklyMenuImportPreview["diagnostics"];
  tone: "error" | "warning";
}) {
  return (
    <div
      className={
        tone === "error"
          ? "border border-red-300 bg-red-50 p-3"
          : "border border-amber-300 bg-amber-50 p-3"
      }
    >
      <p className="font-bold text-slate-900">
        {title}: {diagnostics.length}
      </p>
      <ul className="mt-2 max-h-36 space-y-2 overflow-auto text-xs text-slate-700">
        {diagnostics.map((diagnostic, index) => {
          const location = [
            diagnostic.sheet_name,
            diagnostic.cell ??
              (diagnostic.row_number
                ? `рядок ${diagnostic.row_number}`
                : null),
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <li key={`${diagnostic.code}-${diagnostic.cell}-${index}`}>
              {location ? (
                <span className="font-bold">{location}: </span>
              ) : null}
              {diagnostic.message}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
