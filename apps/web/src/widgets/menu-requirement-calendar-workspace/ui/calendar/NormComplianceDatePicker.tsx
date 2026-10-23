import { useRef, useState } from 'react';

import Link from 'next/link';

import { ChevronDown, Scale } from 'lucide-react';

import type { MenuRequirementCalendarMonth } from '@/entities/menu-requirement/model/MenuRequirement';
import type { MealType } from '@/entities/weekly-menu/model/WeeklyMenu';
import { addDaysToLocalIsoDate } from '@/shared/lib/LocalDate';

import { formatDay, formatFullDay } from './CalendarFormatting';
import type { MealCalendarStatus } from './RequirementMealStatus';
import { buildRangeCalendarDays, getLeadingEmptyDays } from './RequirementRangePicker';

export function NormComplianceDatePicker({
  month,
  reportHref,
  mealCalendars,
  allowIncompleteReports = false,
}: {
  month: MenuRequirementCalendarMonth;
  reportHref: string;
  mealCalendars?: MealCalendarStatus[];
  allowIncompleteReports?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const gesture = useRef<{ select: boolean; visited: Set<string> } | null>(null);
  const [pathname, query = ''] = reportHref.split('?');
  const params = new URLSearchParams(query);
  const [mealType, setMealType] = useState<MealType>(
    params.get('meal_type') === 'lunch' ? 'lunch' : 'breakfast'
  );
  const mealLabel = mealType === 'breakfast' ? 'Сніданок' : 'Обід';
  const mealCalendar = mealCalendars?.find((calendar) => calendar.mealType === mealType);
  const calendarReady = mealCalendar?.state === 'ready';
  const dateFrom = addDaysToLocalIsoDate(month.date_from, -getLeadingEmptyDays(month.date_from));
  const dateTo = addDaysToLocalIsoDate(month.date_to, 6 - getLeadingEmptyDays(month.date_to));
  const days = buildRangeCalendarDays({
    ...month,
    date_from: dateFrom,
    date_to: dateTo,
    weeks: mealCalendar?.months?.flatMap((candidate) => candidate.weeks) ?? [],
  });
  const availableDates = new Set(
    days
      .filter((day) => !day.isWeekend && !day.summary?.not_served && calendarReady)
      .map((day) => day.serviceDate)
  );
  const dates = selected.filter((date) => availableDates.has(date)).sort();
  const selectedDays = days.filter((day) => dates.includes(day.serviceDate));
  const countHint =
    dates.length === 0
      ? 'Оберіть робочі дні. Кількість має бути кратною 5.'
      : dates.length % 5 !== 0
        ? `Кількість днів має бути кратною 5. Оберіть ще ${5 - (dates.length % 5)} або зніміть ${dates.length % 5}.`
        : null;
  const issues = selectedDays.flatMap(({ serviceDate, summary }) => {
    const messages: string[] = [];
    const context = `${formatDay(serviceDate)} — ${mealLabel}`;
    if (
      !summary ||
      summary.expected_requirements <= 0 ||
      summary.generated_requirements < summary.expected_requirements ||
      summary.missing_requirements > 0
    ) {
      messages.push(
        `${context}: немає меню-вимоги${summary && summary.expected_requirements > 0 ? ` (сформовано ${summary.generated_requirements} із ${summary.expected_requirements})` : ''}.`
      );
    }
    if ((summary?.stale_requirements ?? 0) > 0)
      messages.push(`${context}: потрібно оновити меню-вимогу.`);
    return messages;
  });
  const loadingHint = !calendarReady
    ? mealCalendar?.state === 'error'
      ? `${mealLabel}: не вдалося завантажити статуси днів. Спробуйте оновити календар.`
      : `${mealLabel}: завантажуємо статуси днів…`
    : null;
  const blockReason =
    loadingHint ??
    countHint ??
    (!allowIncompleteReports && issues.length ? issues.join(' ') : null);
  params.set('meal_type', mealType);
  params.set('date_from', dates[0] ?? '');
  params.set('date_to', dates.at(-1) ?? '');
  params.set('dates', dates.join(','));
  const href = `${pathname}?${params.toString()}`;

  function selectDate(date: string) {
    const select = !selected.includes(date);
    setSelected((current) =>
      select ? [...current, date] : current.filter((value) => value !== date)
    );
    return select;
  }

  return (
    <section className="mb-4 border border-emerald-200 bg-emerald-50/40">
      <button
        type="button"
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={isOpen}
        aria-controls="norm-compliance-date-picker"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex items-center gap-3 text-sm font-bold text-slate-950">
          <Scale className="size-5 text-emerald-700" aria-hidden />
          Сформувати дотримання норм
        </span>
        <ChevronDown className={`size-5 ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {isOpen ? (
        <div id="norm-compliance-date-picker" className="border-t border-emerald-200 p-4">
          <p className="mb-3 text-sm text-slate-600">
            Обирайте дні по одному або проводьте зажатою лівою кнопкою миші. Повторний клік знімає
            вибір. Доступні повні тижні календаря, включно з днями сусідніх місяців.
          </p>
          <div role="group" aria-label="Прийом їжі для дотримання норм" className="mb-4 flex gap-2">
            {(
              [
                ['breakfast', 'Сніданок'],
                ['lunch', 'Обід'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mealType === value}
                className={`nf-button ${mealType === value ? 'nf-button-primary' : 'nf-button-secondary'}`}
                onClick={() => {
                  setMealType(value);
                  setSelected([]);
                  gesture.current = null;
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(280px,490px)_1fr]">
            <div className="select-none">
              <div
                className="grid grid-cols-7 text-center text-xs font-bold text-slate-500"
                aria-hidden
              >
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((day) => (
                  <span key={day} className="py-2">
                    {day}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1" aria-label="Вибір днів дотримання норм">
                {days.map((day) => {
                  const disabled =
                    day.isWeekend || Boolean(day.summary?.not_served) || !calendarReady;
                  const active = dates.includes(day.serviceDate);
                  const label = day.summary?.not_served
                    ? 'Не харчувалися'
                    : day.isWeekend
                      ? 'Вихідний'
                      : !calendarReady
                        ? null
                        : !day.summary ||
                            day.summary.expected_requirements <= 0 ||
                            day.summary.missing_requirements > 0 ||
                            day.summary.generated_requirements < day.summary.expected_requirements
                          ? 'Немає меню-вимоги'
                          : day.summary.stale_requirements > 0
                            ? 'Оновити меню-вимогу'
                            : null;
                  return (
                    <button
                      key={day.serviceDate}
                      title={`${formatDay(day.serviceDate)} — ${mealLabel}${label ? `: ${label}` : ': меню-вимога готова'}`}
                      type="button"
                      disabled={disabled}
                      aria-label={`${formatFullDay(day.serviceDate)}${label ? ` · ${label}` : ''}`}
                      aria-pressed={active}
                      className={`flex min-h-16 flex-col items-center justify-center border px-0.5 text-sm font-bold ${
                        disabled
                          ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                          : active
                            ? 'border-emerald-800 bg-emerald-700 text-white'
                            : 'border-slate-200 bg-white text-slate-900 hover:border-emerald-500'
                      }`}
                      onPointerDown={(event) => {
                        if (disabled || event.button !== 0 || event.pointerType === 'touch') return;
                        event.preventDefault();
                        event.currentTarget.focus();
                        gesture.current = {
                          select: selectDate(day.serviceDate),
                          visited: new Set([day.serviceDate]),
                        };
                      }}
                      onPointerEnter={(event) => {
                        if (disabled) return;
                        if (event.buttons !== 1) {
                          gesture.current = null;
                          return;
                        }
                        const drag = gesture.current;
                        if (!drag || drag.visited.has(day.serviceDate)) return;
                        drag.visited.add(day.serviceDate);
                        setSelected((current) =>
                          drag.select
                            ? [...new Set([...current, day.serviceDate])]
                            : current.filter((date) => date !== day.serviceDate)
                        );
                      }}
                      onPointerCancel={() => {
                        gesture.current = null;
                      }}
                      onClick={() => {
                        if (disabled) return;
                        if (gesture.current) {
                          gesture.current = null;
                          return;
                        }
                        selectDate(day.serviceDate);
                      }}
                    >
                      {day.serviceDate < month.date_from || day.serviceDate > month.date_to
                        ? `${day.dayOfMonth}.${day.serviceDate.slice(5, 7)}`
                        : day.dayOfMonth}
                      {label ? (
                        <span className="text-[9px] font-medium leading-tight">{label}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-3">
              <p className="font-bold" aria-live="polite">
                Обрано днів: {dates.length}
                {dates.length > 0 && dates.length % 5 === 0 ? ` · Норми ×${dates.length / 5}` : ''}
              </p>
              {loadingHint || countHint ? (
                <p className="text-sm text-amber-800" role="status">
                  {loadingHint ?? countHint}
                </p>
              ) : null}
              {issues.length ? (
                <ul className="space-y-1 text-sm text-amber-800" aria-label="Проблеми меню-вимог">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="nf-button nf-button-secondary"
                  onClick={() => {
                    setSelected([]);
                    gesture.current = null;
                  }}
                >
                  Скинути вибір
                </button>
                {blockReason ? (
                  <button
                    type="button"
                    className="nf-button nf-button-primary"
                    disabled
                    title={blockReason}
                  >
                    Сформувати звіт
                  </button>
                ) : (
                  <Link href={href} prefetch={false} className="nf-button nf-button-primary">
                    Сформувати звіт
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
