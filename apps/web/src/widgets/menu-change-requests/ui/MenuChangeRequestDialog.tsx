'use client';

import { useEffect, useMemo, useRef } from 'react';

import { CheckCheck, Clock3, X } from 'lucide-react';

import type {
  MenuChangeRequest,
  MenuFieldChange,
} from '@/entities/menu-change-request/model/MenuChangeRequest';
import { AGE_GROUP_LABELS, WEEKDAY_LABELS } from '@/entities/weekly-menu/model/WeeklyMenu';
import { formatDate } from '@/shared/lib/FormatDate';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';
import { RequestError } from '@/shared/ui/RequestError';

const FIELD_LABELS: Record<string, string> = {
  item_added: 'Додано позицію',
  item_removed: 'Видалено позицію',
  kind: 'Тип позиції',
  source_text: 'Джерело',
  recipe_card_number: 'Номер техкарти',
  dish_card_id: 'Техкарта (ID)',
  dish_card_version_id: 'Версія техкарти (ID)',
  product_ingredient_id: 'Інгредієнт (ID)',
  product_name_snapshot: 'Промисловий виріб',
  name: 'Назва страви',
  allergen_codes: 'Алергени',
  portions: 'Порції та КБЖВ',
  notes: 'Нотатки',
};

const HIDDEN_TECHNICAL_FIELDS = new Set([
  'dish_card_id',
  'dish_card_version_id',
  'product_ingredient_id',
]);

const NUTRITION_LABELS: Record<string, string> = {
  kcal: 'ккал',
  proteins: 'Б',
  fats: 'Ж',
  carbs: 'В',
};

