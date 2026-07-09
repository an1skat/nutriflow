"use client";

import { CheckCheck, Clock3 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  useMarkMenuChangeRequestReviewed,
  useMenuChangeRequests,
} from "@/entities/menu-change-request/api/MenuChangeRequestQueries";
import type {
  MenuChangeRequest,
  MenuChangeRequestStatus,
  MenuFieldChange,
} from "@/entities/menu-change-request/model/MenuChangeRequest";
import {
  AGE_GROUP_LABELS,
  WEEKDAY_LABELS,
} from "@/features/weekly-menu-editor/model/WeeklyMenuFormSchema";
import { getApiErrorMessage } from "@/shared/api/HttpClient";
import { formatDate } from "@/shared/lib/FormatDate";
import { RequestError } from "@/shared/ui/RequestError";

const FIELD_LABELS: Record<string, string> = {
  kind: "Тип позиції",
  source_text: "Джерело",
  recipe_card_number: "Номер техкарти",
  dish_card_id: "Техкарта (ID)",
  dish_card_version_id: "Версія техкарти (ID)",
  product_ingredient_id: "Інгредієнт (ID)",
  product_name_snapshot: "Промисловий виріб",
  name: "Назва страви",
  allergen_codes: "Алергени",
  portions: "Порції та КБЖВ",
  notes: "Нотатки",
};

const HIDDEN_TECHNICAL_FIELDS = new Set([
  "dish_card_id",
  "dish_card_version_id",
  "product_ingredient_id",
]);

const NUTRITION_LABELS: Record<string, string> = {
  kcal: "ккал",
  proteins: "Б",
  fats: "Ж",
  carbs: "В",
};

export function MenuChangeRequestsWorkspace() {
  const [status, setStatus] = useState<MenuChangeRequestStatus>("pending");
  const requests = useMenuChangeRequests({
    offset: 0,
    limit: 100,
    status,
  });
  const markReviewed = useMarkMenuChangeRequestReviewed();

  const handleMarkReviewed = async (requestId: string) => {
    try {
      await markReviewed.mutateAsync(requestId);
      toast.success("Зміну позначено як переглянуту.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <main className="nf-page nf-page-wide">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Технолог</p>
        <h1 className="nf-title">Зміни меню від шкіл</h1>
        <p className="nf-description">
          Тут з’являються лише збереження, у яких школа замінила страву або
          змінила її дані. Зміни кількості дітей сюди не потрапляють.
        </p>
      </header>

      <div
        className="mb-5 inline-grid w-full grid-cols-2 border border-slate-300 bg-slate-100 p-1 sm:w-80"
        role="tablist"
        aria-label="Статус змін"
      >
        <button
          type="button"
          role="tab"
          aria-selected={status === "pending"}
          className={`min-h-9 px-4 text-sm font-bold transition-colors ${
            status === "pending"
              ? "bg-white text-emerald-800 shadow-sm"
              : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
          }`}
          onClick={() => setStatus("pending")}
        >
          Нові
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={status === "reviewed"}
          className={`min-h-9 px-4 text-sm font-bold transition-colors ${
            status === "reviewed"
              ? "bg-white text-emerald-800 shadow-sm"
              : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
          }`}
          onClick={() => setStatus("reviewed")}
        >
          Переглянуті
        </button>
      </div>

      {requests.isPending ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <p role="status" className="text-sm text-slate-600">
              Завантажуємо зміни…
            </p>
          </div>
        </section>
      ) : null}

      {requests.isError ? (
        <RequestError
          error={requests.error}
          onRetry={() => void requests.refetch()}
        />
      ) : null}

      {requests.data?.items.length === 0 ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <div className="nf-empty">
              {status === "pending"
                ? "Нових змін страв від шкіл немає."
                : "Переглянутих змін поки немає."}
            </div>
          </div>
        </section>
      ) : null}

      <div className="space-y-5">
        {requests.data?.items.map((request) => (
          <ChangeRequestCard
            key={request.id}
            request={request}
            reviewing={
              markReviewed.isPending && markReviewed.variables === request.id
            }
            onMarkReviewed={() => void handleMarkReviewed(request.id)}
          />
        ))}
      </div>
    </main>
  );
}

