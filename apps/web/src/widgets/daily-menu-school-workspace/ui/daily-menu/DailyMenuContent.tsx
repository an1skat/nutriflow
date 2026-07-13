"use client";

import { Check, ChevronDown, Filter, Package, Utensils } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import {
  useDishCards,
  useIngredients,
} from "@/entities/recipe/api/RecipeQueries";
import type {
  DishCard,
  DishCardVersion,
  Ingredient,
  PortionVariant,
} from "@/entities/recipe/model/Recipe";
import type { SchoolGroup } from "@/entities/school-group/model/SchoolGroup";
import type {
  DailyMenu,
  DailyMenuItem,
  MenuPortion,
  WeeklyMenu,
  WeeklyMenuUpdatePayload,
} from "@/entities/weekly-menu/model/WeeklyMenu";
import {
  AGE_GROUP_LABELS,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
} from "@/entities/weekly-menu/model/WeeklyMenu";
import { resolveEffectiveDayDate } from "@/features/weekly-menu-editor/model/WeeklyMenuFormSchema";
import { normalizeGramAmount } from "@/shared/lib/Portion";

export type CatalogFilter = "dish_cards" | "products" | "all";

export type CatalogSelection =
  | {
      kind: "dish_card";
      dishCard: DishCard;
    }
  | {
      kind: "product";
      ingredient: Ingredient;
    };

export function DayMenuPanel({
  day,
  displayDate,
  groups,
  readOnly,
  onDishChange,
  onChildrenCountChange,
}: {
  day: DailyMenu;
  displayDate: string;
  groups: SchoolGroup[];
  readOnly: boolean;
  onDishChange: (itemId: string, item: CatalogSelection) => Promise<void>;
  onChildrenCountChange: (
    itemId: string,
    group: SchoolGroup,
    childrenCount: number,
  ) => void;
}) {
  return (
    <section className={`nf-panel ${readOnly ? "border-slate-300 bg-slate-100" : ""}`}>
      <div className="nf-panel-header">
        <div>
          <p className="nf-eyebrow">Обраний день</p>
          <h2 className="nf-panel-title">
            {WEEKDAY_LABELS[day.weekday]} · {formatFullMenuDate(displayDate)}
          </h2>
        </div>
        <span className="text-xs font-bold text-slate-600">
          {readOnly ? "Закрито" : `${day.items.length} страв`}
        </span>
      </div>
      {day.notes ? (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {day.notes}
        </div>
      ) : null}
      <div className="divide-y divide-slate-200">
        {[...day.items]
          .sort((left, right) => left.position - right.position)
          .map((item) => (
            <DishRow
              key={item.id}
              item={item}
              groups={groups}
              readOnly={readOnly}
              onDishChange={(selectedItem) =>
                void onDishChange(item.id, selectedItem)
              }
              onChildrenCountChange={(group, count) =>
                onChildrenCountChange(item.id, group, count)
              }
            />
          ))}
      </div>
      <div
        className={`border-t px-4 py-3 text-xs ${
          readOnly
            ? "border-slate-300 bg-slate-100 text-slate-600"
            : "border-amber-300 bg-amber-50 text-amber-950"
        }`}
      >
        {readOnly ? (
          "День закрито. Дані зафіксовані за останнім збереженим станом."
        ) : (
          <>
            <strong>Важливо:</strong> після заповнення цього дня натисніть
            «Зберегти зміни» вгорі сторінки.
          </>
        )}
      </div>
    </section>
  );
}