export function MenuChangeRequestDialog({
  open,
  request,
  loading,
  error,
  onRetry,
  onClose,
}: {
  open: boolean;
  request?: MenuChangeRequest;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [open]);

  const groupedChanges = useMemo(() => (request ? groupChanges(request) : []), [request]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="menu-change-dialog-title"
      className="m-auto max-h-[92vh] w-[min(1120px,calc(100%-2rem))] overflow-hidden border border-slate-300 bg-white p-0 shadow-2xl backdrop:bg-slate-950/45"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[92vh] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="min-w-0">
            <p className="nf-eyebrow">{request?.school_name ?? 'Зміни меню'}</p>
            <h2 id="menu-change-dialog-title" className="nf-panel-title mt-1">
              {request?.menu_title ?? 'Деталі зміни'}
            </h2>
            {request ? (
              <p className="mt-1 text-xs text-slate-600">
                {request.meal_type === 'lunch' ? 'Обід' : 'Сніданок'}
                {request.cycle_week ? ` · цикл ${request.cycle_week}` : ''}
                {` · надіслано ${formatDate(request.created_at)}`}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {request ? <StatusBadge status={request.status} /> : null}
            <button
              type="button"
              className="nf-button nf-button-ghost min-h-9 px-2"
              aria-label="Закрити"
              onClick={onClose}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </header>

        <div className="min-h-0 overflow-y-auto p-5">
          {loading ? <LoadingSpinner label="Завантажуємо зміни…" /> : null}

          {error ? <RequestError error={error} onRetry={onRetry} /> : null}

          {request ? (
            <div className="space-y-4">
              {groupedChanges.map((group) => {
                const addedChange = group.changes.find((change) => change.field === 'item_added');
                const removedChange = group.changes.find((change) => change.field === 'item_removed');

                return (
                  <section
                    key={`${group.weekday}-${group.position}`}
                    className="border border-amber-200 bg-amber-50/40"
                  >
                    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
                      <h3 className="text-sm font-bold text-amber-950">
                        {removedChange
                          ? `${WEEKDAY_LABELS[group.weekday]} — видалено: ${String(removedChange.before_value)}`
                          : addedChange
                          ? `${WEEKDAY_LABELS[group.weekday]} — додано: ${String(addedChange.after_value)}`
                          : `${WEEKDAY_LABELS[group.weekday]} · страва № ${group.position}`}
                        {group.date ? ` · ${formatDayDate(group.date)}` : ''}
                      </h3>
                    </div>
                    <ChangeComparisonTables changes={group.changes} />
                  </section>
                );
              })}

              <details className="border border-slate-200 bg-slate-50">
                <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-800">
                  Меню після збереження
                </summary>
                <div className="space-y-3 border-t border-slate-200 p-4">
                  {request.days_snapshot.map((day) => (
                    <div key={day.weekday}>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                        {WEEKDAY_LABELS[day.weekday]}
                        {day.date ? ` · ${formatDayDate(day.date)}` : ''}
                      </p>
                      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-800">
                        {[...day.items]
                          .sort((left, right) => left.position - right.position)
                          .map((item) => (
                            <li key={item.id}>{item.name}</li>
                          ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

function StatusBadge({ status }: { status: MenuChangeRequest['status'] }) {
  const pending = status === 'pending';
  return (
    <span
      className={`inline-flex items-center gap-1 border px-2 py-1 text-xs font-bold ${
        pending
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-emerald-300 bg-emerald-50 text-emerald-900'
      }`}
    >
      {pending ? (
        <Clock3 className="size-3.5" aria-hidden />
      ) : (
        <CheckCheck className="size-3.5" aria-hidden />
      )}
      {pending ? 'Нова зміна' : 'Переглянуто'}
    </span>
  );
}

function ChangeComparisonTables({ changes }: { changes: MenuFieldChange[] }) {
  return (
    <div className="grid gap-4 bg-white p-4 xl:grid-cols-2">
      <ComparisonTable side="before" changes={changes} />
      <ComparisonTable side="after" changes={changes} />
    </div>
  );
}

function ComparisonTable({
  side,
  changes,
}: {
  side: 'before' | 'after';
  changes: MenuFieldChange[];
}) {
  const isBefore = side === 'before';

  return (
    <div
      className={`overflow-hidden border ${isBefore ? 'border-rose-200' : 'border-emerald-200'}`}
    >
      <div
        className={`border-b px-3 py-2 text-sm font-bold ${
          isBefore
            ? 'border-rose-200 bg-rose-50 text-rose-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900'
        }`}
      >
        {isBefore ? 'Було' : 'Стало'}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-105 border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-600">
              <th className="w-40 border-b border-slate-200 px-3 py-2">Поле</th>
              <th className="border-b border-slate-200 px-3 py-2">Значення</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr
                key={`${change.item_id}-${change.field}-${side}`}
                className="border-b border-slate-100 last:border-b-0"
              >
                <th
                  scope="row"
                  className="bg-slate-50/70 px-3 py-3 text-left align-top text-xs font-bold text-slate-700"
                >
                  {FIELD_LABELS[change.field] ?? change.field}
                </th>
                <td
                  className={`border-l-4 px-3 py-3 align-top ${
                    isBefore
                      ? 'border-l-rose-400 bg-rose-50/70'
                      : 'border-l-emerald-500 bg-emerald-50/70'
                  }`}
                >
                  <ValuePreview
                    field={change.field}
                    value={isBefore ? change.before_value : change.after_value}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValuePreview({ field, value }: { field: string; value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-500">Не вказано</span>;
  }
  if (field === 'kind') {
    return value === 'dish_card' ? 'Страва з техкарти' : 'Промисловий виріб';
  }
  if (field === 'portions' && Array.isArray(value)) {
    return <PortionsPreview portions={value} />;
  }
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      return value.length > 0 ? value.join(', ') : 'Немає';
    }
    return 'Дані оновлено';
  }
  if (typeof value === 'object') {
    return 'Дані оновлено';
  }
  return <span className="wrap-break-word text-slate-800">{String(value)}</span>;
}

function PortionsPreview({ portions }: { portions: unknown[] }) {
  if (portions.length === 0) {
    return <span className="text-slate-500">Не вказано</span>;
  }

  return (
    <ul className="space-y-2">
      {portions.map((portion, index) => {
        if (!isRecord(portion)) {
          return <li key={index}>Дані порції оновлено</li>;
        }

        const ageGroup =
          typeof portion.age_group === 'string'
            ? (AGE_GROUP_LABELS[portion.age_group as keyof typeof AGE_GROUP_LABELS] ??
              portion.age_group)
            : 'Вікова група';
        const yieldAmount =
          typeof portion.yield_amount === 'string'
            ? `${portion.yield_amount} г`
            : 'вагу не вказано';
        const nutritionValues = isRecord(portion.nutrition) ? portion.nutrition : null;
        const nutrition = nutritionValues
          ? Object.entries(NUTRITION_LABELS)
              .flatMap(([key, label]) => {
                const nutritionValue = nutritionValues[key];
                return nutritionValue === null ||
                  nutritionValue === undefined ||
                  nutritionValue === ''
                  ? []
                  : [`${label}: ${String(nutritionValue)}`];
              })
              .join(' · ')
          : '';

        return (
          <li key={`${String(portion.age_group)}-${index}`}>
            <span className="font-bold text-slate-800">{ageGroup}:</span> {yieldAmount}
            {nutrition ? ` · ${nutrition}` : ''}
          </li>
        );
      })}
    </ul>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function groupChanges(request: MenuChangeRequest) {
  const groups = new Map<
    string,
    {
      weekday: MenuFieldChange['weekday'];
      position: number;
      date: string | null;
      visibleChanges: MenuFieldChange[];
    }
  >();

  for (const change of request.changes) {
    const key = `${change.weekday}:${change.position}`;
    const existing = groups.get(key) ?? {
      weekday: change.weekday,
      position: change.position,
      date: request.days_snapshot.find((day) => day.weekday === change.weekday)?.date ?? null,
      visibleChanges: [],
    };
    if (!HIDDEN_TECHNICAL_FIELDS.has(change.field)) {
      existing.visibleChanges.push(change);
    }
    groups.set(key, existing);
  }

  return [...groups.values()]
    .filter((group) => group.visibleChanges.length > 0)
    .map((group) => ({
      weekday: group.weekday,
      position: group.position,
      date: group.date,
      changes: group.visibleChanges,
    }));
}

function formatDayDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
