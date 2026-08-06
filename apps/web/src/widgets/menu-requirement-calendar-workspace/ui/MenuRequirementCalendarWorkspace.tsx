'use client';

import { useMemo, useState } from 'react';

import { Eye } from 'lucide-react';

import {
  useMenuRequirementCalendar,
  useMenuRequirementCommunities,
  useMenuRequirementReport,
} from '@/entities/menu-requirement/api/MenuRequirementQueries';
import type {
  MenuRequirementCalendarRequest,
  MenuRequirementCommunityCode,
  MenuRequirementReportRequest,
} from '@/entities/menu-requirement/model/MenuRequirement';
import { useSchools } from '@/entities/school/api/SchoolQueries';
import { useCurrentUser } from '@/entities/session/api/SessionQueries';
import type { MealType } from '@/entities/weekly-menu/model/WeeklyMenu';
import { addDaysToLocalIsoDate, toLocalIsoDate } from '@/shared/lib/LocalDate';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';
import { RequestError } from '@/shared/ui/RequestError';

import { formatFullDay } from './calendar/CalendarFormatting';
import {
  RequirementDayGrid,
  RequirementPeriodNavigator,
  RequirementReportDialog,
  buildNormComplianceHref,
  getWeekReportBlockReason,
} from './calendar/RequirementCalendarContent';
import type {
  SelectedRange,
  SelectedReportCell,
  SelectedWeekRange,
} from './calendar/RequirementCalendarContent';

export {
  buildNormComplianceHref,
  RequirementDayGrid,
  RequirementPeriodNavigator,
  RequirementReportDialog,
  RequirementReportTable,
} from './calendar/RequirementCalendarContent';

const mealTypeOptions: Array<{ value: '' | MealType; label: string }> = [
  { value: '', label: 'Усі' },
  { value: 'breakfast', label: 'Сніданок' },
  { value: 'lunch', label: 'Обід' },
];

type RequirementScopeKind = 'school' | 'community';

export function getCurrentCalendarWeek(date = new Date()): SelectedWeekRange {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const dateFrom = toLocalIsoDate(monday);

  return { dateFrom, dateTo: addDaysToLocalIsoDate(dateFrom, 4) };
}

export function getCurrentSchoolRequirementPeriod(date = new Date()) {
  const week = getCurrentCalendarWeek(date);

  return {
    year: Number(week.dateFrom.slice(0, 4)),
    monthNumber: Number(week.dateFrom.slice(5, 7)),
    week,
  };
}