function DishRow({
  item,
  groups,
  readOnly,
  onDishChange,
  onChildrenCountChange,
}: {
  item: DailyMenuItem;
  groups: SchoolGroup[];
  readOnly: boolean;
  onDishChange: (item: CatalogSelection) => void;
  onChildrenCountChange: (group: SchoolGroup, count: number) => void;
}) {
  return (
    <article
      className={`grid gap-5 p-4 lg:grid-cols-[minmax(280px,1.1fr)_minmax(360px,1fr)] ${
        readOnly ? "bg-slate-100 text-slate-500" : "bg-white"
      }`}
    >
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
          <span className="flex size-6 items-center justify-center border border-slate-300 bg-slate-50 tabular-nums">
            {item.position}
          </span>
          <span>Страва</span>
        </div>
        <DishPicker
          selectedItem={item}
          disabled={readOnly}
          onSelect={onDishChange}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(140px,0.55fr)_1fr]">
          <div className="border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Техкарта
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {getTechnicalCardLabel(item)}
            </p>
          </div>
          <NutritionSummary portions={item.portions} />
        </div>
      </div>

      <div>
        <div className="mb-2">
          <p className="text-xs font-bold text-slate-700">Кількість дітей</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Скільки дітей у кожній групі поїли цю страву
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => {
            const count =
              item.servings.find(
                (serving) => serving.school_group_id === group.id,
              )?.children_count ?? 0;

            return (
              <label
                key={group.id}
                className="border border-slate-200 bg-slate-50 p-3"
              >
                <span className="block truncate text-xs font-bold text-slate-800">
                  {group.name}
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  {AGE_GROUP_LABELS[group.age_group]}
                </span>
                <ChildrenCountInput
                  aria-label={`${group.name}: кількість дітей для страви ${item.name}`}
                  count={count}
                  disabled={readOnly}
                  onChange={(nextCount) =>
                    onChildrenCountChange(group, nextCount)
                  }
                />
              </label>
            );
          })}
        </div>
      </div>
    </article>
  );
}

function ChildrenCountInput({
  count,
  disabled,
  onChange,
  "aria-label": ariaLabel,
}: {
  count: number;
  disabled: boolean;
  onChange: (count: number) => void;
  "aria-label": string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={4}
      className="nf-input mt-2 text-right font-bold tabular-nums"
      aria-label={ariaLabel}
      value={count}
      disabled={disabled}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
        onChange(digits ? normalizeChildrenCount(digits) : 0);
      }}
    />
  );
}

