"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  useAllergens,
  useDishCard,
  useDishCardVersion,
} from "@/entities/recipe/api/RecipeQueries";
import { useCurrentUser } from "@/entities/session/api/SessionQueries";
import type {
  Allergen,
  DishCardVersion,
  IngredientAmount,
  PortionVariant,
} from "@/entities/recipe/model/Recipe";
import { hasPermission } from "@/features/access/model/AccessPolicy";
import { formatDate } from "@/shared/lib/FormatDate";
import { RequestError } from "@/shared/ui/RequestError";

const STATUS_LABELS: Record<DishCardVersion["status"], string> = {
  draft: "Чернетка",
  import_preview: "Прев'ю імпорту",
  confirmed: "Підтверджено",
  archived: "Архів",
};

type IngredientRow = {
  key: string;
  ingredientId: string | null;
  name: string;
  notes: string | null;
  amountsByPortionId: Record<string, IngredientAmount>;
};

type Props = {
  dishCardId: string;
  versionId: string;
};

export function DishCardVersionDetailsWidget({ dishCardId, versionId }: Props) {
  const dishCard = useDishCard(dishCardId);
  const version = useDishCardVersion(versionId);
  const allergens = useAllergens("");
  const currentUser = useCurrentUser();
  const canManage = Boolean(
    currentUser.data && hasPermission(currentUser.data, "recipes.manage"),
  );

  const allergenById = useMemo(
    () => new Map((allergens.data?.items ?? []).map((item) => [item.id, item])),
    [allergens.data?.items],
  );

  const rows = useMemo(
    () => (version.data ? groupIngredientRows(version.data) : []),
    [version.data],
  );

  if (dishCard.isPending || version.isPending) {
    return (
      <main className="nf-page">
        <p className="text-sm text-slate-600">Завантажуємо техкарту…</p>
      </main>
    );
  }

  if (dishCard.isError || version.isError || !dishCard.data || !version.data) {
    return (
      <main className="nf-page">
        <RequestError
          error={dishCard.error ?? version.error ?? null}
          onRetry={() => {
            void dishCard.refetch();
            void version.refetch();
          }}
        />
      </main>
    );
  }

  const isCurrent = dishCard.data.current_version_id === version.data.id;

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <p className="nf-eyebrow">
          <Link href="/admin/recipe" className="nf-link">
            Каталог
          </Link>
          {" / "}
          <Link
            href={`/admin/recipe/dish-cards/${dishCardId}`}
            className="nf-link"
          >
            Версії
          </Link>
          {" / "}v{version.data.version}
        </p>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="nf-title">{dishCard.data.name}</h1>
            <p className="nf-description">
              Номер <code className="text-xs">{dishCard.data.card_number}</code>
              {dishCard.data.category ? <> · {dishCard.data.category}</> : null}
              {isCurrent ? <> · поточна версія</> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <Link
                href={`/admin/recipe/dish-cards/${dishCardId}/versions/new`}
                className="nf-button nf-button-primary"
              >
                Створити нову версію
              </Link>
            ) : null}
            <Link
              href={`/admin/recipe/dish-cards/${dishCardId}`}
              className="nf-button nf-button-secondary"
            >
              До списку версій
            </Link>
          </div>
        </div>
      </header>

      <section className="nf-panel">
        <div className="nf-panel-header">
          <h2 className="nf-panel-title">Дані версії</h2>
        </div>
        <div className="nf-panel-body">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <Fact label="Статус" value={STATUS_LABELS[version.data.status]} />
            <Fact label="Версія" value={`v${version.data.version}`} />
            <Fact
              label="Створено"
              value={formatDate(version.data.created_at)}
            />
            <Fact
              label="Оновлено"
              value={formatDate(version.data.updated_at)}
            />
            <Fact label="Джерело картки" value={dishCard.data.source ?? "—"} />
            <Fact
              label="Файл імпорту"
              value={version.data.source_file_name ?? "—"}
            />
            <Fact
              label="Сторінка"
              value={
                version.data.source_page
                  ? String(version.data.source_page)
                  : "—"
              }
            />
            <Fact label="ID версії" value={version.data.id} />
          </dl>
        </div>
      </section>

      <section className="nf-panel">
        <div className="nf-panel-header">
          <h2 className="nf-panel-title">Алергени</h2>
        </div>
        <div className="nf-panel-body">
          {version.data.allergen_ids.length ? (
            <div className="flex flex-wrap gap-2">
              {version.data.allergen_ids.map((id) => (
                <AllergenBadge
                  key={id}
                  id={id}
                  allergen={allergenById.get(id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Алергени не вказані.</p>
          )}
        </div>
      </section>

      <section className="nf-panel">
        <div className="nf-panel-header">
          <h2 className="nf-panel-title">Порції та поживність</h2>
        </div>
        <div className="nf-panel-body">
          <div className="nf-table-wrap">
            <table className="nf-table">
              <thead>
                <tr>
                  <th className="w-32">Порція</th>
                  <th className="w-32">Вихід</th>
                  <th className="w-28">Білки</th>
                  <th className="w-28">Жири</th>
                  <th className="w-32">Вуглеводи</th>
                  <th className="w-32">Ккал</th>
                </tr>
              </thead>
              <tbody>
                {version.data.portion_variants.map((portion) => (
                  <tr key={portion.id}>
                    <td>{formatAmount(portion.portion_grams)} г</td>
                    <td>{formatAmount(portion.output_grams)} г</td>
                    {isNutritionUnknown(portion) ? (
                      <td colSpan={4} className="text-xs text-slate-600">
                        КБЖУ не вказано
                      </td>
                    ) : (
                      <>
                        <td>
                          {formatNutritionAmount(portion.nutrition.proteins)}
                        </td>
                        <td>{formatNutritionAmount(portion.nutrition.fats)}</td>
                        <td>
                          {formatNutritionAmount(portion.nutrition.carbs)}
                        </td>
                        <td>{formatNutritionAmount(portion.nutrition.kcal)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="nf-panel">
        <div className="nf-panel-header">
          <h2 className="nf-panel-title">Інгредієнти</h2>
          <p className="text-xs text-slate-600">Рядків: {rows.length}</p>
        </div>
        <div className="nf-panel-body">
          <div className="nf-table-wrap">
            <table className="nf-table min-w-[700px]">
              <thead>
                <tr>
                  <th className="min-w-60">Інгредієнт</th>
                  {version.data.portion_variants.map((portion) => (
                    <th key={portion.id} className="w-36">
                      {portionLabel(portion)}
                    </th>
                  ))}
                  <th className="w-52">Примітка</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <Link
                        href={ingredientCatalogHref(row.name)}
                        className="nf-link"
                      >
                        {row.name}
                      </Link>
                      {!row.ingredientId ? (
                        <span className="ml-2 text-xs text-slate-500">
                          не прив&apos;язано
                        </span>
                      ) : null}
                    </td>
                    {version.data.portion_variants.map((portion) => {
                      const amount = row.amountsByPortionId[portion.id];
                      return (
                        <td
                          key={portion.id}
                          className="whitespace-nowrap text-xs"
                        >
                          {amount ? (
                            <>
                              <span className="font-bold">
                                {formatAmount(amount.gross_amount)}
                              </span>
                              <span className="text-slate-500"> / </span>
                              <span>{formatAmount(amount.net_amount)}</span>
                              <span className="ml-1 text-slate-500">
                                {amount.unit}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                    <td className="text-xs text-slate-600">
                      {row.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            У клітинках: брутто / нетто.
          </p>
        </div>
      </section>

      <section className="nf-panel">
        <div className="nf-panel-header">
          <h2 className="nf-panel-title">Технологія приготування</h2>
        </div>
        <div className="nf-panel-body">
          {version.data.technology_text ? (
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
              {version.data.technology_text}
            </p>
          ) : (
            <p className="text-sm text-slate-600">Технологію не вказано.</p>
          )}
        </div>
      </section>

      {version.data.recognized_warnings.length ||
      version.data.recognition_errors.length ? (
        <section className="nf-panel">
          <div className="nf-panel-header">
            <h2 className="nf-panel-title">Діагностика імпорту</h2>
          </div>
          <div className="nf-panel-body flex flex-col gap-3">
            {version.data.recognition_errors.length ? (
              <MessageList
                title="Помилки"
                items={version.data.recognition_errors}
                tone="error"
              />
            ) : null}
            {version.data.recognized_warnings.length ? (
              <MessageList
                title="Попередження"
                items={version.data.recognized_warnings}
                tone="warning"
              />
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function AllergenBadge({
  id,
  allergen,
}: {
  id: string;
  allergen: Allergen | undefined;
}) {
  const label = allergen ? `${allergen.code} — ${allergen.name}` : id;
  const href = allergen
    ? `/admin/recipe?tab=allergens&query=${encodeURIComponent(allergen.code)}`
    : "/admin/recipe?tab=allergens";

  return (
    <Link href={href} className="nf-button nf-button-secondary">
      {label}
    </Link>
  );
}

function MessageList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "error" | "warning";
}) {
  return (
    <div
      className={
        tone === "error"
          ? "border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          : "border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
      }
    >
      <p className="font-bold">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function groupIngredientRows(version: DishCardVersion): IngredientRow[] {
  const rows = new Map<string, IngredientRow>();

  for (const amount of version.ingredient_amounts) {
    const key = [
      amount.ingredient_id ?? "",
      amount.ingredient_name_snapshot,
      amount.notes ?? "",
    ].join("|");
    const existing = rows.get(key);

    if (existing) {
      existing.amountsByPortionId[amount.portion_variant_id] = amount;
      continue;
    }

    rows.set(key, {
      key,
      ingredientId: amount.ingredient_id,
      name: amount.ingredient_name_snapshot,
      notes: amount.notes,
      amountsByPortionId: {
        [amount.portion_variant_id]: amount,
      },
    });
  }

  return Array.from(rows.values());
}

function ingredientCatalogHref(name: string): string {
  return `/admin/recipe?tab=ingredients&query=${encodeURIComponent(name)}`;
}

function portionLabel(portion: PortionVariant): string {
  const amount = portion.portion_grams ?? portion.output_grams;
  return `${formatAmount(amount)} г`;
}

function formatAmount(value: string | null): string {
  return value ?? "—";
}

function isNutritionUnknown(portion: PortionVariant): boolean {
  return (
    Number(portion.nutrition.proteins) === 0 &&
    Number(portion.nutrition.fats) === 0 &&
    Number(portion.nutrition.carbs) === 0 &&
    Number(portion.nutrition.kcal) === 0
  );
}

function formatNutritionAmount(value: string | null): string {
  if (value === null) {
    return "—";
  }
  return value;
}
