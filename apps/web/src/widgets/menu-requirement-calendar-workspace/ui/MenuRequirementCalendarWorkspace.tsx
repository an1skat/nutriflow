"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Eye,
  ExternalLink,
  FileSpreadsheet,
  Scale,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  useMenuRequirementCalendar,
  useMenuRequirementReport,
} from "@/entities/menu-requirement/api/MenuRequirementQueries";
import type {
  MenuRequirementAggregateStatus,
  MenuRequirementCalendarDay,
  MenuRequirementCalendarMonth,
  MenuRequirementCalendarWeek,
  MenuRequirementReport,
  MenuRequirementReportBreakdownItem,
  MenuRequirementReportCell,
  MenuRequirementReportDish,
  MenuRequirementReportGroup,
} from "@/entities/menu-requirement/model/MenuRequirement";
import { useSchools } from "@/entities/school/api/SchoolQueries";
import { useSchoolGroups } from "@/entities/school-group/api/SchoolGroupQueries";
import { useCurrentUser } from "@/entities/session/api/SessionQueries";
import type { MealType } from "@/entities/weekly-menu/model/WeeklyMenu";
import { MenuRequirementExportButton } from "@/features/menu-requirement-export/ui/MenuRequirementExportButton";
import { RequestError } from "@/shared/ui/RequestError";

type SelectedRange = {
  dateFrom: string;
  dateTo: string;
  granularity: "day" | "week" | "month";
  label: string;
};

type SelectedWeekRange = Pick<SelectedRange, "dateFrom" | "dateTo">;

type SelectedReportCell = {
  group: MenuRequirementReportGroup;
  dish: MenuRequirementReportDish;
  ingredientName: string;
  cell: MenuRequirementReportCell;
};

const mealTypeOptions: Array<{ value: "" | MealType; label: string }> = [
  { value: "", label: "Усі" },
  { value: "breakfast", label: "Сніданок" },
  { value: "lunch", label: "Обід" },
];

const statusLabels: Record<MenuRequirementAggregateStatus, string> = {
  complete: "Готово",
  missing: "Пропущено",
  stale: "Застаріло",
  mixed: "Є питання",
};

const statusClasses: Record<MenuRequirementAggregateStatus, string> = {
  complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
  missing: "border-amber-200 bg-amber-50 text-amber-800",
  stale: "border-rose-200 bg-rose-50 text-rose-800",
  mixed: "border-orange-200 bg-orange-50 text-orange-800",
};

const incompleteWeekHint =
  "Щоб сформувати тижневу меню-вимогу або дотримання норм, спочатку сформуйте або оновіть меню-вимоги за всі 5 робочих днів.";
const incompleteMonthHint =
  "Щоб сформувати місячну меню-вимогу, спочатку сформуйте або оновіть меню-вимоги за всі дні, що беруть участь у цьому місяці.";