function DishPicker({
  selectedItem,
  disabled,
  onSelect,
}: {
  selectedItem: DailyMenuItem;
  disabled: boolean;
  onSelect: (item: CatalogSelection) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("dish_cards");
  const pickerRef = useRef<HTMLDivElement>(null);
  const shouldLoadDishCards = isOpen && filter !== "products";
  const shouldLoadIngredients = isOpen && filter !== "dish_cards";
  const dishCards = useDishCards(query, shouldLoadDishCards);
  const ingredients = useIngredients(query, shouldLoadIngredients);
  const visibleDishCards = shouldLoadDishCards ? (dishCards.data?.items ?? []) : [];
  const visibleIngredients = shouldLoadIngredients ? (ingredients.data?.items ?? []) : [];
  const isPending =
    (shouldLoadDishCards && dishCards.isPending) ||
    (shouldLoadIngredients && ingredients.isPending);
  const hasError =
    (shouldLoadDishCards && dishCards.isError) ||
    (shouldLoadIngredients && ingredients.isError);
  const resultCount = visibleDishCards.length + visibleIngredients.length;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isOpen]);

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 border border-slate-400 bg-white px-3 py-2 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-(--nf-brand) disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            return;
          }
          setQuery("");
          setIsOpen((current) => !current);
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Utensils className="size-4 shrink-0 text-slate-500" aria-hidden />
          <span className="truncate font-bold text-slate-950">
            {selectedItem.name}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-500" aria-hidden />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 z-30 mt-1 border border-slate-400 bg-white shadow-lg">
          <div className="border-b border-slate-200 p-2">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-600">
              <Filter className="size-4" aria-hidden />
              <span>Фільтр каталогу</span>
            </div>
            <div className="grid gap-1 sm:grid-cols-3">
              <CatalogFilterButton
                active={filter === "dish_cards"}
                onClick={() => setFilter("dish_cards")}
              >
                Тільки страви
              </CatalogFilterButton>
              <CatalogFilterButton
                active={filter === "products"}
                onClick={() => setFilter("products")}
              >
                Пром. вироб.
              </CatalogFilterButton>
              <CatalogFilterButton
                active={filter === "all"}
                onClick={() => setFilter("all")}
              >
                Усі
              </CatalogFilterButton>
            </div>
          </div>
          <div className="flex items-center gap-2 p-1">
            <input
              autoFocus
              type="search"
              className="nf-input pl-8"
              placeholder="Пошук за назвою або номером ТК"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1" role="listbox">
            {isPending ? (
              <p className="px-3 py-5 text-center text-sm text-slate-500">
                Завантажуємо каталог…
              </p>
            ) : null}
            {hasError ? (
              <p className="px-3 py-5 text-center text-sm text-red-700">
                Не вдалося завантажити каталог.
              </p>
            ) : null}
            {visibleDishCards.length ? (
              <CatalogSectionTitle>Страви з ТК</CatalogSectionTitle>
            ) : null}
            {visibleDishCards.map((dishCard) => {
              const isSelected = selectedItem.dish_card_id === dishCard.id;
              const canSelect = Boolean(dishCard.current_version_id);

              return (
                <button
                  key={`dish-card:${dishCard.id}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={!canSelect}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  onClick={() => {
                    if (!canSelect) {
                      return;
                    }
                    onSelect({ kind: "dish_card", dishCard });
                    setIsOpen(false);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {dishCard.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      ТК № {dishCard.card_number}
                      {dishCard.current_version_id
                        ? ""
                        : " · немає підтвердженої версії"}
                    </span>
                  </span>
                  {isSelected ? (
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                  ) : null}
                </button>
              );
            })}
            {visibleIngredients.length ? (
              <CatalogSectionTitle>Інгредієнти / пром. вироб.</CatalogSectionTitle>
            ) : null}
            {visibleIngredients.map((ingredient) => {
              const isSelected =
                selectedItem.kind === "product" &&
                selectedItem.product_ingredient_id === ingredient.id;

              return (
                <button
                  key={`ingredient:${ingredient.id}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-slate-100"
                  onClick={() => {
                    onSelect({ kind: "product", ingredient });
                    setIsOpen(false);
                  }}
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <Package
                      className="mt-0.5 size-4 shrink-0 text-slate-500"
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-900">
                        {ingredient.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        пром. вироб. · одиниця: {ingredient.unit}
                      </span>
                    </span>
                  </span>
                  {isSelected ? (
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                  ) : null}
                </button>
              );
            })}
            {!isPending && !hasError && resultCount === 0 ? (
              <p className="px-3 py-5 text-center text-sm text-slate-500">
                За цим запитом нічого не знайдено.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CatalogFilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`border px-2 py-1.5 text-xs font-bold ${
        active
          ? "border-(--nf-brand) bg-emerald-50 text-emerald-900"
          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function CatalogSectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="border-y border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
      {children}
    </p>
  );
}

function NutritionSummary({ portions }: { portions: MenuPortion[] }) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
        КБЖВ
      </p>
      <div className="mt-1.5 space-y-1">
        {portions.map((portion) => (
          <div
            key={portion.age_group}
            className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs"
          >
            <span className="font-bold text-slate-700">
              {AGE_GROUP_LABELS[portion.age_group]}
            </span>
            <span className="tabular-nums text-slate-600">
              {displayNutrition(portion)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function buildDishCardReplacement(
  currentItem: DailyMenuItem,
  dishCard: DishCard,
  version: DishCardVersion,
): DailyMenuItem {
  return {
    ...currentItem,
    kind: "dish_card",
    source_text: dishCard.source ?? null,
    recipe_card_number: dishCard.card_number,
    dish_card_id: dishCard.id,
    dish_card_version_id: version.id,
    product_ingredient_id: null,
    product_name_snapshot: null,
    name: dishCard.name,
    allergen_codes: [],
    portions: currentItem.portions.map((portion) =>
      buildDishCardPortion(portion, version.portion_variants),
    ),
  };
}

function buildDishCardPortion(
  portion: MenuPortion,
  variants: PortionVariant[],
): MenuPortion {
  const variant = findPortionVariant(portion, variants);

  return {
    ...portion,
    yield_amount: variant?.output_grams ?? portion.yield_amount,
    dish_card_portion_variant_id: variant?.id ?? null,
    nutrition: {
      kcal: variant?.nutrition.kcal ?? null,
      proteins: variant?.nutrition.proteins ?? null,
      fats: variant?.nutrition.fats ?? null,
      carbs: variant?.nutrition.carbs ?? null,
    },
  };
}

export function buildProductMenuItem(
  currentItem: DailyMenuItem,
  ingredient: Ingredient,
): DailyMenuItem {
  return {
    ...currentItem,
    kind: "product",
    source_text: "пром. вироб.",
    recipe_card_number: null,
    dish_card_id: null,
    dish_card_version_id: null,
    product_ingredient_id: ingredient.id,
    product_name_snapshot: ingredient.name,
    name: ingredient.name,
    allergen_codes: [],
    portions: currentItem.portions.map((portion) => ({
      ...portion,
      dish_card_portion_variant_id: null,
      nutrition: {
        kcal: null,
        proteins: null,
        fats: null,
        carbs: null,
      },
    })),
  };
}

function findPortionVariant(
  portion: MenuPortion,
  variants: PortionVariant[],
): PortionVariant | undefined {
  const targetYield = normalizeGramAmount(portion.yield_amount);
  const byYield = targetYield
    ? variants.find(
        (variant) =>
          normalizeGramAmount(variant.output_grams) === targetYield ||
          normalizeGramAmount(variant.portion_grams) === targetYield,
      )
    : undefined;

  return (
    byYield ??
    variants.find((variant) => variant.age_group === portion.age_group) ??
    variants[0]
  );
}

function getTechnicalCardLabel(item: DailyMenuItem): string {
  return item.recipe_card_number
    ? `ТК № ${item.recipe_card_number}`
    : item.source_text?.trim() || "ТК не вказана";
}

function displayNutrition(portion: MenuPortion): string {
  const nutrition = portion.nutrition;
  return [
    `${nutrition.kcal ?? "—"} ккал`,
    `Б ${nutrition.proteins ?? "—"}`,
    `Ж ${nutrition.fats ?? "—"}`,
    `В ${nutrition.carbs ?? "—"}`,
  ].join(" · ");
}

function normalizeChildrenCount(value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.min(Math.floor(parsed), 9999);
}

export function sortDays(days: DailyMenu[]): DailyMenu[] {
  return [...days].sort(
    (left, right) =>
      WEEKDAY_ORDER.indexOf(left.weekday) -
      WEEKDAY_ORDER.indexOf(right.weekday),
  );
}

export function buildDailyMenuUpdatePayload(
  days: DailyMenu[],
  serverDays: DailyMenu[] = [],
): WeeklyMenuUpdatePayload {
  const serverDayByWeekday = new Map(
    serverDays.map((day) => [day.weekday, day] as const),
  );

  return {
    days: sortDays(days).map((localDay) => {
      const day =
        localDay.closed_at && serverDayByWeekday.has(localDay.weekday)
          ? serverDayByWeekday.get(localDay.weekday)!
          : localDay;

      return {
        weekday: day.weekday,
        date: day.date,
        notes: day.notes,
        items: [...day.items]
          .sort((left, right) => left.position - right.position)
          .map((item) => ({
            id: item.id,
            position: item.position,
            kind: item.kind,
            source_text: item.source_text,
            recipe_card_number: item.recipe_card_number,
            dish_card_id: item.dish_card_id,
            dish_card_version_id: item.dish_card_version_id,
            product_ingredient_id: item.product_ingredient_id,
            product_name_snapshot: item.product_name_snapshot,
            name: item.name,
            allergen_codes: item.allergen_codes,
            portions: item.portions,
            servings: item.servings,
            notes: item.notes,
          })),
      };
    }),
  };
}

export function resolveDayDate(menu: WeeklyMenu, day: DailyMenu): string {
  return resolveEffectiveDayDate(
    menu.starts_on,
    WEEKDAY_ORDER.indexOf(day.weekday),
    day.date,
  );
}

export function formatMenuDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}
function formatFullMenuDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}
