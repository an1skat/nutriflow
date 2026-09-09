'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { Check, ChevronDown, Filter, Package, Trash2, Utensils } from 'lucide-react';

import { useDishCards, useIngredients } from '@/entities/recipe/api/RecipeQueries';
import type {
  DishCard,
  DishCardVersion,
  Ingredient,
  PortionVariant,
} from '@/entities/recipe/model/Recipe';
import type { SchoolGroup } from '@/entities/school-group/model/SchoolGroup';
import type {
  DailyMenu,
  DailyMenuItem,
  MenuPortion,
  WeeklyMenu,
  WeeklyMenuUpdatePayload,
} from '@/entities/weekly-menu/model/WeeklyMenu';
import {
  AGE_GROUP_LABELS,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
} from '@/entities/weekly-menu/model/WeeklyMenu';
import { resolveEffectiveDayDate } from '@/features/weekly-menu-editor/model/WeeklyMenuFormSchema';
import { normalizeGramAmount } from '@/shared/lib/Portion';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';

export type CatalogFilter = 'dish_cards' | 'products' | 'all';

export type CatalogSelection =
  | {
      kind: 'dish_card';
      dishCard: DishCard;
    }
  | {
      kind: 'product';
      ingredient: Ingredient;
    };

const UNSAVED_ITEM_ID_PREFIX = 'new:';

export function DayMenuPanel({
  day,
  displayDate,
  groups,
  readOnly,
  onDishChange,
  onAddItem,
  onRemoveItem,
  onPortionYieldChange,
  onChildrenCountChange,
}: {
  day: DailyMenu;
  displayDate: string;
  groups: SchoolGroup[];
  readOnly: boolean;
  onDishChange: (itemId: string, item: CatalogSelection) => Promise<void>;
  onAddItem: (item: CatalogSelection) => Promise<void>;
  onRemoveItem: (itemId: string) => void;
  onPortionYieldChange: (itemId: string, portionIndex: number, value: string) => void;
  onChildrenCountChange: (group: SchoolGroup, childrenCount: number) => void;
}) {
  const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);

  return (
    <section className={`nf-panel ${readOnly ? 'border-slate-300 bg-slate-100' : ''}`}>
      <div className="nf-panel-header">
        <div>
          <p className="nf-eyebrow">Обраний день</p>
          <h2 className="nf-panel-title">
            {WEEKDAY_LABELS[day.weekday]} · {formatFullMenuDate(displayDate)}
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-xs font-bold text-slate-600">
            {readOnly ? 'Закрито' : `${day.items.length} страв`}
          </span>
          {!readOnly ? (
            <button
              type="button"
              className="nf-button nf-button-secondary"
              onClick={() => setIsAddPickerOpen((current) => !current)}
            >
              + Додати позицію
            </button>
          ) : null}
        </div>
      </div>
      {isAddPickerOpen && !readOnly ? (
        <div className="border-b border-slate-200 bg-emerald-50/50 p-4">
          <p className="mb-2 text-sm font-bold text-slate-800">Оберіть нову позицію</p>
          <DishPicker
            selectedItem={null}
            disabled={false}
            onSelect={(item) => {
              void onAddItem(item);
              setIsAddPickerOpen(false);
            }}
          />
        </div>
      ) : null}
      {day.notes ? (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {day.notes}
        </div>
      ) : null}
      <section className="border-b border-slate-200 bg-slate-50 p-4">
        <div className="mb-3">
          <p className="text-sm font-bold text-slate-800">Кількість дітей за групами</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Це значення буде застосовано до кожної страви дня.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <div
              key={group.id}
              className="flex items-center justify-between gap-3 border border-slate-200 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{group.name}</p>
                <p className="text-[11px] text-slate-500">{AGE_GROUP_LABELS[group.age_group]}</p>
              </div>
              <ChildrenCountInput
                aria-label={`${group.name}: кількість дітей`}
                count={getGroupChildrenCount(day, group.id)}
                disabled={readOnly}
                onChange={(count) => onChildrenCountChange(group, count)}
              />
            </div>
          ))}
        </div>
      </section>
      <div className="divide-y divide-slate-200">
        {[...day.items]
          .sort((left, right) => left.position - right.position)
          .map((item) => (
            <DishRow
              key={item.id}
              item={item}
              readOnly={readOnly}
              onDishChange={(selectedItem) => void onDishChange(item.id, selectedItem)}
              onRemove={isSchoolAddedDailyMenuItem(item) ? () => onRemoveItem(item.id) : undefined}
              onPortionYieldChange={
                isSchoolAddedDailyMenuItem(item)
                  ? (portionIndex, value) => onPortionYieldChange(item.id, portionIndex, value)
                  : undefined
              }
            />
          ))}
      </div>
      <div
        className={`border-t px-4 py-3 text-xs ${
          readOnly
            ? 'border-slate-300 bg-slate-100 text-slate-600'
            : 'border-amber-300 bg-amber-50 text-amber-950'
        }`}
      >
        {readOnly ? (
          'День закрито. Дані зафіксовані за останнім збереженим станом.'
        ) : (
          <>
            <strong>Важливо:</strong> перед закриттям дня зміни буде збережено автоматично.
          </>
        )}
      </div>
    </section>
  );
}

