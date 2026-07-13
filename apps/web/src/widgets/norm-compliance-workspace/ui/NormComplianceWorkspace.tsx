"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  DatabaseZap,
  RefreshCw,
  Scale,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useNormComplianceReport } from "@/entities/norm-compliance/api/NormComplianceQueries";
import {
  complianceStatusClasses,
  complianceStatusLabels,
  type ComplianceGroup,
  type ComplianceMealSection,
  type ComplianceRow,
  type ComplianceStatus,
  type ContributionSource,
  type NormComplianceReport,
  type NormativeUnit,
  type UnmappedItem,
} from "@/entities/norm-compliance/model/NormCompliance";
import { ageGroupLabels } from "@/entities/school-group/model/SchoolGroup";
import type { MealType } from "@/entities/weekly-menu/model/WeeklyMenu";
import { RequestError } from "@/shared/ui/RequestError";

type SelectedRow = {
  group: ComplianceGroup;
  section: ComplianceMealSection;
  row: ComplianceRow;
};

const mealTypeLabels: Record<MealType, string> = {
  breakfast: "Сніданок",
  lunch: "Обід",
};

const sourceLabels: Record<ContributionSource, string> = {
  ingredient: "За інгредієнтом",
  portion_variant: "За порцією страви",
  product: "За продуктом",
};

const unitLabels: Record<NormativeUnit, string> = {
  g: "г",
  ml: "мл",
  item: "шт.",
  portion: "порц.",
};

