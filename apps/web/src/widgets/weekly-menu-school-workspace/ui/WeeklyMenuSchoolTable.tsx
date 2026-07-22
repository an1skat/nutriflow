import type { Weekday, WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';
import { WeeklyMenuNutritionTable } from '@/entities/weekly-menu/ui/WeeklyMenuNutritionTable';
import { parseLocalDate } from '@/shared/lib/LocalDate';

const JS_WEEKDAY_BY_MENU_WEEKDAY: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const menuDateFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function WeeklyMenuSchoolTable({ menu }: { menu: WeeklyMenu }) {
  const dateRangeLabel = getMenuDateRangeLabel(menu);

  return (
    <section className="nf-panel overflow-hidden">
      <div className="nf-panel-header items-start gap-4">
        <div>
          <p className="nf-eyebrow">{menu.meal_type === 'lunch' ? 'Обід' : 'Сніданок'}</p>
          <h2 className="nf-panel-title">{menu.title}</h2>
          {dateRangeLabel ? (
            <p className="mt-1 text-xs text-slate-600">Тиждень: {dateRangeLabel}</p>
          ) : null}
        </div>
        {menu.source_sheet_name ? (
          <span className="border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600">
            {menu.source_sheet_name}
          </span>
        ) : null}
      </div>

      {menu.notes ? (
        <div className="border-b border-[var(--nf-line)] bg-slate-50 px-5 py-3 text-sm text-slate-700">
          {menu.notes}
        </div>
      ) : null}

      <WeeklyMenuNutritionTable days={menu.days} maxHeightClass="max-h-[calc(100vh-220px)]" />
    </section>
  );
}

export function getMenuDateRangeLabel(menu: WeeklyMenu): string | null {
  const alignedDates = menu.days
    .map((day) => alignDateToWeekday(day.date, day.weekday))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());

  if (!alignedDates.length) {
    return null;
  }

  const first = alignedDates[0];
  const last = alignedDates[alignedDates.length - 1];
  return first.getTime() === last.getTime()
    ? menuDateFormatter.format(first)
    : `${menuDateFormatter.format(first)} – ${menuDateFormatter.format(last)}`;
}

function alignDateToWeekday(value: string | null | undefined, weekday: Weekday): Date | null {
  if (!value) {
    return null;
  }
  const date = parseLocalDate(value);
  if (!date) {
    return null;
  }
  const daysUntilExpectedWeekday = (JS_WEEKDAY_BY_MENU_WEEKDAY[weekday] - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + daysUntilExpectedWeekday);
  return date;
}