function DishRow({
  item,
  readOnly,
  onDishChange,
  onRemove,
  onPortionYieldChange,
}: {
  item: DailyMenuItem;
  readOnly: boolean;
  onDishChange: (item: CatalogSelection) => void;
  onRemove?: () => void;
  onPortionYieldChange?: (portionIndex: number, value: string) => void;
}) {
  const isSchoolAdded = isSchoolAddedDailyMenuItem(item);

  return (
    <article className={`p-4 ${readOnly ? 'bg-slate-100 text-slate-500' : 'bg-white'}`}>
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span className="flex size-6 items-center justify-center border border-slate-300 bg-slate-50 tabular-nums">
              {item.position}
            </span>
            <span>{isSchoolAdded ? 'Нова позиція' : 'Страва'}</span>
          </div>
          {onRemove && !readOnly ? (
            <button
              type="button"
              className="nf-button nf-button-ghost min-h-9 px-2 text-red-700"
              aria-label={`Видалити нову позицію ${item.name}`}
              onClick={onRemove}
            >
              <Trash2 className="size-4" aria-hidden />
              Видалити
            </button>
          ) : null}
        </div>
        <DishPicker selectedItem={item} disabled={readOnly} onSelect={onDishChange} />
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(140px,0.55fr)_1fr]">
          <div className="border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Техкарта</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{getTechnicalCardLabel(item)}</p>
          </div>
          <NutritionSummary
            portions={item.portions}
            onYieldChange={readOnly ? undefined : onPortionYieldChange}
          />
        </div>
      </div>
    </article>
  );
}

function ChildrenCountInput({
  count,
  disabled,
  onChange,
  'aria-label': ariaLabel,
}: {
  count: number | null;
  disabled: boolean;
  onChange: (count: number) => void;
  'aria-label': string;
}) {
  return (
    <div className="flex shrink-0 items-center border border-slate-300 bg-white">
      <button
        type="button"
        className="flex size-9 items-center justify-center text-lg font-bold text-slate-700 hover:bg-slate-100 disabled:text-slate-300"
        aria-label={`${ariaLabel}: зменшити`}
        disabled={disabled || !count}
        onClick={() => onChange(Math.max(0, (count ?? 0) - 1))}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className="h-9 w-16 border-x border-slate-300 text-center text-sm font-bold tabular-nums outline-none disabled:bg-slate-100"
        aria-label={ariaLabel}
        value={count ?? ''}
        placeholder={count === null ? '—' : undefined}
        disabled={disabled}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => onChange(normalizeChildrenCount(event.target.value))}
      />
      <button
        type="button"
        className="flex size-9 items-center justify-center text-lg font-bold text-slate-700 hover:bg-slate-100 disabled:text-slate-300"
        aria-label={`${ariaLabel}: збільшити`}
        disabled={disabled || count === 100000}
        onClick={() => onChange(Math.min(100000, (count ?? 0) + 1))}
      >
        +
      </button>
    </div>
  );
}

function getGroupChildrenCount(day: DailyMenu, schoolGroupId: string): number | null {
  const counts = day.items.map(
    (item) =>
      item.servings.find((serving) => serving.school_group_id === schoolGroupId)?.children_count ??
      0
  );

  return counts.every((count) => count === counts[0]) ? (counts[0] ?? 0) : null;
}

