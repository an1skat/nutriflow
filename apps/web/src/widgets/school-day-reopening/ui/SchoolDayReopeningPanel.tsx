'use client';

import { Unlock } from 'lucide-react';
import { toast } from 'sonner';

import { useCurrentWeekClosedDays } from '@/entities/weekly-menu/api/WeeklyMenuQueries';
import { type CurrentWeekClosedDay, WEEKDAY_LABELS } from '@/entities/weekly-menu/model/WeeklyMenu';
import { useReopenWeeklyMenuDay } from '@/features/day-reopening/model/UseReopenWeeklyMenuDay';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { formatDate } from '@/shared/lib/FormatDate';
import { parseLocalDate } from '@/shared/lib/LocalDate';
import { useConfirm } from '@/shared/ui/ConfirmDialog';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';
import { RequestError } from '@/shared/ui/RequestError';

const localDateFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function SchoolDayReopeningPanel({ schoolId }: { schoolId: string }) {
  const confirm = useConfirm();
  const closedDays = useCurrentWeekClosedDays(schoolId);
  const reopenDay = useReopenWeeklyMenuDay(schoolId);

  const handleReopen = async (item: CurrentWeekClosedDay) => {
    const confirmed = await confirm({
      title: 'Відкрити день повторно?',
      description:
        `${WEEKDAY_LABELS[item.weekday]}, ${formatLocalDate(item.date)}. ` +
        'Школа зможе змінити дані та повторно сформувати меню-вимогу. ' +
        'Поточна меню-вимога не видаляється автоматично.',
      confirmLabel: 'Відкрити день',
      variant: 'danger',
    });

    if (!confirmed) {
      return;
    }

    try {
      await reopenDay.mutateAsync({
        menuId: item.menu_id,
        weekday: item.weekday,
      });
      toast.success('День відкрито повторно.');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <section className="nf-panel mt-5">
      <div className="nf-panel-header">
        <div>
          <h2 className="nf-panel-title">Закриті дні поточного тижня</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Після відкриття школа зможе виправити дані дня.
          </p>
        </div>
      </div>

      <div className="nf-panel-body">
        {closedDays.isPending ? <LoadingSpinner label="Завантажуємо закриті дні…" /> : null}

        {closedDays.isError ? (
          <RequestError error={closedDays.error} onRetry={() => void closedDays.refetch()} />
        ) : null}

        {closedDays.data ? (
          <p className="mb-4 text-xs text-slate-600">
            {formatLocalDate(closedDays.data.week_starts_on)}
            {' — '}
            {formatLocalDate(closedDays.data.week_ends_on)}
          </p>
        ) : null}

        {closedDays.data?.items.length === 0 ? (
          <div className="nf-empty">Закритих днів за поточний тиждень немає.</div>
        ) : null}

        {closedDays.data?.items.length ? (
          <div className="nf-table-wrap">
            <table className="nf-table">
              <thead>
                <tr>
                  <th>День</th>
                  <th>Меню</th>
                  <th>Закрито</th>
                  <th className="w-44">Дія</th>
                </tr>
              </thead>
              <tbody>
                {closedDays.data.items.map((item) => {
                  const isCurrentMutation =
                    reopenDay.isPending &&
                    reopenDay.variables?.menuId === item.menu_id &&
                    reopenDay.variables.weekday === item.weekday;

                  return (
                    <tr key={`${item.menu_id}:${item.weekday}`}>
                      <td>
                        <div className="font-medium">{WEEKDAY_LABELS[item.weekday]}</div>
                        <div className="text-xs text-slate-600">{formatLocalDate(item.date)}</div>
                      </td>

                      <td>
                        <div>{item.menu_title}</div>
                        <div className="text-xs text-slate-600">
                          {item.meal_type === 'lunch' ? 'Обід' : 'Сніданок'}
                        </div>
                      </td>

                      <td className="text-xs text-slate-600">{formatDate(item.closed_at)}</td>

                      <td>
                        <button
                          type="button"
                          className="nf-button nf-button-secondary"
                          disabled={reopenDay.isPending}
                          onClick={() => void handleReopen(item)}
                        >
                          {isCurrentMutation ? (
                            <LoadingSpinner size="sm" label="Відкриваємо…" />
                          ) : (
                            <>
                              <Unlock className="size-4" aria-hidden />
                              Відкрити день
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatLocalDate(value: string): string {
  const parsed = parseLocalDate(value);
  return parsed ? localDateFormatter.format(parsed) : value;
}
