import { useMemo, useState } from 'react';

import { CalendarRange, ChevronDown, Eye, RotateCcw } from 'lucide-react';

import type {
  MenuRequirementCalendarDay,
  MenuRequirementCalendarMonth,
} from '@/entities/menu-requirement/model/MenuRequirement';
import { addDaysToLocalIsoDate, parseLocalDate } from '@/shared/lib/LocalDate';

import { formatDay, formatFullDay, formatShortRange } from './CalendarFormatting';
import type { SelectedRange } from './RequirementCalendarTypes';

const weekdayHeadings = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

type RangeCalendarDay = {
  serviceDate: string;
  dayOfMonth: number;
  isWeekend: boolean;
  summary: MenuRequirementCalendarDay | null;
};

type DayAvailability = 'complete' | 'missing' | 'stale';

export function RequirementRangePicker({
  month,
  onOpenReport,
}: {
  month: MenuRequirementCalendarMonth;
  onOpenReport: (range: SelectedRange) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const calendarDays = useMemo(() => buildRangeCalendarDays(month), [month]);
  const leadingEmptyDays = getLeadingEmptyDays(month.date_from);
  const selectedWorkdays = useMemo(
    () => getSelectedWorkdays(calendarDays, dateFrom, dateTo),
    [calendarDays, dateFrom, dateTo]
  );
  const blockReason = getRangeBlockReason(selectedWorkdays, dateFrom, dateTo);

  const selectDate = (serviceDate: string) => {
    if (!dateFrom || dateTo) {
      setDateFrom(serviceDate);
      setDateTo(null);
      return;
    }

    if (serviceDate < dateFrom) {
      setDateFrom(serviceDate);
      setDateTo(dateFrom);
      return;
    }

    setDateTo(serviceDate);
  };

  const resetSelection = () => {
    setDateFrom(null);
    setDateTo(null);
  };

  const openReport = () => {
    if (!dateFrom || !dateTo || blockReason) {
      return;
    }

    onOpenReport({
      dateFrom,
      dateTo,
      granularity: 'range',
      label: `Період · ${formatShortRange(dateFrom, dateTo)}`,
    });
  };

  return (
    <section className="mb-4 border border-emerald-200 bg-emerald-50/40">
      <button
        type="button"
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={isOpen}
        aria-controls="menu-requirement-range-picker"
        onClick={() => setIsOpen((value) => !value)}
      >
        <span className="flex min-w-0 items-center gap-3">
          <CalendarRange className="size-5 shrink-0 text-emerald-700" aria-hidden />
          <span>
            <span className="block text-sm font-bold text-slate-950">
              Меню-вимога за довільний період
            </span>
            <span className="mt-0.5 block text-xs text-slate-600">
              Оберіть початкову та кінцеву робочі дати в межах місяця
            </span>
          </span>
        </span>
        <ChevronDown
          className={`size-5 shrink-0 text-emerald-800 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>

      {isOpen ? (
        <div id="menu-requirement-range-picker" className="border-t border-emerald-200 p-4">
          <div className="grid gap-5 lg:grid-cols-[minmax(280px,420px)_minmax(260px,1fr)]">
            <div>
              <div className="grid grid-cols-7 text-center text-xs font-bold text-slate-500">
                {weekdayHeadings.map((heading) => (
                  <span key={heading} className="py-2" aria-hidden>
                    {heading}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1" aria-label="Вибір періоду меню-вимоги">
                {Array.from({ length: leadingEmptyDays }, (_item, index) => (
                  <span key={`empty:${index}`} aria-hidden />
                ))}
                {calendarDays.map((day) => {
                  const selected = isDateSelected(day.serviceDate, dateFrom, dateTo);
                  const boundary = day.serviceDate === dateFrom || day.serviceDate === dateTo;
                  const availability = getDayAvailability(day.summary);

                  return (
                    <button
                      key={day.serviceDate}
                      type="button"
                      className={getDayButtonClass({
                        isWeekend: day.isWeekend,
                        selected,
                        boundary,
                        availability,
                      })}
                      disabled={day.isWeekend}
                      aria-label={`${formatFullDay(day.serviceDate)} — ${getDayAvailabilityLabel(
                        day.isWeekend,
                        availability
                      )}`}
                      aria-pressed={selected}
                      title={
                        day.isWeekend
                          ? 'Вихідний день не входить до меню-вимоги'
                          : getDayAvailabilityLabel(false, availability)
                      }
                      onClick={() => selectDate(day.serviceDate)}
                    >
                      <span>{day.dayOfMonth}</span>
                      {!day.isWeekend ? (
                        <span
                          className={`size-1.5 rounded-full ${getAvailabilityDotClass(availability)}`}
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
                <Legend color="bg-emerald-500" label="готово" />
                <Legend color="bg-amber-500" label="немає" />
                <Legend color="bg-rose-500" label="потрібно оновити" />
                <Legend color="bg-slate-300" label="вихідний" />
              </div>
            </div>

            <div className="flex flex-col border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold text-slate-950">Обраний період</h3>
              <p className="mt-2 text-sm text-slate-700">
                {dateFrom
                  ? dateTo
                    ? formatShortRange(dateFrom, dateTo)
                    : `${formatDay(dateFrom)} — оберіть кінцеву дату`
                  : 'Спочатку оберіть початкову дату.'}
              </p>
              {dateFrom && dateTo ? (
                <p className="mt-1 text-xs text-slate-500">
                  Робочих днів у звіті: {selectedWorkdays.length}. Субота й неділя не враховуються.
                </p>
              ) : null}

              <p
                className={`mt-4 text-sm font-semibold leading-6 ${
                  blockReason ? 'text-amber-800' : 'text-emerald-800'
                }`}
                aria-live="polite"
              >
                {blockReason ?? 'Усі меню-вимоги за обрані робочі дні готові.'}
              </p>

              <div className="mt-auto grid gap-2 pt-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <button
                  type="button"
                  className="nf-button nf-button-secondary w-full"
                  disabled={!dateFrom}
                  onClick={resetSelection}
                >
                  <RotateCcw className="size-4" aria-hidden />
                  Очистити
                </button>
                <button
                  type="button"
                  className="nf-button nf-button-primary w-full"
                  disabled={Boolean(blockReason)}
                  title={blockReason ?? undefined}
                  onClick={openReport}
                >
                  <Eye className="size-4" aria-hidden />
                  Сформувати
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function buildRangeCalendarDays(month: MenuRequirementCalendarMonth): RangeCalendarDay[] {
  const summaries = new Map(
    month.weeks
      .flatMap((week) => week.days)
      .filter((day) => day.service_date >= month.date_from && day.service_date <= month.date_to)
      .map((day) => [day.service_date, day])
  );
  const days: RangeCalendarDay[] = [];

  for (
    let serviceDate = month.date_from;
    serviceDate <= month.date_to;
    serviceDate = addDaysToLocalIsoDate(serviceDate, 1)
  ) {
    const parsed = parseLocalDate(serviceDate);
    if (!parsed) {
      break;
    }

    days.push({
      serviceDate,
      dayOfMonth: parsed.getDate(),
      isWeekend: parsed.getDay() === 0 || parsed.getDay() === 6,
      summary: summaries.get(serviceDate) ?? null,
    });
  }

  return days;
}

function getLeadingEmptyDays(dateFrom: string): number {
  const parsed = parseLocalDate(dateFrom);
  return parsed ? (parsed.getDay() + 6) % 7 : 0;
}

function getSelectedWorkdays(
  days: RangeCalendarDay[],
  dateFrom: string | null,
  dateTo: string | null
): RangeCalendarDay[] {
  if (!dateFrom || !dateTo) {
    return [];
  }

  return days.filter(
    (day) => !day.isWeekend && day.serviceDate >= dateFrom && day.serviceDate <= dateTo
  );
}

function getRangeBlockReason(
  selectedDays: RangeCalendarDay[],
  dateFrom: string | null,
  dateTo: string | null
): string | null {
  if (!dateFrom) {
    return 'Оберіть початкову й кінцеву дати.';
  }
  if (!dateTo) {
    return 'Оберіть кінцеву дату.';
  }
  if (selectedDays.length === 0) {
    return 'Обраний період має містити хоча б один робочий день.';
  }

  const missingDates = selectedDays
    .filter((day) => isMissingDay(day.summary))
    .map((day) => formatDay(day.serviceDate));
  const staleDates = selectedDays
    .filter((day) => (day.summary?.stale_requirements ?? 0) > 0)
    .map((day) => formatDay(day.serviceDate));
  const messages: string[] = [];

  if (missingDates.length > 0) {
    messages.push(`Немає меню-вимоги за: ${missingDates.join(', ')}.`);
  }
  if (staleDates.length > 0) {
    messages.push(`Потрібно оновити меню-вимогу за: ${staleDates.join(', ')}.`);
  }

  return messages.length > 0 ? messages.join(' ') : null;
}

function isMissingDay(summary: MenuRequirementCalendarDay | null): boolean {
  return (
    !summary ||
    summary.expected_requirements <= 0 ||
    summary.generated_requirements < summary.expected_requirements ||
    summary.missing_requirements > 0
  );
}

function getDayAvailability(summary: MenuRequirementCalendarDay | null): DayAvailability {
  if ((summary?.stale_requirements ?? 0) > 0) {
    return 'stale';
  }
  return isMissingDay(summary) ? 'missing' : 'complete';
}

function getDayAvailabilityLabel(isWeekend: boolean, availability: DayAvailability): string {
  if (isWeekend) {
    return 'вихідний, не враховується';
  }
  if (availability === 'complete') {
    return 'меню-вимога готова';
  }
  if (availability === 'stale') {
    return 'меню-вимогу потрібно оновити';
  }
  return 'меню-вимоги немає';
}

function isDateSelected(
  serviceDate: string,
  dateFrom: string | null,
  dateTo: string | null
): boolean {
  if (!dateFrom) {
    return false;
  }
  return serviceDate >= dateFrom && serviceDate <= (dateTo ?? dateFrom);
}

function getDayButtonClass({
  isWeekend,
  selected,
  boundary,
  availability,
}: {
  isWeekend: boolean;
  selected: boolean;
  boundary: boolean;
  availability: DayAvailability;
}): string {
  const base =
    'flex aspect-square min-h-10 flex-col items-center justify-center gap-1 border text-sm font-bold transition-colors';

  if (isWeekend) {
    return `${base} cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400`;
  }
  if (boundary) {
    return `${base} border-emerald-800 bg-emerald-700 text-white ring-2 ring-emerald-200`;
  }
  if (selected) {
    return `${base} border-emerald-300 bg-emerald-100 text-emerald-950`;
  }

  const availabilityClass = {
    complete:
      'border-slate-200 bg-white text-slate-900 hover:border-emerald-500 hover:bg-emerald-50',
    missing: 'border-amber-200 bg-amber-50/60 text-slate-900 hover:border-amber-500',
    stale: 'border-rose-200 bg-rose-50/60 text-slate-900 hover:border-rose-500',
  }[availability];
  return `${base} ${availabilityClass}`;
}

function getAvailabilityDotClass(availability: DayAvailability): string {
  return {
    complete: 'bg-emerald-500',
    missing: 'bg-amber-500',
    stale: 'bg-rose-500',
  }[availability];
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${color}`} aria-hidden />
      {label}
    </span>
  );
}