function DishPicker({
  selectedItem,
  disabled,
  onSelect,
}: {
  selectedItem: DailyMenuItem | null;
  disabled: boolean;
  onSelect: (item: CatalogSelection) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CatalogFilter>('dish_cards');
  const pickerRef = useRef<HTMLDivElement>(null);
  const shouldLoadDishCards = isOpen && filter !== 'products';
  const shouldLoadIngredients = isOpen && filter !== 'dish_cards';
  const dishCards = useDishCards(query, shouldLoadDishCards);
  const ingredients = useIngredients(query, shouldLoadIngredients);
  const visibleDishCards = shouldLoadDishCards ? (dishCards.data?.items ?? []) : [];
  const visibleIngredients = shouldLoadIngredients ? (ingredients.data?.items ?? []) : [];
  const isPending =
    (shouldLoadDishCards && dishCards.isPending) ||
    (shouldLoadIngredients && ingredients.isPending);
  const hasError =
    (shouldLoadDishCards && dishCards.isError) || (shouldLoadIngredients && ingredients.isError);
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

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
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
          setQuery('');
          setIsOpen((current) => !current);
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Utensils className="size-4 shrink-0 text-slate-500" aria-hidden />
          <span className="truncate font-bold text-slate-950">
            {selectedItem?.name ?? 'Оберіть техкарту або продукт'}
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
                active={filter === 'dish_cards'}
                onClick={() => setFilter('dish_cards')}
              >
                Тільки страви
              </CatalogFilterButton>
              <CatalogFilterButton
                active={filter === 'products'}
                onClick={() => setFilter('products')}
              >
                Пром. вироб.
              </CatalogFilterButton>
              <CatalogFilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
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
              <div className="px-3 py-5 text-center">
                <LoadingSpinner label="Завантажуємо каталог…" />
              </div>
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
              const isSelected = selectedItem?.dish_card_id === dishCard.id;
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
                    onSelect({ kind: 'dish_card', dishCard });
                    setIsOpen(false);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {dishCard.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      ТК № {dishCard.card_number}
                      {dishCard.current_version_id ? '' : ' · немає підтвердженої версії'}
                    </span>
                  </span>
                  {isSelected ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
                </button>
              );
            })}
            {visibleIngredients.length ? (
              <CatalogSectionTitle>Інгредієнти / пром. вироб.</CatalogSectionTitle>
            ) : null}
            {visibleIngredients.map((ingredient) => {
              const isSelected =
                selectedItem?.kind === 'product' &&
                selectedItem.product_ingredient_id === ingredient.id;

              return (
                <button
                  key={`ingredient:${ingredient.id}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-slate-100"
                  onClick={() => {
                    onSelect({ kind: 'product', ingredient });
                    setIsOpen(false);
                  }}
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <Package className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-900">
                        {ingredient.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        пром. вироб. · одиниця: {ingredient.unit}
                      </span>
                    </span>
                  </span>
                  {isSelected ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
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
          ? 'border-(--nf-brand) bg-emerald-50 text-emerald-900'
          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
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

function NutritionSummary({
  portions,
  onYieldChange,
}: {
  portions: MenuPortion[];
  onYieldChange?: (portionIndex: number, value: string) => void;
}) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">КБЖВ</p>
      <div className="mt-1.5 space-y-1">
        {portions.map((portion, portionIndex) => (
          <div
            key={portion.age_group}
            className="flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <span className="font-bold text-slate-700">{AGE_GROUP_LABELS[portion.age_group]}</span>
            <span className="flex flex-wrap items-center justify-end gap-2 tabular-nums text-slate-600">
              {onYieldChange ? (
                <label className="flex items-center gap-1">
                  <span>Вихід</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="nf-input h-8 w-20 px-2 py-1"
                    aria-label={`Вихід для ${AGE_GROUP_LABELS[portion.age_group]}`}
                    value={portion.yield_amount}
                    onChange={(event) => onYieldChange(portionIndex, event.target.value)}
                  />
                </label>
              ) : (
                `${portion.yield_amount} г`
              )}
              <span>{displayNutrition(portion)}</span>
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
  version: DishCardVersion
): DailyMenuItem {
  return {
    ...currentItem,
    kind: 'dish_card',
    source_text: dishCard.source ?? null,
    recipe_card_number: dishCard.card_number,
    dish_card_id: dishCard.id,
    dish_card_version_id: version.id,
    product_ingredient_id: null,
    product_name_snapshot: null,
    name: dishCard.name,
    allergen_codes: [],
    portions: currentItem.portions.map((portion) =>
      buildDishCardPortion(portion, version.portion_variants)
    ),
  };
}

function buildDishCardPortion(portion: MenuPortion, variants: PortionVariant[]): MenuPortion {
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
  ingredient: Ingredient
): DailyMenuItem {
  return {
    ...currentItem,
    kind: 'product',
    source_text: 'пром. вироб.',
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

export function createNewDailyMenuItem(day: DailyMenu, groups: SchoolGroup[]): DailyMenuItem {
  const maxPosition = day.items.length > 0 ? Math.max(...day.items.map((item) => item.position)) : 0;
  const activeGroups = groups.filter((group) => group.is_active);
  const relevantGroups = activeGroups.length > 0 ? activeGroups : groups;

  const standardOrder: Array<'6-11' | '11-14' | '14-18'> = ['6-11', '11-14', '14-18'];
  const dayAgeGroups = day.items.flatMap((item) => item.portions.map((portion) => portion.age_group));
  const groupAgeGroups = relevantGroups.map((group) => group.age_group);
  const allAgeGroups = Array.from(new Set([...dayAgeGroups, ...groupAgeGroups]));
  const sortedAgeGroups = (allAgeGroups.length > 0 ? allAgeGroups : standardOrder).sort(
    (left, right) => standardOrder.indexOf(left) - standardOrder.indexOf(right)
  );

  return {
    id: `${UNSAVED_ITEM_ID_PREFIX}${crypto.randomUUID()}`,
    position: maxPosition + 1,
    kind: 'dish_card',
    source_text: null,
    recipe_card_number: null,
    dish_card_id: null,
    dish_card_version_id: null,
    product_ingredient_id: null,
    product_name_snapshot: null,
    name: 'Нова позиція',
    allergen_codes: [],
    portions: sortedAgeGroups.map((ageGroup) => ({
      age_group: ageGroup,
      yield_amount: '',
      dish_card_portion_variant_id: null,
      calculated_from: null,
      nutrition: { kcal: null, proteins: null, fats: null, carbs: null },
    })),
    servings: relevantGroups.map((group) => ({
      school_group_id: group.id,
      age_group: group.age_group,
      children_count: getGroupChildrenCount(day, group.id) ?? 0,
    })),
    notes: null,
    is_school_added: true,
    is_school_customized: false,
  };
}

export function isSchoolAddedDailyMenuItem(item: DailyMenuItem): boolean {
  return Boolean(item.is_school_added || isUnsavedDailyMenuItem(item));
}

export function isUnsavedDailyMenuItem(item: DailyMenuItem): boolean {
  return item.id.startsWith(UNSAVED_ITEM_ID_PREFIX);
}

export function resequenceDayItemPositions(day: DailyMenu): DailyMenu {
  const sortedItems = [...day.items].sort((left, right) => left.position - right.position);
  return {
    ...day,
    items: sortedItems.map((item, index) => ({
      ...item,
      position: index + 1,
    })),
  };
}

function findPortionVariant(
  portion: MenuPortion,
  variants: PortionVariant[]
): PortionVariant | undefined {
  const targetYield = normalizeGramAmount(portion.yield_amount);
  const byYield = targetYield
    ? variants.find(
        (variant) =>
          normalizeGramAmount(variant.output_grams) === targetYield ||
          normalizeGramAmount(variant.portion_grams) === targetYield
      )
    : undefined;

  return (
    byYield ?? variants.find((variant) => variant.age_group === portion.age_group) ?? variants[0]
  );
}

function getTechnicalCardLabel(item: DailyMenuItem): string {
  return item.recipe_card_number
    ? `ТК № ${item.recipe_card_number}`
    : item.source_text?.trim() || 'ТК не вказана';
}

function displayNutrition(portion: MenuPortion): string {
  const nutrition = portion.nutrition;
  return [
    `${nutrition.kcal ?? '—'} ккал`,
    `Б ${nutrition.proteins ?? '—'}`,
    `Ж ${nutrition.fats ?? '—'}`,
    `В ${nutrition.carbs ?? '—'}`,
  ].join(' · ');
}

function normalizeChildrenCount(value: string): number {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  return Math.min(Number(digits || 0), 100000);
}

export function sortDays(days: DailyMenu[]): DailyMenu[] {
  return [...days].sort(
    (left, right) => WEEKDAY_ORDER.indexOf(left.weekday) - WEEKDAY_ORDER.indexOf(right.weekday)
  );
}

export function buildDailyMenuUpdatePayload(
  days: DailyMenu[],
  serverDays: DailyMenu[] = []
): Omit<WeeklyMenuUpdatePayload, 'revision'> {
  const serverDayByWeekday = new Map(serverDays.map((day) => [day.weekday, day] as const));

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
            ...(isUnsavedDailyMenuItem(item) ? {} : { id: item.id }),
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
            is_school_added: Boolean(item.is_school_added),
            is_school_customized: Boolean(item.is_school_customized),
          })),
      };
    }),
  };
}

export function resolveDayDate(menu: WeeklyMenu, day: DailyMenu): string {
  return resolveEffectiveDayDate(menu.starts_on, WEEKDAY_ORDER.indexOf(day.weekday), day.date);
}

export function formatMenuDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}
function formatFullMenuDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
