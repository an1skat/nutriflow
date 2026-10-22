import type { MenuRequirementCalendarMonth } from '@/entities/menu-requirement/model/MenuRequirement';
import type { MealType } from '@/entities/weekly-menu/model/WeeklyMenu';

export type MealCalendarStatus = {
  mealType: MealType;
  months?: MenuRequirementCalendarMonth[];
  state: 'pending' | 'error' | 'ready';
};

export function RequirementMealStatus({
  calendars,
  monthNumber,
  weekFrom,
  serviceDate,
}: {
  calendars?: MealCalendarStatus[];
  monthNumber?: number;
  weekFrom?: string;
  serviceDate?: string;
}) {
  if (!calendars) return null;

  return (
    <span className="mt-3 grid gap-1 text-xs leading-5">
      {calendars.map(({ mealType, months, state }) => {
        const label = mealType === 'breakfast' ? 'Сніданок' : 'Обід';
        const month = months?.find((candidate) => candidate.month === monthNumber);
        const weeks = monthNumber
          ? (month?.weeks ?? [])
          : (months?.flatMap((candidate) => candidate.weeks) ?? []);
        const week = weeks.find((candidate) => candidate.date_from === weekFrom);
        const sourceDays = weekFrom
          ? (week?.days ?? [])
          : weeks.flatMap((candidate) => candidate.days);
        const days = [...new Map(sourceDays.map((day) => [day.service_date, day])).values()].filter(
          (day) =>
            serviceDate
              ? day.service_date === serviceDate
              : weekFrom ||
                !month ||
                (day.service_date >= month.date_from && day.service_date <= month.date_to)
        );
        const missing = days.filter(
          (day) =>
            day.missing_requirements > 0 || day.generated_requirements < day.expected_requirements
        );
        const stale = days.filter((day) => day.stale_requirements > 0);
        const activeDays = days.filter(
          (day) => day.expected_requirements > 0 || day.generated_requirements > 0
        );
        const issues = [
          missing.length > 0
            ? serviceDate
              ? `не сформовано (${missing[0].generated_requirements} із ${missing[0].expected_requirements})`
              : `не сформовано за ${missing.length} дн.`
            : null,
          stale.length > 0
            ? serviceDate
              ? 'потрібно оновити'
              : `потрібно оновити за ${stale.length} дн.`
            : null,
        ].filter(Boolean);
        const text =
          state === 'pending'
            ? 'уточнюємо…'
            : state === 'error'
              ? 'не вдалося уточнити'
              : issues.length > 0
                ? issues.join('; ')
                : activeDays.length === 0
                  ? 'немає даних'
                  : activeDays.every((day) => day.not_served)
                    ? 'не харчувалися'
                    : 'готово';
        const hasIssues = state === 'ready' && issues.length > 0;

        return (
          <span
            key={mealType}
            className={hasIssues ? 'font-semibold text-amber-800' : 'text-slate-600'}
          >
            {label}: {text}
          </span>
        );
      })}
    </span>
  );
}
