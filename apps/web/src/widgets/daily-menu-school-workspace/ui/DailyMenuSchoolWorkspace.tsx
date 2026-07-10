"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileSpreadsheet,
  Filter,
  Package,
  Save,
  Utensils,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  dishCardVersionQueryOptions,
  useDishCards,
  useIngredients,
} from "@/entities/recipe/api/RecipeQueries";
import type {
  DishCard,
  DishCardVersion,
  Ingredient,
  PortionVariant,
} from "@/entities/recipe/model/Recipe";
import { useOwnSchoolGroups } from "@/entities/school-group/api/SchoolGroupQueries";
import type { SchoolGroup } from "@/entities/school-group/model/SchoolGroup";
import {
  useWeeklyMenu,
  useWeeklyMenus,
} from "@/entities/weekly-menu/api/WeeklyMenuQueries";
import type {
  DailyMenu,
  DailyMenuItem,
  MenuPortion,
  WeeklyMenu,
  WeeklyMenuUpdatePayload,
} from "@/entities/weekly-menu/model/WeeklyMenu";
import {
  clearDailyMenuDraft,
  loadDailyMenuDraft,
  prepareDailyMenuDays,
  saveDailyMenuDraft,
} from "@/features/daily-menu/model/DailyMenuDraftStorage";
import { useGenerateMenuRequirements } from "@/features/menu-requirement-generation/model/UseGenerateMenuRequirements";
import { useUpdateWeeklyMenu } from "@/features/weekly-menu-editor/model/UseWeeklyMenuMutations";
import {
  AGE_GROUP_LABELS,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  resolveEffectiveDayDate,
} from "@/features/weekly-menu-editor/model/WeeklyMenuFormSchema";
import { getApiErrorMessage } from "@/shared/api/HttpClient";
import { formatDate } from "@/shared/lib/FormatDate";
import { useConfirm } from "@/shared/ui/ConfirmDialog";
import { RequestError } from "@/shared/ui/RequestError";

type CatalogFilter = "dish_cards" | "products" | "all";

type CatalogSelection =
  | {
      kind: "dish_card";
      dishCard: DishCard;
    }
  | {
      kind: "product";
      ingredient: Ingredient;
    };