const dateFormatter = new Intl.DateTimeFormat("uk-UA", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function NormComplianceWorkspace() {
  const searchParams = useSearchParams();
  const schoolId = searchParams.get("school_id") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";
  const mealTypeParam = searchParams.get("meal_type");
  const mealType =
    mealTypeParam === "breakfast" || mealTypeParam === "lunch"
      ? mealTypeParam
      : undefined;
  const schoolGroupId = searchParams.get("school_group_id") || undefined;
  const openedFromCalendar =
    searchParams.get("source") === "menu-requirements-calendar";
  const hasWeekContext = Boolean(schoolId && dateFrom && dateTo);
  const canLoadReport = hasWeekContext && openedFromCalendar;
  const [selectedRow, setSelectedRow] = useState<SelectedRow | null>(null);
  const report = useNormComplianceReport({
    school_id: schoolId,
    date_from: dateFrom,
    date_to: dateTo,
    meal_type: mealType,
    school_group_id: schoolGroupId,
    enabled: canLoadReport,
  });

  return (
    <main className="nf-page nf-page-wide">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Контроль харчування</p>
        <h1 className="nf-title">Дотримання норм харчування</h1>
        <p className="nf-description">
          Звіт формується для конкретного тижня, обраного в календарі
          меню-вимог. Дані школи, групи та прийому їжі переносяться з календаря.
        </p>
      </header>

      {!hasWeekContext ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <div className="nf-empty">
              <CalendarDays className="mx-auto mb-3 size-8 text-slate-400" aria-hidden />
              <p className="font-bold text-slate-800">Спочатку оберіть тиждень</p>
              <p className="mx-auto mt-1 max-w-lg text-sm">
                Відкрийте календар меню-вимог, перейдіть до потрібного тижня та
                натисніть «Сформувати дотримання норм».
              </p>
              <Link href="/menu-requirements/calendar" className="nf-button nf-button-primary mt-4">
                Перейти до календаря
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {hasWeekContext && !openedFromCalendar ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <div className="nf-empty">
              <CalendarDays className="mx-auto mb-3 size-8 text-slate-400" aria-hidden />
              <p className="font-bold text-slate-800">
                Звіт формується тільки з календаря
              </p>
              <p className="mx-auto mt-1 max-w-lg text-sm">
                Поверніться до календаря меню-вимог, оберіть конкретний тиждень
                і натисніть кнопку формування дотримання норм.
              </p>
              <Link href="/menu-requirements/calendar" className="nf-button nf-button-primary mt-4">
                Перейти до календаря
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {canLoadReport && report.data ? (
        <section className="nf-panel mb-4" aria-labelledby="report-source-title">
          <div className="nf-panel-header">
            <div>
              <p className="nf-eyebrow">Обраний тиждень</p>
              <h2 id="report-source-title" className="nf-panel-title">
                {formatDateOnly(report.data.date_from)}–{formatDateOnly(report.data.date_to)}
              </h2>
            </div>
            <div className="flex gap-2">
              <Link
                href="/menu-requirements/calendar"
                className="nf-button nf-button-secondary"
              >
                До календаря
              </Link>
              <button
                type="button"
                className="nf-button nf-button-primary"
                disabled={report.isFetching}
                onClick={() => {
                  setSelectedRow(null);
                  void report.refetch();
                }}
              >
                <RefreshCw
                  className={`size-4 ${report.isFetching ? "animate-spin" : ""}`}
                  aria-hidden
                />
                Оновити звіт
              </button>
            </div>
          </div>
          <dl className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
            <ContextValue label="Школа" value={report.data.school_name} />
            <ContextValue
              label="Групи"
              value={
                report.data.groups.length === 1
                  ? `${report.data.groups[0].school_group_name} · ${ageGroupLabels[report.data.groups[0].age_group]}`
                  : `Усі доступні · ${report.data.groups.length}`
              }
            />
            <ContextValue
              label="Прийом їжі"
              value={mealType ? mealTypeLabels[mealType] : "Усі"}
            />
            <ContextValue
              label="Тиждень"
              value={`${formatDateOnly(report.data.date_from)}–${formatDateOnly(report.data.date_to)}`}
            />
          </dl>
        </section>
      ) : null}

      {canLoadReport && report.isError ? (
        <RequestError error={report.error} onRetry={() => void report.refetch()} />
      ) : null}

      {report.isPending && canLoadReport ? (
        <section className="nf-panel">
          <div className="nf-panel-body" role="status">
            Завантажуємо звіт про виконання норм…
          </div>
        </section>
      ) : null}

      {canLoadReport && report.data ? (
        <NormComplianceReportView
          report={report.data}
          selectedRow={selectedRow}
          onSelectRow={setSelectedRow}
          onCloseDetails={() => setSelectedRow(null)}
        />
      ) : null}
    </main>
  );
}

function ContextValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-bold text-slate-900">{value}</dd>
    </div>
  );
}

export function NormComplianceReportView({
  report,
  selectedRow,
  onSelectRow,
  onCloseDetails,
}: {
  report: NormComplianceReport;
  selectedRow: SelectedRow | null;
  onSelectRow: (value: SelectedRow) => void;
  onCloseDetails: () => void;
}) {
  const summary = summarizeReport(report);
  const unmappedItems = collectUnmappedItems(report);

  return (
    <div className="space-y-4">
      <section className="nf-panel" aria-labelledby="compliance-summary-title">
        <div className="nf-panel-header">
          <div>
            <h2 id="compliance-summary-title" className="nf-panel-title">
              Підсумок · {formatDateOnly(report.date_from)}–{formatDateOnly(report.date_to)}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">{report.school_name}</p>
          </div>
          <StatusBadge status={report.status} />
        </div>
        <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <SummaryMetric
            icon={CheckCircle2}
            label="В нормі"
            value={summary.complete}
            tone="text-emerald-700"
          />
          <SummaryMetric
            icon={Scale}
            label="Відхилення"
            value={summary.deviations}
            tone="text-rose-700"
          />
          <SummaryMetric
            icon={DatabaseZap}
            label="Не визначено групу"
            value={summary.unmapped}
            tone="text-amber-700"
          />
          <SummaryMetric
            icon={AlertTriangle}
            label="Немає вимоги / застаріло"
            value={`${summary.missing} / ${summary.stale}`}
            tone="text-amber-700"
          />
        </div>
      </section>

      {report.groups.length === 0 ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <div className="nf-empty">
              За обраний період немає опублікованого меню або сформованих
              меню-вимог для перевірки.
            </div>
          </div>
        </section>
      ) : (
        <section className="nf-panel overflow-hidden" aria-labelledby="compliance-table-title">
          <div className="nf-panel-header">
            <h2 id="compliance-table-title" className="nf-panel-title">
              Норми за групами продуктів
            </h2>
            <p className="text-xs text-slate-600">Натисніть рядок для деталізації</p>
          </div>
          <div className="overflow-x-auto">
            <table className="nf-table min-w-[1120px]">
              <thead>
                <tr>
                  <th>Група продуктів</th>
                  <th>Частота</th>
                  <th className="text-right">Норма порцій</th>
                  <th className="text-right">Факт порцій</th>
                  <th className="text-right">Норма нетто / обсяг</th>
                  <th className="text-right">Факт</th>
                  <th className="text-right">Відхилення</th>
                  <th>Статус</th>
                  <th aria-label="Деталі" />
                </tr>
              </thead>
              {report.groups.map((group) =>
                group.sections.map((section) => (
                  <tbody key={`${group.school_group_id}:${section.meal_type}`}>
                    <tr className="bg-slate-100 hover:bg-slate-100">
                      <td colSpan={9} className="py-2 text-xs font-bold text-slate-700">
                        {group.school_group_name} · {ageGroupLabels[group.age_group]} ·{" "}
                        {mealTypeLabels[section.meal_type]}
                        <span className="ml-2 font-normal text-slate-500">
                          {section.expected_dates.length} дн.
                        </span>
                      </td>
                    </tr>
                    {section.rows.map((row) => (
                      <tr
                        key={row.normative_group_code}
                        className="cursor-pointer"
                        onClick={() => onSelectRow({ group, section, row })}
                      >
                        <td>
                          <button
                            type="button"
                            className="text-left font-bold text-slate-900"
                            onClick={() => onSelectRow({ group, section, row })}
                          >
                            {row.normative_group_name}
                          </button>
                          <p className="mt-0.5 max-w-[260px] text-[11px] text-slate-500">
                            Додаток {row.source_appendix}
                          </p>
                        </td>
                        <td className="max-w-[260px] text-xs text-slate-700">
                          {row.frequency}
                        </td>
                        <NumberCell value={row.required_portions} />
                        <NumberCell value={row.actual_portions} />
                        <AmountCell value={row.required_amount} unit={row.unit} />
                        <AmountCell value={row.actual_amount} unit={row.unit} />
                        <td className={`text-right font-bold ${row.deviation < 0 ? "text-rose-700" : row.deviation > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                          {formatSigned(row.deviation)} {unitLabels[row.unit]}
                        </td>
                        <td><StatusBadge status={row.status} /></td>
                        <td><ChevronRight className="size-4 text-slate-400" aria-hidden /></td>
                      </tr>
                    ))}
                  </tbody>
                )),
              )}
            </table>
          </div>
        </section>
      )}

      {unmappedItems.length > 0 ? <UnmappedItemsPanel items={unmappedItems} /> : null}

      {selectedRow ? (
        <ComplianceDetailsPanel selection={selectedRow} onClose={onCloseDetails} />
      ) : null}
    </div>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className={`size-5 shrink-0 ${tone}`} aria-hidden />
      <div>
        <p className="text-xs font-semibold text-slate-600">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ComplianceStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap border px-2 py-1 text-[11px] font-bold ${complianceStatusClasses[status]}`}>
      {complianceStatusLabels[status]}
    </span>
  );
}

function NumberCell({ value }: { value: number }) {
  return <td className="text-right tabular-nums">{formatNumber(value)}</td>;
}

function AmountCell({ value, unit }: { value: number; unit: NormativeUnit }) {
  return (
    <td className="text-right tabular-nums">
      {formatNumber(value)} <span className="text-slate-500">{unitLabels[unit]}</span>
    </td>
  );
}

function UnmappedItemsPanel({ items }: { items: UnmappedItem[] }) {
  return (
    <section className="border border-amber-300 bg-amber-50" aria-labelledby="unmapped-title">
      <div className="flex items-start gap-3 border-b border-amber-200 px-4 py-3">
        <DatabaseZap className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
        <div>
          <h2 id="unmapped-title" className="text-sm font-bold text-amber-950">
            Не визначено нормативну групу · {items.length}
          </h2>
          <p className="mt-1 text-xs text-amber-900">
            Система не змогла однозначно віднести продукт або страву до групи
            норм. Після уточнення нормативної групи меню-вимогу слід сформувати
            повторно.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-amber-200">
        {items.map((item) => (
          <li key={`${item.requirement_id}:${item.menu_item_id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
            <span className="font-bold text-slate-900">{item.item_name}</span>
            <span className="text-xs text-slate-600">{formatDateOnly(item.service_date)}</span>
            <span className="text-xs text-amber-900">Нормативну групу не визначено</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ComplianceDetailsPanel({
  selection,
  onClose,
}: {
  selection: SelectedRow;
  onClose: () => void;
}) {
  const { group, section, row } = selection;
  const breakdownByDate = useMemo(() => {
    const grouped = new Map<string, ComplianceRow["breakdown"]>();
    row.breakdown.forEach((item) => {
      grouped.set(item.service_date, [...(grouped.get(item.service_date) ?? []), item]);
    });
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [row.breakdown]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="details-title">
      <button type="button" className="absolute inset-0 bg-slate-950/35" aria-label="Закрити деталізацію" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col border-l border-slate-300 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-300 bg-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
              {group.school_group_name} · {mealTypeLabels[section.meal_type]}
            </p>
            <h2 id="details-title" className="mt-1 text-lg font-bold text-slate-950">
              {row.normative_group_name}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {row.frequency} · додаток {row.source_appendix}
            </p>
          </div>
          <button type="button" className="nf-button nf-button-ghost size-9 px-0" aria-label="Закрити" onClick={onClose}>
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-px border border-slate-300 bg-slate-300 sm:grid-cols-4">
            <DetailMetric label="Норма" value={`${formatNumber(row.required_amount)} ${unitLabels[row.unit]}`} />
            <DetailMetric label="Факт" value={`${formatNumber(row.actual_amount)} ${unitLabels[row.unit]}`} />
            <DetailMetric label="Виконання" value={row.percent === null ? "—" : `${formatNumber(row.percent)}%`} />
            <div className="bg-white p-3"><p className="text-[11px] font-bold uppercase text-slate-500">Статус</p><div className="mt-1"><StatusBadge status={row.status} /></div></div>
          </div>

          {(section.missing_dates.length > 0 || section.stale_dates.length > 0 || row.unmapped_items.length > 0) ? (
            <div className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <div className="flex gap-2 font-bold"><CircleAlert className="size-4 shrink-0" aria-hidden />Якість даних впливає на висновок</div>
              {section.missing_dates.length > 0 ? <p className="mt-2 text-xs">Немає меню-вимоги: {section.missing_dates.map(formatDateOnly).join(", ")}</p> : null}
              {section.stale_dates.length > 0 ? <p className="mt-1 text-xs">Застаріла меню-вимога: {section.stale_dates.map(formatDateOnly).join(", ")}</p> : null}
              {row.unmapped_items.length > 0 ? <p className="mt-1 text-xs">Не визначено нормативну групу: {row.unmapped_items.map((item) => item.item_name).join(", ")}</p> : null}
            </div>
          ) : null}

          <section aria-labelledby="contributions-title">
            <h3 id="contributions-title" className="text-sm font-bold text-slate-900">Як сформовано факт</h3>
            <p className="mt-1 text-xs text-slate-600">Кожний внесок показано за днем, стравою та способом зарахування.</p>
            {breakdownByDate.length === 0 ? (
              <div className="nf-empty mt-3">Для цієї нормативної групи немає врахованих внесків.</div>
            ) : (
              <div className="mt-3 space-y-3">
                {breakdownByDate.map(([date, items]) => (
                  <div key={date} className="border border-slate-300">
                    <div className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{formatDateOnly(date)}</div>
                    <ul className="divide-y divide-slate-200">
                      {items.map((item, index) => (
                        <li key={`${item.requirement_id}:${item.menu_item_id}:${item.source_id ?? index}`} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_150px_100px] sm:items-center">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900">{item.dish_name}</p>
                            <p className="mt-0.5 text-xs text-slate-600">{item.source_name}</p>
                          </div>
                          <span className="text-xs text-slate-600">{sourceLabels[item.source_type]}</span>
                          <span className="text-right font-bold tabular-nums text-slate-900">{formatNumber(item.amount)} {unitLabels[item.unit]}{item.portion_equivalent !== null ? <span className="block text-[11px] font-normal text-slate-500">{formatNumber(item.portion_equivalent)} порц.</span> : null}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="border-t border-slate-200 pt-3 text-xs text-slate-600">
            Допуск: {row.tolerance.description || `${formatNumber(row.tolerance.minimum_percent)}–${formatNumber(row.tolerance.maximum_percent)}%`}.
            {row.characteristic ? ` ${row.characteristic}` : ""}
          </div>
        </div>
      </aside>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return <div className="bg-white p-3"><p className="text-[11px] font-bold uppercase text-slate-500">{label}</p><p className="mt-1 font-bold tabular-nums text-slate-900">{value}</p></div>;
}

function summarizeReport(report: NormComplianceReport) {
  const rows = report.groups.flatMap((group) => group.sections.flatMap((section) => section.rows));
  const sections = report.groups.flatMap((group) => group.sections);
  return {
    complete: rows.filter((row) => row.status === "complete").length,
    deviations: rows.filter((row) => row.status === "under" || row.status === "over").length,
    unmapped: collectUnmappedItems(report).length,
    missing: new Set(sections.flatMap((section) => section.missing_dates)).size,
    stale: new Set(sections.flatMap((section) => section.stale_dates)).size,
  };
}

function collectUnmappedItems(report: NormComplianceReport): UnmappedItem[] {
  const items = report.groups.flatMap((group) => group.sections.flatMap((section) => section.unmapped_items));
  return [...new Map(items.map((item) => [`${item.requirement_id}:${item.menu_item_id}`, item])).values()];
}

function formatDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(value);
}

function formatSigned(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value))}`;
}