export function MenuRequirementCalendarWorkspace() {
  const currentYear = new Date().getFullYear();
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMealType, setSelectedMealType] = useState<"" | MealType>(
    "",
  );
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedMonthNumber, setSelectedMonthNumber] = useState<number | null>(
    null,
  );
  const [selectedWeekRange, setSelectedWeekRange] =
    useState<SelectedWeekRange | null>(null);
  const [reportRange, setReportRange] = useState<SelectedRange | null>(null);
  const [selectedCell, setSelectedCell] =
    useState<SelectedReportCell | null>(null);

  const currentUser = useCurrentUser();
  const isSchoolUser = currentUser.data?.role === "SCHOOL_USER";
  const schools = useSchools(
    { offset: 0, limit: 100 },
    Boolean(currentUser.data && !isSchoolUser),
  );
  const ownSchoolId =
    currentUser.data?.role === "SCHOOL_USER"
      ? currentUser.data.school_id
      : "";
  const effectiveSchoolId = isSchoolUser
    ? ownSchoolId
    : selectedSchoolId || schools.data?.items[0]?.id || "";
  const groups = useSchoolGroups(
    isSchoolUser
      ? { mode: "own" }
      : { mode: "admin", schoolId: effectiveSchoolId },
    { offset: 0, limit: 100 },
  );

  const calendar = useMenuRequirementCalendar({
    school_id: effectiveSchoolId,
    year: selectedYear,
    meal_type: selectedMealType || undefined,
    school_group_id: selectedGroupId || undefined,
    enabled: effectiveSchoolId.length > 0,
  });

  const selectedMonth = useMemo(
    () =>
      calendar.data?.months.find(
        (month) => month.month === selectedMonthNumber,
      ) ?? null,
    [calendar.data?.months, selectedMonthNumber],
  );

  const selectedWeek = useMemo(() => {
    if (!selectedMonth || !selectedWeekRange) {
      return null;
    }
    return (
      selectedMonth.weeks.find(
        (week) =>
          week.date_from === selectedWeekRange.dateFrom &&
          week.date_to === selectedWeekRange.dateTo,
      ) ?? null
    );
  }, [selectedMonth, selectedWeekRange]);

  const report = useMenuRequirementReport({
    school_id: effectiveSchoolId,
    date_from: reportRange?.dateFrom ?? "",
    date_to: reportRange?.dateTo ?? "",
    granularity: reportRange?.granularity ?? "month",
    meal_type: selectedMealType || undefined,
    school_group_id: selectedGroupId || undefined,
    enabled: Boolean(effectiveSchoolId && reportRange),
  });

  const resetNavigation = () => {
    setSelectedMonthNumber(null);
    setSelectedWeekRange(null);
    setReportRange(null);
    setSelectedCell(null);
  };

  const openReport = (range: SelectedRange) => {
    setReportRange(range);
    setSelectedCell(null);
  };

  const closeReport = () => {
    setReportRange(null);
    setSelectedCell(null);
  };

  return (
    <main className="nf-page nf-page-wide">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Облік продуктів</p>
        <h1 className="nf-title">Календар меню-вимог</h1>
        <p className="nf-description">
          Оберіть місяць, потім тиждень і день. Таблиця відкриється окремо й не
          перевантажуватиме календар.
        </p>
      </header>

      <section className="nf-panel">
        <div className="nf-panel-body grid gap-4 lg:grid-cols-[minmax(220px,1.2fr)_140px_minmax(260px,1fr)_minmax(220px,1fr)]">
          {isSchoolUser ? (
            <div className="grid gap-1">
              <span className="nf-label">Школа</span>
              <div className="nf-input flex items-center bg-slate-50 text-slate-700">
                {calendar.data?.school_name ?? "Ваша школа"}
              </div>
            </div>
          ) : (
            <label className="grid gap-1">
              <span className="nf-label">Школа</span>
              <select
                className="nf-input"
                value={effectiveSchoolId}
                onChange={(event) => {
                  setSelectedSchoolId(event.target.value);
                  setSelectedGroupId("");
                  resetNavigation();
                }}
                disabled={schools.isPending}
              >
                <option value="">Оберіть школу</option>
                {(schools.data?.items ?? []).map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="grid gap-1">
            <span className="nf-label">Рік</span>
            <input
              className="nf-input"
              type="number"
              min={2000}
              max={2100}
              value={selectedYear}
              onChange={(event) => {
                setSelectedYear(Number(event.target.value));
                resetNavigation();
              }}
            />
          </label>

          <div className="grid gap-1">
            <span className="nf-label">Прийом їжі</span>
            <div className="grid grid-cols-3 border border-slate-300 bg-white">
              {mealTypeOptions.map((option) => {
                const selected = selectedMealType === option.value;

                return (
                  <button
                    key={option.value || "all"}
                    type="button"
                    className={`min-h-10 px-3 text-sm font-semibold transition-colors ${
                      selected
                        ? "bg-emerald-700 text-white"
                        : "text-slate-700 hover:bg-emerald-50"
                    }`}
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedMealType(option.value);
                      resetNavigation();
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="grid gap-1">
            <span className="nf-label">Група</span>
            <select
              className="nf-input"
              value={selectedGroupId}
              onChange={(event) => {
                setSelectedGroupId(event.target.value);
                resetNavigation();
              }}
              disabled={!effectiveSchoolId || groups.isPending || groups.isError}
            >
              <option value="">Усі групи</option>
              {(groups.data?.items ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {!isSchoolUser && schools.isError ? (
        <RequestError
          error={schools.error}
          onRetry={() => void schools.refetch()}
        />
      ) : null}

      {calendar.isError ? (
        <RequestError
          error={calendar.error}
          onRetry={() => void calendar.refetch()}
        />
      ) : null}

      <section className="nf-panel overflow-hidden">
        {calendar.isPending ? (
          <div className="nf-panel-body">
            <p role="status" className="text-sm text-slate-600">
              Завантажуємо календар…
            </p>
          </div>
        ) : null}

        {calendar.data ? (
          <RequirementPeriodNavigator
            months={calendar.data.months}
            selectedMonth={selectedMonth}
            selectedWeek={selectedWeek}
            year={selectedYear}
            onSelectMonth={(month) => {
              setSelectedMonthNumber(month.month);
              setSelectedWeekRange(null);
            }}
            onSelectWeek={(week) =>
              setSelectedWeekRange({
                dateFrom: week.date_from,
                dateTo: week.date_to,
              })
            }
            onBackToMonths={() => {
              setSelectedMonthNumber(null);
              setSelectedWeekRange(null);
            }}
            onBackToWeeks={() => setSelectedWeekRange(null)}
            onOpenReport={openReport}
            allowIncompleteReports={currentUser.data?.role === "OWNER"}
            normComplianceHref={
              selectedWeek
                ? buildNormComplianceHref({
                    schoolId: effectiveSchoolId,
                    dateFrom: selectedWeek.date_from,
                    dateTo: selectedWeek.date_to,
                    mealType: selectedMealType || undefined,
                    schoolGroupId: selectedGroupId || undefined,
                  })
                : undefined
            }
          />
        ) : null}
      </section>

      <RequirementReportDialog
        range={reportRange}
        report={report.isPlaceholderData ? undefined : report.data}
        isPending={report.isPending || report.isPlaceholderData}
        isError={report.isError}
        error={report.error}
        selectedCell={selectedCell}
        onSelectCell={setSelectedCell}
        onRetry={() => void report.refetch()}
        onClose={closeReport}
      />
    </main>
  );
}

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

function StatusBadge({ status }: { status: MenuRequirementAggregateStatus }) {
  const Icon = status === "complete" ? CheckCircle2 : AlertTriangle;

  return (
    <span
      className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-bold ${statusClasses[status]}`}
    >
      <Icon className="size-3" aria-hidden />
      {statusLabels[status]}
    </span>
  );
}

function CalendarStatusBadge({
  status,
  generated,
  missing,
  stale,
}: {
  status: MenuRequirementAggregateStatus;
  generated: number;
  missing: number;
  stale: number;
}) {
  if (generated === 0 && missing === 0 && stale === 0) {
    return <EmptyStatusBadge />;
  }
  return <StatusBadge status={status} />;
}

function EmptyStatusBadge() {
  return (
    <span className="inline-flex items-center border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
      Немає даних
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="border border-slate-200 bg-white px-2 py-1">
      <span className="block font-bold text-slate-950">{value}</span>
      <span className="block text-[11px] text-slate-500">{label}</span>
    </span>
  );
}

function monthName(year: number, month: number): string {
  return new Intl.DateTimeFormat("uk-UA", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function monthNameFromDate(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat("uk-UA", {
    month: "long",
  }).format(parsed);
}

function formatDay(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatDayWithoutYear(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
  }).format(parsed);
}

function formatFullDay(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function weekdayName(value: string): string {
  const parsed = parseLocalDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat("uk-UA", { weekday: "long" }).format(parsed);
}

function formatShortRange(dateFrom: string, dateTo: string): string {
  return `${formatDayWithoutYear(dateFrom)} – ${formatDayWithoutYear(dateTo)}`;
}

function parseLocalDate(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatGrams(value: string): string {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: 6,
  }).format(parsed);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: 0,
  }).format(value);
}
