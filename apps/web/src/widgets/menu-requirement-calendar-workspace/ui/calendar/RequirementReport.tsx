"use client";

import { ExternalLink, FileSpreadsheet, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";

import type {
  MenuRequirementReport,
  MenuRequirementReportBreakdownItem,
  MenuRequirementReportGroup,
} from "@/entities/menu-requirement/model/MenuRequirement";
import { MenuRequirementExportButton } from "@/features/menu-requirement-export/ui/MenuRequirementExportButton";
import { RequestError } from "@/shared/ui/RequestError";

import {
  formatDay,
  formatGrams,
  formatInteger,
} from "./CalendarFormatting";
import type {
  SelectedRange,
  SelectedReportCell,
} from "./RequirementCalendarTypes";
import { StatusBadge } from "./RequirementStatus";

export function RequirementReportDialog({
  range,
  report,
  isPending,
  isError,
  error,
  selectedCell,
  onSelectCell,
  onRetry,
  onClose,
}: {
  range: SelectedRange | null;
  report: MenuRequirementReport | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  selectedCell: SelectedReportCell | null;
  onSelectCell: (cell: SelectedReportCell) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!range) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, range]);

  if (!range) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-2 sm:p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        aria-labelledby="menu-requirement-report-dialog-title"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-[1180px] flex-col border border-slate-300 bg-slate-50 shadow-2xl"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="nf-eyebrow">Меню-вимога</p>
            <h2
              id="menu-requirement-report-dialog-title"
              className="text-lg font-bold text-slate-950"
            >
              {range.label}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {formatDay(range.dateFrom)} – {formatDay(range.dateTo)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {report ? (
              <MenuRequirementExportButton
                target={{
                  kind: "report",
                  request: {
                    school_id: report.school_id,
                    date_from: report.date_from,
                    date_to: report.date_to,
                    granularity: report.granularity,
                    meal_type: report.meal_type ?? undefined,
                  },
                }}
                label="Експорт в Excel"
              />
            ) : null}
            <button
              type="button"
              className="nf-button nf-button-ghost min-h-9 px-2"
              aria-label="Закрити меню-вимогу"
              onClick={onClose}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-5 pr-4 [scrollbar-gutter:stable] sm:p-4 sm:pb-6 sm:pr-5">
          {isPending ? (
            <div className="nf-panel-body bg-white">
              <p role="status" className="text-sm text-slate-600">
                Завантажуємо меню-вимогу…
              </p>
            </div>
          ) : null}

          {isError ? <RequestError error={error} onRetry={onRetry} /> : null}

          {report && !isPending ? (
            <RequirementReportTable
              report={report}
              rangeLabel={range.label}
              selectedCell={selectedCell}
              onSelectCell={onSelectCell}
              compactHeader
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
export function RequirementReportTable({
  report,
  rangeLabel,
  selectedCell,
  onSelectCell,
  compactHeader = false,
}: {
  report: MenuRequirementReport;
  rangeLabel: string;
  selectedCell: SelectedReportCell | null;
  onSelectCell: (cell: SelectedReportCell) => void;
  compactHeader?: boolean;
}) {
  if (report.groups.length === 0) {
    return (
      <section className="nf-panel">
        <div className="nf-panel-body">
          <div className="nf-empty">
            <FileSpreadsheet
              className="mx-auto mb-3 size-8 text-slate-400"
              aria-hidden
            />
            <p>Немає даних меню-вимог за обраний період.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="nf-panel overflow-hidden">
      {compactHeader ? (
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">
            {report.school_name} · Груп: {report.groups.length}
          </p>
          <StatusBadge status={report.status} />
        </div>
      ) : (
        <div className="nf-panel-header items-start">
          <div>
            <p className="nf-eyebrow">{report.school_name}</p>
            <h2 className="nf-panel-title">{rangeLabel}</h2>
            <p className="mt-1 text-xs text-slate-600">
              {formatDay(report.date_from)} - {formatDay(report.date_to)}
            </p>
          </div>
          <StatusBadge status={report.status} />
        </div>
      )}

      {report.missing_dates.length > 0 || report.stale_dates.length > 0 ? (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
          {report.missing_dates.length > 0 ? (
            <span className="mr-4">
              Пропущено: {report.missing_dates.map(formatDay).join(", ")}
            </span>
          ) : null}
          {report.stale_dates.length > 0 ? (
            <span>Застаріло: {report.stale_dates.map(formatDay).join(", ")}</span>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 p-3 pb-5 pr-4 sm:p-4 sm:pb-6 sm:pr-5">
        {report.groups.map((group) => (
          <ReportGroupTable
            key={group.school_group_id}
            group={group}
            selectedCell={selectedCell}
            onSelectCell={onSelectCell}
          />
        ))}

        {selectedCell ? <CellBreakdownPanel selectedCell={selectedCell} /> : null}
      </div>
    </section>
  );
}

function ReportGroupTable({
  group,
  selectedCell,
  onSelectCell,
}: {
  group: MenuRequirementReportGroup;
  selectedCell: SelectedReportCell | null;
  onSelectCell: (cell: SelectedReportCell) => void;
}) {
  const dishesByKey = useMemo(
    () => new Map(group.dishes.map((dish) => [dish.aggregate_key, dish])),
    [group.dishes],
  );

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-950">
          {group.school_group_name}
        </h3>
        <span className="text-xs text-slate-500">{group.age_group}</span>
      </div>
      <div className="max-h-[62vh] overflow-auto border border-slate-200 pb-3 pr-3 [scrollbar-gutter:stable]">
        <table className="w-max min-w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-800">
              <th className="w-40 min-w-40 max-w-40 border-b border-r border-slate-300 px-1.5 py-1.5 text-left">
                Інгредієнт
              </th>
              {group.dishes.map((dish) => (
                <th
                  key={dish.aggregate_key}
                  className="w-28 min-w-28 max-w-28 whitespace-normal break-words border-b border-r border-slate-300 px-1.5 py-1.5 text-center align-top"
                >
                  <span className="block font-bold">{dish.name}</span>
                  <span className="mt-0.5 block text-[10px] font-normal text-slate-600">
                    Вихід: {dish.yield_amount} г
                  </span>
                  <span className="block text-[10px] font-normal text-slate-600">
                    Дітей: {dish.children_count_total}
                  </span>
                  {dish.key_reliability === "name_fallback" ? (
                    <span className="mt-1 block text-[11px] font-semibold text-amber-700">
                      Назва
                    </span>
                  ) : null}
                </th>
              ))}
              <th className="w-24 min-w-24 max-w-24 border-b border-r border-slate-300 bg-emerald-50 px-1.5 py-1.5 text-right">
                Разом нетто, г
              </th>
              <th className="w-24 min-w-24 max-w-24 border-b border-slate-300 bg-emerald-100 px-1.5 py-1.5 text-right">
                До видачі, г
              </th>
            </tr>
          </thead>
          <tbody>
            {group.ingredient_rows.map((row) => {
              const cellsByDish = new Map(
                row.cells.map((cell) => [cell.dish_key, cell]),
              );

              return (
                <tr
                  key={row.key}
                  className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50"
                >
                  <th className="w-40 min-w-40 max-w-40 whitespace-normal break-words border-r border-slate-300 bg-white px-1.5 py-1 text-left font-medium text-slate-900">
                    {row.ingredient_name}
                  </th>
                  {group.dishes.map((dish) => {
                    const cell = cellsByDish.get(dish.aggregate_key);
                    const selected =
                      selectedCell?.group.school_group_id ===
                        group.school_group_id &&
                      selectedCell.cell.dish_key === dish.aggregate_key &&
                      selectedCell.ingredientName === row.ingredient_name;

                    return (
                      <td
                        key={dish.aggregate_key}
                        className="w-28 min-w-28 max-w-28 border-r border-slate-200 p-0 text-right tabular-nums"
                      >
                        {cell ? (
                          <button
                            type="button"
                            className={`min-h-11 w-full px-1.5 py-1 text-right transition-colors ${
                              selected
                                ? "bg-emerald-700 text-white"
                                : "text-slate-800 hover:bg-emerald-50"
                            }`}
                            onClick={() =>
                              onSelectCell({
                                group,
                                dish: dishesByKey.get(cell.dish_key) ?? dish,
                                ingredientName: row.ingredient_name,
                                cell,
                              })
                            }
                          >
                            <span className="block font-bold">
                              {formatInteger(cell.issue_total_rounded_g)}
                            </span>
                            <span
                              className={`block text-[10px] ${
                                selected ? "text-emerald-50" : "text-slate-500"
                              }`}
                            >
                              нетто {formatGrams(cell.net_per_person_g)}
                            </span>
                          </button>
                        ) : (
                          <span className="block px-1.5 py-1 text-slate-400">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="w-24 min-w-24 max-w-24 border-r border-slate-300 bg-emerald-50/50 px-1.5 py-1 text-right font-bold tabular-nums text-slate-900">
                    {formatGrams(row.per_person_total_g)}
                  </td>
                  <td className="w-24 min-w-24 max-w-24 bg-emerald-100/60 px-1.5 py-1 text-right font-bold tabular-nums text-emerald-950">
                    {formatInteger(row.issue_total_rounded_g)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CellBreakdownPanel({
  selectedCell,
}: {
  selectedCell: SelectedReportCell;
}) {
  return (
    <section className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="nf-eyebrow">{selectedCell.group.school_group_name}</p>
        <h3 className="text-base font-bold text-slate-950">
          {selectedCell.ingredientName} / {selectedCell.dish.name}
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          До видачі: {formatInteger(selectedCell.cell.issue_total_rounded_g)} г
        </p>
      </div>
      <div className="overflow-x-auto pb-3 pr-3 [scrollbar-gutter:stable]">
        <table className="min-w-[760px] border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-left text-slate-800">
              <th className="border-b border-slate-300 px-2 py-1.5">Дата</th>
              <th className="border-b border-slate-300 px-2 py-1.5">Меню</th>
              <th className="border-b border-slate-300 px-2 py-1.5 text-right">
                Нетто, г
              </th>
              <th className="border-b border-slate-300 px-2 py-1.5 text-right">
                Дітей
              </th>
              <th className="border-b border-slate-300 px-2 py-1.5 text-right">
                Raw, г
              </th>
              <th className="border-b border-slate-300 px-2 py-1.5 text-right">
                До видачі, г
              </th>
              <th className="border-b border-slate-300 px-2 py-1.5">Статус</th>
              <th className="border-b border-slate-300 px-2 py-1.5 text-right">
                День
              </th>
            </tr>
          </thead>
          <tbody>
            {selectedCell.cell.breakdown.map((item) => (
              <BreakdownRow
                key={`${item.service_date}:${item.requirement_id ?? "missing"}`}
                item={item}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BreakdownRow({ item }: { item: MenuRequirementReportBreakdownItem }) {
  return (
    <tr className="border-b border-slate-200 last:border-b-0">
      <td className="px-2 py-1.5 font-medium text-slate-900">
        {formatDay(item.service_date)}
      </td>
      <td className="px-2 py-1.5 text-slate-700">
        {item.menu_title ?? "Денну меню-вимогу не сформовано"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
        {item.net_per_person_g ? formatGrams(item.net_per_person_g) : "-"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
        {item.children_count ?? "-"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
        {item.issue_total_raw_g ? formatGrams(item.issue_total_raw_g) : "-"}
      </td>
      <td className="px-2 py-1.5 text-right font-bold tabular-nums text-slate-900">
        {item.issue_total_rounded_g !== null
          ? formatInteger(item.issue_total_rounded_g)
          : "-"}
      </td>
      <td className="px-2 py-1.5">
        <StatusBadge status={item.status} />
      </td>
      <td className="px-2 py-1.5 text-right">
        {item.requirement_id ? (
          <Link
            className="nf-button nf-button-secondary min-h-8 px-2 text-xs"
            href={`/menu-requirements?requirement_id=${item.requirement_id}`}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Відкрити
          </Link>
        ) : (
          <span className="text-xs text-slate-500">Немає</span>
        )}
      </td>
    </tr>
  );
}