export function DailyMenuSchoolWorkspace() {
  const confirm = useConfirm();
  const router = useRouter();
  const queryClient = useQueryClient();
  const menus = useWeeklyMenus({
    offset: 0,
    limit: 100,
    status: "published",
  });
  const groups = useOwnSchoolGroups({ offset: 0, limit: 100 });
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const effectiveMenuId = selectedMenuId ?? menus.data?.items[0]?.id ?? "";
  const selectedMenu = useWeeklyMenu(effectiveMenuId);
  const updateWeeklyMenu = useUpdateWeeklyMenu(effectiveMenuId);
  const generateMenuRequirements = useGenerateMenuRequirements();
  const [days, setDays] = useState<DailyMenu[]>([]);
  const [activeWeekday, setActiveWeekday] = useState<
    DailyMenu["weekday"] | null
  >(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const initializedMenuKey = useRef<string | null>(null);

  const activeGroups = useMemo(
    () => groups.data?.items.filter((group) => group.is_active) ?? [],
    [groups.data?.items],
  );

  useEffect(() => {
    const menu = selectedMenu.data;

    if (!menu || !groups.data) {
      return;
    }

    const menuKey = `${menu.id}:${menu.updated_at}`;

    if (initializedMenuKey.current === menuKey) {
      return;
    }

    const draft = loadDailyMenuDraft(menu.id, menu.updated_at);
    const nextDays = prepareDailyMenuDays(
      draft?.days ?? sortDays(menu.days),
      activeGroups,
    );

    initializedMenuKey.current = menuKey;
    setDays(nextDays);
    setActiveWeekday(nextDays[0]?.weekday ?? null);
    setSavedAt(draft?.savedAt ?? null);
    setIsDirty(false);
  }, [activeGroups, groups.data, selectedMenu.data]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const warnAboutUnsavedChanges = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warnAboutUnsavedChanges);
    return () =>
      window.removeEventListener("beforeunload", warnAboutUnsavedChanges);
  }, [isDirty]);

  const activeDay = days.find((day) => day.weekday === activeWeekday) ?? null;
  const canGenerateActiveDay =
    activeDay?.items.some((item) =>
      item.servings.some((serving) => serving.children_count > 0),
    ) ?? false;
  const changeMenu = async (menuId: string) => {
    if (isDirty) {
      const confirmed = await confirm({
        title: "Перейти без збереження?",
        description:
          "Є незбережені зміни. Якщо перейти до іншого меню, поточні правки залишаться тільки в локальній чернетці.",
        confirmLabel: "Перейти",
      });

      if (!confirmed) {
        return;
      }
    }

    initializedMenuKey.current = null;
    setSelectedMenuId(menuId);
  };

  const changeDish = async (itemId: string, selectedItem: CatalogSelection) => {
    if (!activeDay) {
      return;
    }

    const currentItem = activeDay.items.find((item) => item.id === itemId);

    if (!currentItem) {
      return;
    }

    const nextItem =
      selectedItem.kind === "product"
        ? buildProductMenuItem(currentItem, selectedItem.ingredient)
        : await buildDishCardMenuItem(currentItem, selectedItem.dishCard);

    if (!nextItem) {
      return;
    }

    setDays((currentDays) =>
      currentDays.map((day) =>
        day.weekday !== activeDay.weekday
          ? day
          : {
              ...day,
              items: day.items.map((item) =>
                item.id === itemId ? nextItem : item,
              ),
            },
      ),
    );
    setIsDirty(true);
  };

  const buildDishCardMenuItem = async (
    currentItem: DailyMenuItem,
    dishCard: DishCard,
  ): Promise<DailyMenuItem | null> => {
    if (!dishCard.current_version_id) {
      toast.error("У цієї техкарти немає підтвердженої поточної версії.");
      return null;
    }

    try {
      const version = await queryClient.ensureQueryData(
        dishCardVersionQueryOptions(dishCard.current_version_id),
      );

      if (version.status !== "confirmed" && version.status !== "archived") {
        toast.error("Поточна версія техкарти ще не підтверджена.");
        return null;
      }

      return buildDishCardReplacement(currentItem, dishCard, version);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      return null;
    }
  };

  const changeChildrenCount = (
    itemId: string,
    group: SchoolGroup,
    childrenCount: number,
  ) => {
    if (!activeDay) {
      return;
    }

    setDays((currentDays) =>
      currentDays.map((day) =>
        day.weekday !== activeDay.weekday
          ? day
          : {
              ...day,
              items: day.items.map((item) =>
                item.id !== itemId
                  ? item
                  : {
                      ...item,
                      servings: item.servings.map((serving) =>
                        serving.school_group_id === group.id
                          ? { ...serving, children_count: childrenCount }
                          : serving,
                      ),
                    },
              ),
            },
      ),
    );
    setIsDirty(true);
  };

  const saveChanges = async (): Promise<WeeklyMenu | null> => {
    const menu = selectedMenu.data;

    if (!menu) {
      return null;
    }

    const localSavedAt = saveDailyMenuDraft(menu.id, menu.updated_at, days);

    try {
      const updatedMenu = await updateWeeklyMenu.mutateAsync(
        buildDailyMenuUpdatePayload(days),
      );
      clearDailyMenuDraft(menu.id);
      initializedMenuKey.current = `${updatedMenu.id}:${updatedMenu.updated_at}`;
      setDays(prepareDailyMenuDays(sortDays(updatedMenu.days), activeGroups));
      setSavedAt(updatedMenu.updated_at);
      setIsDirty(false);
      toast.success(
        "Зміни збережено. Якщо страву замінено, технолог отримав повідомлення.",
      );
      return updatedMenu;
    } catch (error) {
      setSavedAt(localSavedAt);
      toast.error(getApiErrorMessage(error));
      return null;
    }
  };

  const generateRequirement = async () => {
    const menu = selectedMenu.data;

    if (!menu || !activeDay || !canGenerateActiveDay) {
      return;
    }
    if (isDirty && !(await saveChanges())) {
      return;
    }

    try {
      const response = await generateMenuRequirements.mutateAsync({
        weekly_menu_id: menu.id,
        weekday: activeDay.weekday,
        service_date: resolveDayDate(menu, activeDay),
      });
      const groupsCount = response.items.length;
      toast.success(
        groupsCount === 1
          ? "Меню-вимогу сформовано."
          : `Сформовано меню-вимоги для ${groupsCount} груп.`,
      );
      router.push("/menu-requirements");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <main className="nf-page nf-page-wide">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Облік харчування</p>
        <h1 className="nf-title">Денне меню</h1>
        <p className="nf-description">
          Оберіть день, за потреби замініть страви та вкажіть кількість дітей,
          які поїли кожну страву.
        </p>
      </header>

      <section
        className={`mb-5 border px-4 py-3 ${
          isDirty
            ? "border-amber-400 bg-amber-50 text-amber-950"
            : "border-slate-300 bg-slate-50 text-slate-700"
        }`}
        role="status"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {isDirty ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <div>
              <p className="text-sm font-bold">
                {isDirty
                  ? "Є незбережені зміни"
                  : savedAt
                    ? "Усі зміни збережено"
                    : "Зміни ще не зберігалися"}
              </p>
              <p className="mt-0.5 text-xs">
                Збереження не виконується автоматично. Кількість дітей
                оновлюється без повідомлення технологу, а заміна страви
                потрапляє у його окрему вкладку.
                {savedAt ? ` Останнє збереження: ${formatDate(savedAt)}.` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="nf-button nf-button-secondary shrink-0"
              onClick={() => void saveChanges()}
              disabled={
                !selectedMenu.data ||
                !days.length ||
                updateWeeklyMenu.isPending ||
                generateMenuRequirements.isPending
              }
            >
              <Save className="size-4" aria-hidden />
              {updateWeeklyMenu.isPending ? "Зберігаємо…" : "Зберегти зміни"}
            </button>
            <button
              type="button"
              className="nf-button nf-button-primary shrink-0"
              onClick={() => void generateRequirement()}
              disabled={
                !selectedMenu.data ||
                !activeDay ||
                !canGenerateActiveDay ||
                updateWeeklyMenu.isPending ||
                generateMenuRequirements.isPending
              }
              title={
                canGenerateActiveDay
                  ? undefined
                  : "Вкажіть кількість дітей більше нуля хоча б для однієї страви"
              }
            >
              <FileSpreadsheet className="size-4" aria-hidden />
              {generateMenuRequirements.isPending
                ? "Формуємо…"
                : "Сформувати меню-вимогу"}
            </button>
          </div>
        </div>
      </section>

      {menus.isError ? (
        <RequestError
          error={menus.error}
          onRetry={() => void menus.refetch()}
        />
      ) : null}
      {groups.isError ? (
        <div className="mb-5">
          <RequestError
            error={groups.error}
            onRetry={() => void groups.refetch()}
          />
        </div>
      ) : null}

      {menus.isPending || (effectiveMenuId && selectedMenu.isPending) ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <p role="status" className="text-sm text-slate-600">
              Завантажуємо денне меню…
            </p>
          </div>
        </section>
      ) : null}

      {menus.data?.items.length === 0 ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <div className="nf-empty">
              Денне меню з’явиться після публікації тижневого меню.
            </div>
          </div>
        </section>
      ) : null}

      {selectedMenu.data && days.length ? (
        <div className="space-y-5">
          <section className="nf-panel">
            <div className="nf-panel-body flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-60 flex-1">
                <label htmlFor="daily-menu-source" className="nf-label">
                  Тижневе меню
                </label>
                <select
                  id="daily-menu-source"
                  className="nf-input max-w-xl"
                  value={effectiveMenuId}
                  onChange={(event) => void changeMenu(event.target.value)}
                >
                  {menus.data?.items.map((menu) => (
                    <option key={menu.id} value={menu.id}>
                      {menu.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-slate-600">
                {selectedMenu.data.meal_type === "lunch" ? "Обід" : "Сніданок"}
                {selectedMenu.data.cycle_week
                  ? ` · цикл ${selectedMenu.data.cycle_week}`
                  : ""}
              </div>
            </div>
          </section>

          <div
            className="nf-tabs overflow-x-auto"
            role="tablist"
            aria-label="Дні тижневого меню"
          >
            {days.map((day) => {
              const isActive = day.weekday === activeDay?.weekday;

              return (
                <button
                  key={day.weekday}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`nf-tab shrink-0 ${isActive ? "nf-tab-active" : ""}`}
                  onClick={() => setActiveWeekday(day.weekday)}
                >
                  {WEEKDAY_LABELS[day.weekday]}
                  <span className="ml-2 font-normal text-slate-500">
                    {formatMenuDate(resolveDayDate(selectedMenu.data, day))}
                  </span>
                </button>
              );
            })}
          </div>

          {activeGroups.length === 0 && !groups.isPending ? (
            <div className="border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Немає активних груп. Додайте або активуйте групи, щоб вести
              кількість дітей.
            </div>
          ) : null}

          {activeDay ? (
            <DayMenuPanel
              day={activeDay}
              displayDate={resolveDayDate(selectedMenu.data, activeDay)}
              groups={activeGroups}
              onDishChange={changeDish}
              onChildrenCountChange={changeChildrenCount}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

function DayMenuPanel({
  day,
  displayDate,
  groups,
  onDishChange,
  onChildrenCountChange,
}: {
  day: DailyMenu;
  displayDate: string;
  groups: SchoolGroup[];
  onDishChange: (itemId: string, item: CatalogSelection) => Promise<void>;
  onChildrenCountChange: (
    itemId: string,
    group: SchoolGroup,
    childrenCount: number,
  ) => void;
}) {
  return (
    <section className="nf-panel">
      <div className="nf-panel-header">
        <div>
          <p className="nf-eyebrow">Обраний день</p>
          <h2 className="nf-panel-title">
            {WEEKDAY_LABELS[day.weekday]} · {formatFullMenuDate(displayDate)}
          </h2>
        </div>
        <span className="text-xs font-bold text-slate-600">
          {day.items.length} страв
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
              onDishChange={(selectedItem) =>
                void onDishChange(item.id, selectedItem)
              }
              onChildrenCountChange={(group, count) =>
                onChildrenCountChange(item.id, group, count)
              }
            />
          ))}
      </div>
      <div className="border-t border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950">
        <strong>Важливо:</strong> після заповнення цього дня натисніть «Зберегти
        зміни» вгорі сторінки.
      </div>
    </section>
  );
}

function DishRow({
  item,
  groups,
  onDishChange,
  onChildrenCountChange,
}: {
  item: DailyMenuItem;
  groups: SchoolGroup[];
  onDishChange: (item: CatalogSelection) => void;
  onChildrenCountChange: (group: SchoolGroup, count: number) => void;
}) {
  return (
    <article className="grid gap-5 bg-white p-4 lg:grid-cols-[minmax(280px,1.1fr)_minmax(360px,1fr)]">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
          <span className="flex size-6 items-center justify-center border border-slate-300 bg-slate-50 tabular-nums">
            {item.position}
          </span>
          <span>Страва</span>
        </div>
        <DishPicker
          selectedItem={item}
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
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className="nf-input mt-2 text-right font-bold tabular-nums"
                  aria-label={`${group.name}: кількість дітей для страви ${item.name}`}
                  value={count}
                  onChange={(event) =>
                    onChildrenCountChange(
                      group,
                      normalizeChildrenCount(event.target.value),
                    )
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

function DishPicker({
  selectedItem,
  onSelect,
}: {
  selectedItem: DailyMenuItem;
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
        className="flex min-h-11 w-full items-center justify-between gap-3 border border-slate-400 bg-white px-3 py-2 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-(--nf-brand)"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
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

function buildDishCardReplacement(
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

function buildProductMenuItem(
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

function normalizeGramAmount(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const numeric = Number(value.trim().replace(",", "."));

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return `${numeric}`;
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

function sortDays(days: DailyMenu[]): DailyMenu[] {
  return [...days].sort(
    (left, right) =>
      WEEKDAY_ORDER.indexOf(left.weekday) -
      WEEKDAY_ORDER.indexOf(right.weekday),
  );
}

function buildDailyMenuUpdatePayload(
  days: DailyMenu[],
): WeeklyMenuUpdatePayload {
  return {
    days: sortDays(days).map((day) => ({
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
    })),
  };
}

function resolveDayDate(menu: WeeklyMenu, day: DailyMenu): string {
  return resolveEffectiveDayDate(
    menu.starts_on,
    WEEKDAY_ORDER.indexOf(day.weekday),
    day.date,
  );
}

function formatMenuDate(value: string): string {
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