function ChangeRequestCard({
  request,
  reviewing,
  onMarkReviewed,
}: {
  request: MenuChangeRequest;
  reviewing: boolean;
  onMarkReviewed: () => void;
}) {
  const groupedChanges = useMemo(() => groupChanges(request), [request]);

  return (
    <article className="nf-panel overflow-hidden">
      <div className="nf-panel-header items-start gap-4">
        <div>
          <p className="nf-eyebrow">{request.school_name}</p>
          <h2 className="nf-panel-title">{request.menu_title}</h2>
          <p className="mt-1 text-xs text-slate-600">
            {request.meal_type === "lunch" ? "Обід" : "Сніданок"}
            {request.cycle_week ? ` · цикл ${request.cycle_week}` : ""}
            {` · надіслано ${formatDate(request.created_at)}`}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 border px-2 py-1 text-xs font-bold ${
            request.status === "pending"
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-emerald-300 bg-emerald-50 text-emerald-900"
          }`}
        >
          {request.status === "pending" ? (
            <Clock3 className="size-3.5" aria-hidden />
          ) : (
            <CheckCheck className="size-3.5" aria-hidden />
          )}
          {request.status === "pending" ? "Нова зміна" : "Переглянуто"}
        </span>
      </div>

      <div className="nf-panel-body space-y-4">
        {groupedChanges.map((group) => (
          <section
            key={`${group.weekday}-${group.position}`}
            className="border border-amber-200 bg-amber-50/40"
          >
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
              <h3 className="text-sm font-bold text-amber-950">
                {WEEKDAY_LABELS[group.weekday]} · страва № {group.position}
                {group.date ? ` · ${formatDayDate(group.date)}` : ""}
              </h3>
            </div>
            <ChangeComparisonTables changes={group.changes} />
          </section>
        ))}

        <details className="border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-800">
            Меню після збереження
          </summary>
          <div className="space-y-3 border-t border-slate-200 p-4">
            {request.days_snapshot.map((day) => (
              <div key={day.weekday}>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  {WEEKDAY_LABELS[day.weekday]}
                  {day.date ? ` · ${formatDayDate(day.date)}` : ""}
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

        {request.status === "pending" ? (
          <button
            type="button"
            className="nf-button nf-button-primary"
            disabled={reviewing}
            onClick={onMarkReviewed}
          >
            <CheckCheck className="size-4" aria-hidden />
            {reviewing ? "Позначаємо…" : "Позначити як переглянуте"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ChangeComparisonTables({
  changes,
}: {
  changes: MenuFieldChange[];
}) {
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
  side: "before" | "after";
  changes: MenuFieldChange[];
}) {
  const isBefore = side === "before";

  return (
    <div
      className={`overflow-hidden border ${
        isBefore ? "border-rose-200" : "border-emerald-200"
      }`}
    >
      <div
        className={`border-b px-3 py-2 text-sm font-bold ${
          isBefore
            ? "border-rose-200 bg-rose-50 text-rose-900"
            : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}
      >
        {isBefore ? "Було" : "Стало"}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-600">
              <th className="w-40 border-b border-slate-200 px-3 py-2">
                Поле
              </th>
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
                      ? "border-l-rose-400 bg-rose-50/70"
                      : "border-l-emerald-500 bg-emerald-50/70"
                  }`}
                >
                  <ValuePreview
                    field={change.field}
                    value={
                      isBefore ? change.before_value : change.after_value
                    }
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

function ValuePreview({
  field,
  value,
}: {
  field: string;
  value: unknown;
}) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-500">Не вказано</span>;
  }

  if (field === "kind") {
    return value === "dish_card" ? "Страва з техкарти" : "Промисловий виріб";
  }

  if (field === "portions" && Array.isArray(value)) {
    return <PortionsPreview portions={value} />;
  }

  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) {
      return value.length > 0 ? value.join(", ") : "Немає";
    }

    return "Дані оновлено";
  }

  if (typeof value === "object") {
    return "Дані оновлено";
  }

  return <span className="break-words text-slate-800">{String(value)}</span>;
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
          typeof portion.age_group === "string"
            ? (AGE_GROUP_LABELS[
                portion.age_group as keyof typeof AGE_GROUP_LABELS
              ] ?? portion.age_group)
            : "Вікова група";
        const yieldAmount =
          typeof portion.yield_amount === "string"
            ? `${portion.yield_amount} г`
            : "вагу не вказано";
        const nutritionValues = isRecord(portion.nutrition)
          ? portion.nutrition
          : null;
        const nutrition = nutritionValues
          ? Object.entries(NUTRITION_LABELS)
              .flatMap(([key, label]) => {
                const nutritionValue = nutritionValues[key];
                return nutritionValue === null ||
                  nutritionValue === undefined ||
                  nutritionValue === ""
                  ? []
                  : [`${label}: ${String(nutritionValue)}`];
              })
              .join(" · ")
          : "";

        return (
          <li key={`${String(portion.age_group)}-${index}`}>
            <span className="font-bold text-slate-800">{ageGroup}:</span>{" "}
            {yieldAmount}
            {nutrition ? ` · ${nutrition}` : ""}
          </li>
        );
      })}
    </ul>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function groupChanges(request: MenuChangeRequest) {
  const groups = new Map<
    string,
    {
      weekday: MenuFieldChange["weekday"];
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
      date:
        request.days_snapshot.find((day) => day.weekday === change.weekday)
          ?.date ?? null,
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

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
