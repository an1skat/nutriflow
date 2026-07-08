"use client";

import Link from "next/link";
import { useState } from "react";

import {
  useAllergens,
  useDishCards,
  useIngredients,
} from "@/entities/recipe/api/RecipeQueries";
import { useCurrentUser } from "@/entities/session/api/SessionQueries";
import { hasPermission } from "@/features/access/model/AccessPolicy";
import { CreateAllergenForm } from "@/features/recipe-management/ui/CreateAllergenForm";
import { CreateIngredientForm } from "@/features/recipe-management/ui/CreateIngredientForm";
import { EditAllergenForm } from "@/features/recipe-management/ui/EditAllergenForm";
import { EditIngredientForm } from "@/features/recipe-management/ui/EditIngredientForm";
import { RequestError } from "@/shared/ui/RequestError";
import { StatusBadge } from "@/shared/ui/StatusBadge";

export type RecipeCatalogTab = "dish-cards" | "ingredients" | "allergens";

type RecipeCatalogWidgetProps = {
  initialTab?: RecipeCatalogTab;
  initialQuery?: string;
};

export function RecipeCatalogWidget({
  initialTab = "dish-cards",
  initialQuery = "",
}: RecipeCatalogWidgetProps) {
  const [tab, setTab] = useState<RecipeCatalogTab>(initialTab);
  const currentUser = useCurrentUser();
  const canManage = Boolean(
    currentUser.data && hasPermission(currentUser.data, "recipes.manage"),
  );

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Адміністрування</p>
        <h1 className="nf-title">Каталог техкарт</h1>
        <p className="nf-description">
          {canManage
            ? "Техкарти, інгредієнти та алергени. Натисніть на запис, щоб переглянути чи відредагувати."
            : "Перегляд техкарт, інгредієнтів та алергенів без можливості редагування."}
        </p>
      </header>

      <div className="nf-tabs">
        <div role="tablist" className="flex items-center gap-1">
          <TabButton
            active={tab === "dish-cards"}
            onClick={() => setTab("dish-cards")}
          >
            Техкарти
          </TabButton>
          <TabButton
            active={tab === "ingredients"}
            onClick={() => setTab("ingredients")}
          >
            Інгредієнти
          </TabButton>
          <TabButton
            active={tab === "allergens"}
            onClick={() => setTab("allergens")}
          >
            Алергени
          </TabButton>
        </div>
        {canManage ? (
          <div className="ml-auto flex items-center pr-1">
            <Link
              href="/admin/recipe-upload"
              className="nf-button nf-button-secondary"
            >
              Завантажити техкарту
            </Link>
          </div>
        ) : null}
      </div>

      {tab === "dish-cards" ? (
        <DishCardsTab
          initialQuery={initialTab === "dish-cards" ? initialQuery : ""}
        />
      ) : null}
      {tab === "ingredients" ? (
        <IngredientsTab
          initialQuery={initialTab === "ingredients" ? initialQuery : ""}
          canManage={canManage}
        />
      ) : null}
      {tab === "allergens" ? (
        <AllergensTab
          initialQuery={initialTab === "allergens" ? initialQuery : ""}
          canManage={canManage}
        />
      ) : null}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`nf-tab ${active ? "nf-tab-active" : ""}`}
    >
      {children}
    </button>
  );
}

