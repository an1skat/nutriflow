"use client";

import { FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useMenuRequirements } from "@/entities/menu-requirement/api/MenuRequirementQueries";
import type {
  MenuRequirement,
  MenuRequirementIngredientRow,
} from "@/entities/menu-requirement/model/MenuRequirement";
import { AGE_GROUP_LABELS } from "@/features/weekly-menu-editor/model/WeeklyMenuFormSchema";
import { formatDate } from "@/shared/lib/FormatDate";
import { RequestError } from "@/shared/ui/RequestError";

export function MenuRequirementSchoolWorkspace() {
  const requirements = useMenuRequirements({
    offset: 0,
    limit: 100,
  });
  const [selectedId, setSelectedId] = useState("");
  const items = requirements.data?.items ?? [];
  const effectiveSelectedId = items.some((item) => item.id === selectedId)
    ? selectedId
    : (items[0]?.id ?? "");

  const selectedRequirement =
    items.find((item) => item.id === effectiveSelectedId) ?? null;

  return (
    <main className="nf-page nf-page-wide">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Облік продуктів</p>
        <h1 className="nf-title">Меню-вимога</h1>
        <p className="nf-description">
          Нетто інгредієнтів на одну особу та округлена кількість продуктів до
          видачі для конкретної групи.
        </p>
      </header>

      {requirements.isError ? (
        <RequestError
          error={requirements.error}
          onRetry={() => void requirements.refetch()}
        />
      ) : null}

      {requirements.isPending ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <p role="status" className="text-sm text-slate-600">
              Завантажуємо меню-вимоги…
            </p>
          </div>
        </section>
      ) : null}

      {requirements.data?.items.length === 0 ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <div className="nf-empty">
              <FileSpreadsheet
                className="mx-auto mb-3 size-8 text-slate-400"
                aria-hidden
              />
              <p>Ще немає сформованих меню-вимог.</p>
              <Link href="/daily-menu" className="nf-link mt-2 inline-block">
                Перейти до денного меню
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {requirements.data?.items.length ? (
        <div className="space-y-5">
          <section className="nf-panel">
            <div className="nf-panel-body">
              <label htmlFor="menu-requirement-select" className="nf-label">
                День і група
              </label>
              <select
                id="menu-requirement-select"
                className="nf-input max-w-3xl"
                value={effectiveSelectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {requirements.data.items.map((requirement) => (
                  <option key={requirement.id} value={requirement.id}>
                    {formatRequirementOption(requirement)}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {selectedRequirement ? (
            <MenuRequirementTable requirement={selectedRequirement} />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

export function MenuRequirementTable({
  requirement,
}: {
  requirement: MenuRequirement;
}) {
  return (
    <section className="nf-panel">
      <div className="nf-panel-header items-start">
        <div>
          <p className="nf-eyebrow">{requirement.school_group_name}</p>
          <h2 className="nf-panel-title">{requirement.menu_title}</h2>
          <p className="mt-1 text-xs text-slate-600">
            {formatServiceDate(requirement.service_date)} ·{" "}
            {AGE_GROUP_LABELS[requirement.age_group]} ·{" "}
            {requirement.meal_type === "lunch" ? "обід" : "сніданок"}
          </p>
        </div>
        <div className="text-right text-xs text-slate-600">
          <p>Версія {requirement.revision}</p>
          <p className="mt-1">
            Сформовано {formatDate(requirement.generated_at)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-max border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-800">
              <th
                scope="col"
                className="sticky left-0 z-20 min-w-56 border-b border-r border-slate-300 bg-slate-100 px-3 py-3 text-left"
              >
                Інгредієнт
              </th>
              {requirement.dishes.map((dish) => (
                <th
                  key={dish.menu_item_id}
                  scope="col"
                  className="w-44 min-w-44 border-b border-r border-slate-300 px-3 py-3 text-center align-top"
                >
                  <span className="block font-bold">{dish.name}</span>
                  <span className="mt-1 block text-xs font-normal text-slate-600">
                    Вихід: {dish.yield_amount} г
                  </span>
                  <span className="block text-xs font-normal text-slate-600">
                    Дітей: {dish.children_count}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="w-40 min-w-40 border-b border-r border-slate-300 bg-emerald-50 px-3 py-3 text-right align-top"
              >
                Разом на одну особу, г
              </th>
              <th
                scope="col"
                className="w-40 min-w-40 border-b border-slate-300 bg-emerald-100 px-3 py-3 text-right align-top"
              >
                До видачі, г ↑
              </th>
            </tr>
          </thead>
          <tbody>
            {requirement.ingredient_rows.map((row) => (
              <IngredientRow
                key={row.key}
                row={row}
                dishIds={requirement.dishes.map((dish) => dish.menu_item_id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        «До видачі» враховує окрему кількість дітей для кожної страви та
        округлюється вгору до цілого грама.
      </div>
    </section>
  );
}

function IngredientRow({
  row,
  dishIds,
}: {
  row: MenuRequirementIngredientRow;
  dishIds: string[];
}) {
  const cells = useMemo(
    () => new Map(row.cells.map((cell) => [cell.menu_item_id, cell])),
    [row.cells],
  );

  return (
    <tr className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50">
      <th
        scope="row"
        className="sticky left-0 z-10 border-r border-slate-300 bg-white px-3 py-2 text-left font-medium text-slate-900"
      >
        {row.ingredient_name}
      </th>
      {dishIds.map((dishId) => {
        const cell = cells.get(dishId);

        return (
          <td
            key={dishId}
            className="border-r border-slate-200 px-3 py-2 text-right tabular-nums text-slate-700"
          >
            {cell ? formatGrams(cell.net_per_person_g) : "—"}
          </td>
        );
      })}
      <td className="border-r border-slate-300 bg-emerald-50/50 px-3 py-2 text-right font-bold tabular-nums text-slate-900">
        {formatGrams(row.per_person_total_g)}
      </td>
      <td className="bg-emerald-100/60 px-3 py-2 text-right font-bold tabular-nums text-emerald-950">
        {formatInteger(row.issue_total_rounded_g)}
      </td>
    </tr>
  );
}

function formatRequirementOption(requirement: MenuRequirement): string {
  const meal = requirement.meal_type === "lunch" ? "Обід" : "Сніданок";
  return `${formatServiceDate(requirement.service_date)} · ${meal} · ${requirement.school_group_name} · ${requirement.menu_title}`;
}

function formatServiceDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
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