export function MenuRequirementCalendarWorkspace({
  schoolWeekOnly = false,
}: {
  schoolWeekOnly?: boolean;
}) {
  const currentDate = new Date();
  const currentSchoolRequirementPeriod = getCurrentSchoolRequirementPeriod(currentDate);
  const currentYear = schoolWeekOnly
    ? currentSchoolRequirementPeriod.year
    : currentDate.getFullYear();
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState<
    MenuRequirementCommunityCode | ''
  >('');
  const [scopeKind, setScopeKind] = useState<RequirementScopeKind>('school');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMealType, setSelectedMealType] = useState<'' | MealType>('');
  const [selectedMonthNumber, setSelectedMonthNumber] = useState<number | null>(() =>
    schoolWeekOnly ? currentSchoolRequirementPeriod.monthNumber : null
  );
  const [selectedWeekRange, setSelectedWeekRange] = useState<SelectedWeekRange | null>(() =>
    schoolWeekOnly ? currentSchoolRequirementPeriod.week : null
  );
  const [reportRange, setReportRange] = useState<SelectedRange | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedReportCell | null>(null);

  const currentUser = useCurrentUser();
  const isSchoolUser = currentUser.data?.role === 'SCHOOL_USER';
  const effectiveScopeKind: RequirementScopeKind =
    isSchoolUser || schoolWeekOnly ? 'school' : scopeKind;
  const schools = useSchools(
    { offset: 0, limit: 100 },
    Boolean(currentUser.data && !isSchoolUser && effectiveScopeKind === 'school')
  );
  const communities = useMenuRequirementCommunities(
    Boolean(currentUser.data && !isSchoolUser && effectiveScopeKind === 'community')
  );
  const ownSchoolId = currentUser.data?.role === 'SCHOOL_USER' ? currentUser.data.school_id : '';
  const effectiveSchoolId = isSchoolUser
    ? ownSchoolId
    : selectedSchoolId || schools.data?.items[0]?.id || '';
  const effectiveCommunity = selectedCommunity || communities.data?.[0]?.community || '';
  const scopeReady =
    effectiveScopeKind === 'community'
      ? effectiveCommunity.length > 0
      : effectiveSchoolId.length > 0;

  const calendarRequest: MenuRequirementCalendarRequest =
    effectiveScopeKind === 'community'
      ? {
          community: effectiveCommunity,
          year: selectedYear,
          meal_type: selectedMealType || undefined,
          enabled: scopeReady,
        }
      : {
          school_id: effectiveSchoolId,
          year: selectedYear,
          meal_type: selectedMealType || undefined,
          enabled: scopeReady,
        };
  const calendar = useMenuRequirementCalendar(calendarRequest);
  const visibleCalendar = calendar.isPlaceholderData ? undefined : calendar.data;

  const selectedMonth = useMemo(
    () => visibleCalendar?.months.find((month) => month.month === selectedMonthNumber) ?? null,
    [visibleCalendar?.months, selectedMonthNumber]
  );

  const selectedWeek = useMemo(() => {
    if (!selectedMonth || !selectedWeekRange) {
      return null;
    }
    return (
      selectedMonth.weeks.find(
        (week) =>
          week.date_from === selectedWeekRange.dateFrom && week.date_to === selectedWeekRange.dateTo
      ) ?? null
    );
  }, [selectedMonth, selectedWeekRange]);

  const reportRequest: MenuRequirementReportRequest =
    effectiveScopeKind === 'community'
      ? {
          community: effectiveCommunity,
          date_from: reportRange?.dateFrom ?? '',
          date_to: reportRange?.dateTo ?? '',
          granularity: reportRange?.granularity ?? 'month',
          meal_type: selectedMealType || undefined,
          enabled: Boolean(scopeReady && reportRange),
        }
      : {
          school_id: effectiveSchoolId,
          date_from: reportRange?.dateFrom ?? '',
          date_to: reportRange?.dateTo ?? '',
          granularity: reportRange?.granularity ?? 'month',
          meal_type: selectedMealType || undefined,
          enabled: Boolean(scopeReady && reportRange),
        };
  const report = useMenuRequirementReport(reportRequest);
  const selectedWeekBlockReason = selectedWeek ? getWeekReportBlockReason(selectedWeek) : null;

  const resetNavigation = () => {
    if (!schoolWeekOnly) {
      setSelectedMonthNumber(null);
      setSelectedWeekRange(null);
    }
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
        <h1 className="nf-title">
          {schoolWeekOnly ? 'Меню-вимоги за поточний тиждень' : 'Календар меню-вимог'}
        </h1>
        <p className="nf-description">
          {schoolWeekOnly
            ? 'Оберіть день, щоб переглянути меню-вимоги всіх груп окремо.'
            : 'Оберіть школу або громаду, а потім сформуйте меню-вимогу за день, тиждень, місяць чи довільний період.'}
        </p>
      </header>

      <section className="nf-panel">
        <div
          className={`nf-panel-body grid gap-4 ${
            schoolWeekOnly
              ? ''
              : isSchoolUser
                ? 'lg:grid-cols-[minmax(220px,1.2fr)_140px_minmax(260px,1fr)]'
                : 'lg:grid-cols-[170px_minmax(220px,1.2fr)_140px_minmax(260px,1fr)]'
          }`}
        >
          {!schoolWeekOnly && !isSchoolUser ? (
            <div className="grid gap-1">
              <span className="nf-label">Область</span>
              <div className="grid grid-cols-2 border border-slate-300 bg-white">
                {(
                  [
                    ['school', 'Школа'],
                    ['community', 'Громада'],
                  ] as const
                ).map(([value, label]) => {
                  const selected = effectiveScopeKind === value;

                  return (
                    <button
                      key={value}
                      type="button"
                      className={`min-h-10 px-3 text-sm font-semibold transition-colors ${
                        selected
                          ? 'bg-emerald-700 text-white'
                          : 'text-slate-700 hover:bg-emerald-50'
                      }`}
                      aria-pressed={selected}
                      onClick={() => {
                        setScopeKind(value);
                        resetNavigation();
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!schoolWeekOnly && isSchoolUser ? (
            <div className="grid gap-1">
              <span className="nf-label">Школа</span>
              <div className="nf-input flex items-center bg-slate-50 text-slate-700">
                {visibleCalendar && 'school_name' in visibleCalendar
                  ? visibleCalendar.school_name
                  : 'Ваша школа'}
              </div>
            </div>
          ) : !schoolWeekOnly && effectiveScopeKind === 'school' ? (
            <label className="grid gap-1">
              <span className="nf-label">Школа</span>
              {schools.isPending ? (
                <LoadingSpinner size="sm" label="Завантажуємо школи…" />
              ) : (
                <select
                  className="nf-input"
                  value={effectiveSchoolId}
                  onChange={(event) => {
                    setSelectedSchoolId(event.target.value);
                    resetNavigation();
                  }}
                >
                  <option value="">Оберіть школу</option>
                  {(schools.data?.items ?? []).map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ) : !schoolWeekOnly ? (
            <label className="grid gap-1">
              <span className="nf-label">Громада</span>
              {communities.isPending ? (
                <LoadingSpinner size="sm" label="Завантажуємо громади…" />
              ) : (
                <select
                  className="nf-input"
                  value={effectiveCommunity}
                  onChange={(event) => {
                    setSelectedCommunity(
                      event.target.value as MenuRequirementCommunityCode | ''
                    );
                    resetNavigation();
                  }}
                >
                  <option value="">Оберіть громаду</option>
                  {(communities.data ?? []).map((community) => (
                    <option key={community.community} value={community.community}>
                      {community.community_name} · {community.school_count} шкіл
                    </option>
                  ))}
                </select>
              )}
            </label>
          ) : null}

          {!schoolWeekOnly ? (
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
          ) : null}

          <div className="grid gap-1">
            <span className="nf-label">Прийом їжі</span>
            <div className="grid grid-cols-3 border border-slate-300 bg-white">
              {mealTypeOptions.map((option) => {
                const selected = selectedMealType === option.value;

                return (
                  <button
                    key={option.value || 'all'}
                    type="button"
                    className={`min-h-10 px-3 text-sm font-semibold transition-colors ${
                      selected ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-emerald-50'
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
        </div>
      </section>

      {!isSchoolUser && effectiveScopeKind === 'school' && schools.isError ? (
        <RequestError error={schools.error} onRetry={() => void schools.refetch()} />
      ) : null}

      {!isSchoolUser && effectiveScopeKind === 'community' && communities.isError ? (
        <RequestError error={communities.error} onRetry={() => void communities.refetch()} />
      ) : null}

      {calendar.isError ? (
        <RequestError error={calendar.error} onRetry={() => void calendar.refetch()} />
      ) : null}

      <section className="nf-panel overflow-hidden">
        {!scopeReady && !calendar.isError ? (
          <div className="nf-panel-body">
            <div className="nf-empty">
              <p>
                {effectiveScopeKind === 'community'
                  ? 'Оберіть громаду для перегляду календаря.'
                  : 'Оберіть школу для перегляду календаря.'}
              </p>
            </div>
          </div>
        ) : calendar.isPending || calendar.isPlaceholderData ? (
          <div className="nf-panel-body">
            <LoadingSpinner label="Завантажуємо календар…" />
          </div>
        ) : null}

        {visibleCalendar && schoolWeekOnly && selectedWeek ? (
          <>
            <div className="nf-panel-header">
              <div>
                <h2 className="nf-panel-title">Поточний тиждень</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Відкрийте день, щоб побачити меню-вимоги всіх груп.
                </p>
              </div>
              <div className="grid gap-2 sm:justify-items-end">
                <button
                  type="button"
                  className="nf-button nf-button-secondary"
                  disabled={Boolean(selectedWeekBlockReason)}
                  title={selectedWeekBlockReason ?? undefined}
                  onClick={() =>
                    openReport({
                      dateFrom: selectedWeek.date_from,
                      dateTo: selectedWeek.date_to,
                      granularity: 'week',
                      label: `Тиждень ${selectedWeek.week_index} · ${formatFullDay(
                        selectedWeek.date_from
                      )} — ${formatFullDay(selectedWeek.date_to)}`,
                    })
                  }
                >
                  <Eye className="size-4" aria-hidden />
                  Меню-вимога за тиждень
                </button>
                {selectedWeekBlockReason ? (
                  <p className="max-w-xl text-xs font-semibold leading-5 text-amber-800 sm:text-right">
                    {selectedWeekBlockReason}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="nf-panel-body">
              <RequirementDayGrid
                days={selectedWeek.days}
                onOpenReport={(day) =>
                  openReport({
                    dateFrom: day.service_date,
                    dateTo: day.service_date,
                    granularity: 'day',
                    label: formatFullDay(day.service_date),
                  })
                }
              />
            </div>
          </>
        ) : visibleCalendar && schoolWeekOnly ? (
          <div className="nf-panel-body">
            <div className="nf-empty">
              <p>За поточний тиждень меню-вимог ще немає.</p>
            </div>
          </div>
        ) : visibleCalendar ? (
          <RequirementPeriodNavigator
            months={visibleCalendar.months}
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
            allowIncompleteReports={currentUser.data?.role === 'OWNER'}
            normComplianceHref={
              selectedWeek && effectiveScopeKind === 'school'
                ? buildNormComplianceHref({
                    schoolId: effectiveSchoolId,
                    dateFrom: selectedWeek.date_from,
                    dateTo: selectedWeek.date_to,
                    mealType: selectedMealType || undefined,
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
