"use client";

import { ArrowLeft, ChevronRight, Eye, Scale } from "lucide-react";
import Link from "next/link";

import type {
  MenuRequirementCalendarDay,
  MenuRequirementCalendarMonth,
  MenuRequirementCalendarWeek,
} from "@/entities/menu-requirement/model/MenuRequirement";
import type { MealType } from "@/entities/weekly-menu/model/WeeklyMenu";

import {
  formatDayWithoutYear,
  formatFullDay,
  formatShortRange,
  monthName,
  monthNameFromDate,
  weekdayName,
} from "./CalendarFormatting";
import {
  CalendarStatusBadge,
  EmptyStatusBadge,
  Metric,
  StatusBadge,
} from "./RequirementStatus";
import type { SelectedRange } from "./RequirementCalendarTypes";

const incompleteWeekHint =
  "Щоб сформувати тижневу меню-вимогу або дотримання норм, спочатку сформуйте або оновіть меню-вимоги за всі 5 робочих днів.";
const incompleteMonthHint =
  "Щоб сформувати місячну меню-вимогу, спочатку сформуйте або оновіть меню-вимоги за всі дні, що беруть участь у цьому місяці.";

export function RequirementPeriodNavigator({
  months,
  selectedMonth,
  selectedWeek,
  year,
  onSelectMonth,
  onSelectWeek,
  onBackToMonths,
  onBackToWeeks,
  onOpenReport,
  allowIncompleteReports = false,
  normComplianceHref,
}: {
  months: MenuRequirementCalendarMonth[];
  selectedMonth: MenuRequirementCalendarMonth | null;
  selectedWeek: MenuRequirementCalendarWeek | null;
  year: number;
  onSelectMonth: (month: MenuRequirementCalendarMonth) => void;
  onSelectWeek: (week: MenuRequirementCalendarWeek) => void;
  onBackToMonths: () => void;
  onBackToWeeks: () => void;
  onOpenReport: (range: SelectedRange) => void;
  allowIncompleteReports?: boolean;
  normComplianceHref?: string;
}) {
  const selectedPeriodBlockReason = allowIncompleteReports
    ? null
    : selectedWeek
      ? getWeekReportBlockReason(selectedWeek)
      : selectedMonth
        ? getMonthReportBlockReason(selectedMonth)
        : null;
  const title = selectedWeek
    ? `Робочі дні · тиждень ${selectedWeek.week_index}`
    : selectedMonth
      ? `Тижні · ${monthName(year, selectedMonth.month)}`
      : `Місяці · ${year}`;
  const description = selectedWeek
    ? "Оберіть день, щоб переглянути меню-вимоги окремих груп."
    : selectedMonth
      ? "Оберіть тиждень, щоб перейти до його робочих днів."
      : "Почніть із місяця, за який потрібно переглянути меню-вимоги.";
  const openCurrentReport = () => {
    if (selectedPeriodBlockReason) {
      return;
    }
    onOpenReport(
      selectedWeek
        ? {
            dateFrom: selectedWeek.date_from,
            dateTo: selectedWeek.date_to,
            granularity: "week",
            label: `Тиждень ${selectedWeek.week_index} · ${formatShortRange(
              selectedWeek.date_from,
              selectedWeek.date_to,
            )}`,
          }
        : {
            dateFrom: selectedMonth?.date_from ?? "",
            dateTo: selectedMonth?.date_to ?? "",
            granularity: "month",
            label: selectedMonth ? monthName(year, selectedMonth.month) : "",
          },
    );
  };

  return (
    <>
      <div className="nf-panel-header flex-col items-stretch gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <nav
            aria-label="Навігація календарем меню-вимог"
            className="mb-2 flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-500"
          >
            <button
              type="button"
              className="hover:text-emerald-800 hover:underline"
              onClick={onBackToMonths}
            >
              {year}
            </button>
            {selectedMonth ? (
              <>
                <ChevronRight className="size-3.5" aria-hidden />
                <button
                  type="button"
                  className="hover:text-emerald-800 hover:underline"
                  onClick={onBackToWeeks}
                >
                  {monthNameFromDate(selectedMonth.date_from)}
                </button>
              </>
            ) : null}
            {selectedWeek ? (
              <>
                <ChevronRight className="size-3.5" aria-hidden />
                <span className="text-slate-800">
                  {formatShortRange(
                    selectedWeek.date_from,
                    selectedWeek.date_to,
                  )}
                </span>
              </>
            ) : null}
          </nav>
          <h2 className="nf-panel-title">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>

        {selectedMonth ? (
          <div className="grid w-full shrink-0 gap-2 sm:w-auto">
            <div className="grid gap-2 sm:flex sm:justify-end">
              <button
                type="button"
                className="nf-button nf-button-secondary min-h-9 w-full px-3 text-sm sm:w-auto"
                onClick={selectedWeek ? onBackToWeeks : onBackToMonths}
              >
                <ArrowLeft className="size-4" aria-hidden />
                Назад
              </button>
              {selectedWeek && normComplianceHref ? (
                selectedPeriodBlockReason ? (
                  <button
                    type="button"
                    className="nf-button nf-button-primary min-h-9 w-full px-3 text-sm sm:w-auto"
                    disabled
                    title={selectedPeriodBlockReason}
                  >
                    <Scale className="size-4" aria-hidden />
                    Сформувати дотримання норм
                  </button>
                ) : (
                  <Link
                    href={normComplianceHref}
                    className="nf-button nf-button-primary min-h-9 w-full px-3 text-sm sm:w-auto"
                  >
                    <Scale className="size-4" aria-hidden />
                    Сформувати дотримання норм
                  </Link>
                )
              ) : null}
              <button
                type="button"
                className="nf-button nf-button-secondary min-h-9 w-full px-3 text-sm sm:w-auto"
                disabled={Boolean(selectedPeriodBlockReason)}
                title={selectedPeriodBlockReason ?? undefined}
                onClick={openCurrentReport}
              >
                <Eye className="size-4" aria-hidden />
                {selectedWeek
                  ? "Меню-вимога за тиждень"
                  : "Меню-вимога за місяць"}
              </button>
            </div>
            {selectedPeriodBlockReason ? (
              <p className="max-w-xl text-xs font-semibold leading-5 text-amber-800 sm:text-right">
                {selectedPeriodBlockReason}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="nf-panel-body">
        {selectedWeek ? (
          <RequirementDayGrid
            days={selectedWeek.days}
            onOpenReport={(day) =>
              onOpenReport({
                dateFrom: day.service_date,
                dateTo: day.service_date,
                granularity: "day",
                label: formatFullDay(day.service_date),
              })
            }
          />
        ) : selectedMonth ? (
          <RequirementWeekGrid
            weeks={selectedMonth.weeks}
            onSelect={onSelectWeek}
          />
        ) : (
          <RequirementMonthGrid months={months} onSelect={onSelectMonth} />
        )}
      </div>
    </>
  );
}
export function buildNormComplianceHref({
  schoolId,
  dateFrom,
  dateTo,
  mealType,
  schoolGroupId,
}: {
  schoolId: string;
  dateFrom: string;
  dateTo: string;
  mealType?: MealType;
  schoolGroupId?: string;
}) {
  const params = new URLSearchParams({
    school_id: schoolId,
    date_from: dateFrom,
    date_to: dateTo,
    source: "menu-requirements-calendar",
  });
  if (mealType) params.set("meal_type", mealType);
  if (schoolGroupId) params.set("school_group_id", schoolGroupId);
  return `/norm-compliance?${params.toString()}`;
}

function getWeekReportBlockReason(
  week: MenuRequirementCalendarWeek,
): string | null {
  const allWeekdaysHaveRequirements =
    week.days.length === 5 &&
    week.days.every(
      (day) =>
        day.expected_requirements > 0 &&
        day.generated_requirements >= day.expected_requirements &&
        day.missing_requirements === 0 &&
        day.stale_requirements === 0,
    );

  return allWeekdaysHaveRequirements ? null : incompleteWeekHint;
}

function getMonthReportBlockReason(
  month: MenuRequirementCalendarMonth,
): string | null {
  const participatingDays = month.weeks
    .flatMap((week) => week.days)
    .filter(
      (day) =>
        day.service_date >= month.date_from &&
        day.service_date <= month.date_to &&
        day.expected_requirements > 0,
    );
  const allParticipatingDaysHaveRequirements =
    participatingDays.length > 0 &&
    participatingDays.every(
      (day) =>
        day.generated_requirements >= day.expected_requirements &&
        day.missing_requirements === 0 &&
        day.stale_requirements === 0,
    ) &&
    month.stale_days === 0;

  return allParticipatingDaysHaveRequirements ? null : incompleteMonthHint;
}

function RequirementMonthGrid({
  months,
  onSelect,
}: {
  months: MenuRequirementCalendarMonth[];
  onSelect: (month: MenuRequirementCalendarMonth) => void;
}) {
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3 xl:grid-cols-4">
      {months.map((month) => (
        <button
          key={month.month}
          type="button"
          className="group min-h-36 w-[82vw] max-w-80 shrink-0 snap-start border border-slate-200 bg-white p-3 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/40 sm:w-auto sm:max-w-none sm:shrink"
          onClick={() => onSelect(month)}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="text-sm font-bold text-slate-950">
              {monthNameFromDate(month.date_from)}
            </span>
            <CalendarStatusBadge
              status={month.status}
              generated={month.generated_days}
              missing={month.missing_days}
              stale={month.stale_days}
            />
          </span>
          <span className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <Metric label="Днів" value={month.working_days} />
            <Metric label="Є" value={month.generated_days} />
            <Metric
              label="Пробл."
              value={month.missing_days + month.stale_days}
            />
          </span>
          <span className="mt-3 flex items-center justify-between text-xs font-bold text-emerald-800">
            Перейти до тижнів
            <ChevronRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </button>
      ))}
    </div>
  );
}

function RequirementWeekGrid({
  weeks,
  onSelect,
}: {
  weeks: MenuRequirementCalendarWeek[];
  onSelect: (week: MenuRequirementCalendarWeek) => void;
}) {
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-3">
      {weeks.map((week) => (
        <button
          key={`${week.date_from}:${week.date_to}`}
          type="button"
          className="group w-[82vw] max-w-80 shrink-0 snap-start border border-slate-200 bg-white p-4 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/40 md:w-auto md:max-w-none md:shrink"
          onClick={() => onSelect(week)}
        >
          <span className="flex items-start justify-between gap-2">
            <span>
              <span className="block text-sm font-bold text-slate-950">
                Тиждень {week.week_index}
              </span>
              <span className="mt-1 block text-xs text-slate-600">
                {formatShortRange(week.date_from, week.date_to)}
              </span>
            </span>
            <CalendarStatusBadge
              status={week.status}
              generated={week.generated_days}
              missing={week.missing_days}
              stale={week.stale_days}
            />
          </span>
          <span className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <Metric label="Є" value={week.generated_days} />
            <Metric label="Проп." value={week.missing_days} />
            <Metric label="Заст." value={week.stale_days} />
          </span>
          <span className="mt-3 flex items-center justify-between text-xs font-bold text-emerald-800">
            Перейти до робочих днів
            <ChevronRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </button>
      ))}
    </div>
  );
}

function RequirementDayGrid({
  days,
  onOpenReport,
}: {
  days: MenuRequirementCalendarDay[];
  onOpenReport: (day: MenuRequirementCalendarDay) => void;
}) {
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-5">
      {days.map((day) => {
        const hasNoData =
          day.expected_requirements === 0 && day.generated_requirements === 0;

        return (
          <article
            key={day.service_date}
            className="flex min-h-52 w-[82vw] max-w-80 shrink-0 snap-start flex-col border border-slate-200 bg-white p-4 md:w-auto md:max-w-none md:shrink"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                  {weekdayName(day.service_date)}
                </p>
                <h3 className="mt-1 text-base font-bold text-slate-950">
                  {formatDayWithoutYear(day.service_date)}
                </h3>
              </div>
              {hasNoData ? (
                <EmptyStatusBadge />
              ) : (
                <StatusBadge status={day.status} />
              )}
            </div>

            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-600">Сформовано</dt>
                <dd className="font-bold tabular-nums text-slate-950">
                  {day.generated_requirements}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-600">Очікується</dt>
                <dd className="font-bold tabular-nums text-slate-950">
                  {day.expected_requirements}
                </dd>
              </div>
              {day.missing_requirements + day.stale_requirements > 0 ? (
                <div className="flex items-center justify-between gap-3 text-amber-800">
                  <dt>Потребують уваги</dt>
                  <dd className="font-bold tabular-nums">
                    {day.missing_requirements + day.stale_requirements}
                  </dd>
                </div>
              ) : null}
            </dl>

            <button
              type="button"
              className="nf-button nf-button-secondary mt-auto w-full"
              onClick={() => onOpenReport(day)}
            >
              <Eye className="size-4" aria-hidden />
              Відкрити меню-вимоги
            </button>
          </article>
        );
      })}
    </div>
  );
}