function DishCardsTab({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const dishCards = useDishCards(query);
  return (
    <section className="nf-panel mt-4">
      <div className="nf-panel-header">
        <h2 className="nf-panel-title">Техкарти</h2>
        {dishCards.data ? (
          <p className="mt-0.5 text-xs text-slate-600">
            Записів: {dishCards.data.total}
          </p>
        ) : null}
      </div>
      <div className="nf-panel-body">
        <input
          className="nf-input mb-3"
          placeholder="Пошук за номером або назвою…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {dishCards.isPending ? (
          <p className="text-sm text-slate-600">Завантажуємо…</p>
        ) : null}
        {dishCards.isError ? (
          <RequestError
            error={dishCards.error}
            onRetry={() => void dishCards.refetch()}
          />
        ) : null}
        {dishCards.data?.items.length === 0 ? (
          <div className="nf-empty">Техкарт не знайдено.</div>
        ) : null}
        {dishCards.data?.items.length ? (
          <div className="nf-table-wrap">
            <table className="nf-table">
              <thead>
                <tr>
                  <th className="w-28">Номер</th>
                  <th>Назва</th>
                  <th className="w-40">Категорія</th>
                  <th className="w-32">Статус</th>
                </tr>
              </thead>
              <tbody>
                {dishCards.data.items.map((dc) => (
                  <tr key={dc.id}>
                    <td>
                      <Link
                        href={`/admin/recipe/dish-cards/${dc.id}`}
                        className="nf-link"
                      >
                        <code className="text-xs">{dc.card_number}</code>
                      </Link>
                    </td>
                    <td>
                      <Link
                        href={`/admin/recipe/dish-cards/${dc.id}`}
                        className="nf-link"
                      >
                        {dc.name}
                      </Link>
                    </td>
                    <td className="text-xs text-slate-600">
                      {dc.category ?? "—"}
                    </td>
                    <td>
                      <StatusBadge isActive={dc.is_active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function IngredientsTab({
  initialQuery = "",
  canManage,
}: {
  initialQuery?: string;
  canManage: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [editingId, setEditingId] = useState<string | null>(null);
  const ingredients = useIngredients(query);
  return (
    <div className="mt-4 flex flex-col gap-4">
      {canManage ? (
        <section className="nf-panel">
          <div className="nf-panel-header">
            <h2 className="nf-panel-title">Додати інгредієнт</h2>
          </div>
          <div className="nf-panel-body">
            <CreateIngredientForm />
          </div>
        </section>
      ) : null}
      <section className="nf-panel">
        <div className="nf-panel-header">
          <h2 className="nf-panel-title">Інгредієнти</h2>
          {ingredients.data ? (
            <p className="mt-0.5 text-xs text-slate-600">
              Записів: {ingredients.data.total}
            </p>
          ) : null}
        </div>
        <div className="nf-panel-body">
          <input
            className="nf-input mb-3"
            placeholder="Пошук за назвою або аліасом…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {ingredients.isPending ? (
            <p className="text-sm text-slate-600">Завантажуємо…</p>
          ) : null}
          {ingredients.isError ? (
            <RequestError
              error={ingredients.error}
              onRetry={() => void ingredients.refetch()}
            />
          ) : null}
          {ingredients.data?.items.length === 0 ? (
            <div className="nf-empty">Інгредієнтів не знайдено.</div>
          ) : null}
          {ingredients.data?.items.length ? (
            <ul className="divide-y divide-[var(--nf-line)]">
              {ingredients.data.items.map((item) => (
                <li key={item.id} className="py-2">
                  {canManage && editingId === item.id ? (
                    <EditIngredientForm
                      ingredient={item}
                      onSaved={() => setEditingId(null)}
                    />
                  ) : canManage ? (
                    <button
                      type="button"
                      onClick={() => setEditingId(item.id)}
                      className="flex w-full items-center justify-between text-left"
                    >
                      <IngredientSummary item={item} />
                    </button>
                  ) : (
                    <div className="flex w-full items-center justify-between text-left">
                      <IngredientSummary item={item} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function IngredientSummary({
  item,
}: {
  item: {
    name: string;
    unit: string;
    aliases: string[];
    is_active: boolean;
  };
}) {
  return (
    <>
      <span>
        <span className="font-bold">{item.name}</span>
        <span className="ml-2 text-xs text-slate-500">{item.unit}</span>
        {item.aliases.length ? (
          <span className="ml-2 text-xs text-slate-500">
            аліаси: {item.aliases.join(", ")}
          </span>
        ) : null}
      </span>
      <StatusBadge isActive={item.is_active} />
    </>
  );
}

function AllergenSummary({
  item,
}: {
  item: { code: string; name: string; description: string | null };
}) {
  return (
    <span>
      <code className="font-bold">{item.code}</code>
      <span className="ml-2 font-bold">{item.name}</span>
      {item.description ? (
        <span className="ml-2 text-xs text-slate-500">{item.description}</span>
      ) : null}
    </span>
  );
}

function AllergensTab({
  initialQuery = "",
  canManage,
}: {
  initialQuery?: string;
  canManage: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [editingId, setEditingId] = useState<string | null>(null);
  const allergens = useAllergens(query);
  return (
    <div className="mt-4 flex flex-col gap-4">
      {canManage ? (
        <section className="nf-panel">
          <div className="nf-panel-header">
            <h2 className="nf-panel-title">Додати алерген</h2>
          </div>
          <div className="nf-panel-body">
            <CreateAllergenForm />
          </div>
        </section>
      ) : null}
      <section className="nf-panel">
        <div className="nf-panel-header">
          <h2 className="nf-panel-title">Алергени</h2>
          {allergens.data ? (
            <p className="mt-0.5 text-xs text-slate-600">
              Записів: {allergens.data.total}
            </p>
          ) : null}
        </div>
        <div className="nf-panel-body">
          <input
            className="nf-input mb-3"
            placeholder="Пошук за кодом або назвою…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {allergens.isPending ? (
            <p className="text-sm text-slate-600">Завантажуємо…</p>
          ) : null}
          {allergens.isError ? (
            <RequestError
              error={allergens.error}
              onRetry={() => void allergens.refetch()}
            />
          ) : null}
          {allergens.data?.items.length === 0 ? (
            <div className="nf-empty">Алергенів немає.</div>
          ) : null}
          {allergens.data?.items.length ? (
            <ul className="divide-y divide-[var(--nf-line)]">
              {allergens.data.items.map((item) => (
                <li key={item.id} className="py-2">
                  {canManage && editingId === item.id ? (
                    <EditAllergenForm
                      allergen={item}
                      onSaved={() => setEditingId(null)}
                    />
                  ) : canManage ? (
                    <button
                      type="button"
                      onClick={() => setEditingId(item.id)}
                      className="flex w-full items-center justify-between text-left"
                    >
                      <AllergenSummary item={item} />
                    </button>
                  ) : (
                    <div className="flex w-full items-center justify-between text-left">
                      <AllergenSummary item={item} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}
