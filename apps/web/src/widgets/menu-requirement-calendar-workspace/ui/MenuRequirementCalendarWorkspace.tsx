'use client';

import { useMemo, useState } from 'react';

import {
  useMenuRequirementCalendar,
  useMenuRequirementReport,
} from '@/entities/menu-requirement/api/MenuRequirementQueries';
import { useSchoolGroups } from '@/entities/school-group/api/SchoolGroupQueries';
import { useSchools } from '@/entities/school/api/SchoolQueries';
import { useCurrentUser } from '@/entities/session/api/SessionQueries';
import type { MealType } from '@/entities/weekly-menu/model/WeeklyMenu';
import { addDaysToLocalIsoDate, toLocalIsoDate } from '@/shared/lib/LocalDate';
import { RequestError } from '@/shared/ui/RequestError';

import { formatFullDay } from './calendar/CalendarFormatting';
import {
  RequirementDayGrid,
  RequirementPeriodNavigator,
  RequirementReportDialog,
  buildNormComplianceHref,
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

export function getCurrentCalendarWeek(date = new Date()): SelectedWeekRange {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const dateFrom = toLocalIsoDate(monday);

  return { dateFrom, dateTo: addDaysToLocalIsoDate(dateFrom, 4) };
}

export function MenuRequirementCalendarWorkspace({
  schoolWeekOnly = false,
}: {
  schoolWeekOnly?: boolean;
}) {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMealType, setSelectedMealType] = useState<'' | MealType>('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedMonthNumber, setSelectedMonthNumber] = useState<number | null>(() =>
    schoolWeekOnly ? currentDate.getMonth() + 1 : null
  );
  const [selectedWeekRange, setSelectedWeekRange] = useState<SelectedWeekRange | null>(() =>
    schoolWeekOnly ? getCurrentCalendarWeek(currentDate) : null
  );
  const [reportRange, setReportRange] = useState<SelectedRange | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedReportCell | null>(null);

  const currentUser = useCurrentUser();
  const isSchoolUser = currentUser.data?.role === 'SCHOOL_USER';
  const schools = useSchools({ offset: 0, limit: 100 }, Boolean(currentUser.data && !isSchoolUser));
  const ownSchoolId = currentUser.data?.role === 'SCHOOL_USER' ? currentUser.data.school_id : '';
  const effectiveSchoolId = isSchoolUser
    ? ownSchoolId
    : selectedSchoolId || schools.data?.items[0]?.id || '';
  const groups = useSchoolGroups(
    schoolWeekOnly
      ? { mode: 'admin', schoolId: '' }
      : isSchoolUser
        ? { mode: 'own' }
        : { mode: 'admin', schoolId: effectiveSchoolId },
    { offset: 0, limit: 100 }
  );

  const calendar = useMenuRequirementCalendar({
    school_id: effectiveSchoolId,
    year: selectedYear,
    meal_type: selectedMealType || undefined,
    school_group_id: selectedGroupId || undefined,
    enabled: effectiveSchoolId.length > 0,
  });

  const selectedMonth = useMemo(
    () => calendar.data?.months.find((month) => month.month === selectedMonthNumber) ?? null,
    [calendar.data?.months, selectedMonthNumber]
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

  const report = useMenuRequirementReport({
    school_id: effectiveSchoolId,
    date_from: reportRange?.dateFrom ?? '',
    date_to: reportRange?.dateTo ?? '',
    granularity: reportRange?.granularity ?? 'month',
    meal_type: selectedMealType || undefined,
    school_group_id: selectedGroupId || undefined,
    enabled: Boolean(effectiveSchoolId && reportRange),
  });

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
            : 'Оберіть місяць, потім тиждень і день. Таблиця відкриється окремо й не перевантажуватиме календар.'}
        </p>
      </header>

      <section className="nf-panel">
        <div
          className={`nf-panel-body grid gap-4 ${
            schoolWeekOnly
              ? ''
              : 'lg:grid-cols-[minmax(220px,1.2fr)_140px_minmax(260px,1fr)_minmax(220px,1fr)]'
          }`}
        >
          {!schoolWeekOnly && isSchoolUser ? (
            <div className="grid gap-1">
              <span className="nf-label">Школа</span>
              <div className="nf-input flex items-center bg-slate-50 text-slate-700">
                {calendar.data?.school_name ?? 'Ваша школа'}
              </div>
            </div>
          ) : !schoolWeekOnly ? (
            <label className="grid gap-1">
              <span className="nf-label">Школа</span>
              <select
                className="nf-input"
                value={effectiveSchoolId}
                onChange={(event) => {
                  setSelectedSchoolId(event.target.value);
                  setSelectedGroupId('');
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

          {!schoolWeekOnly ? (
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
          ) : null}
        </div>
      </section>

      {!isSchoolUser && schools.isError ? (
        <RequestError error={schools.error} onRetry={() => void schools.refetch()} />
      ) : null}

      {calendar.isError ? (
        <RequestError error={calendar.error} onRetry={() => void calendar.refetch()} />
      ) : null}

      <section className="nf-panel overflow-hidden">
        {calendar.isPending ? (
          <div className="nf-panel-body">
            <p role="status" className="text-sm text-slate-600">
              Завантажуємо календар…
            </p>
          </div>
        ) : null}

        {calendar.data && schoolWeekOnly && selectedWeek ? (
          <>
            <div className="nf-panel-header">
              <div>
                <h2 className="nf-panel-title">Поточний тиждень</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Відкрийте день, щоб побачити меню-вимоги всіх груп.
                </p>
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
        ) : calendar.data && schoolWeekOnly ? (
          <div className="nf-panel-body">
            <div className="nf-empty">
              <p>За поточний тиждень меню-вимог ще немає.</p>
            </div>
          </div>
        ) : calendar.data ? (
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
            allowIncompleteReports={currentUser.data?.role === 'OWNER'}
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
