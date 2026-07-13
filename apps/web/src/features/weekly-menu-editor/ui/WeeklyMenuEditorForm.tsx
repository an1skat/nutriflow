"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type UseFormReturn,
} from "react-hook-form";

import {
  allergensQueryOptions,
  dishCardQueryOptions,
  dishCardVersionQueryOptions,
  dishCardsQueryOptions,
  ingredientsQueryOptions,
} from "@/entities/recipe/api/RecipeQueries";
import type {
  Allergen,
  DishCard,
  DishCardVersion,
  Ingredient,
  PortionVariant,
} from "@/entities/recipe/model/Recipe";
import { getApiErrorMessage } from "@/shared/api/HttpClient";

import {
  AGE_GROUP_LABELS,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  createBlankDay,
  createBlankItem,
  getRemainingWeekdays,
  updateDayDate,
  resolveEffectiveDayDate,
  resolveEffectiveStartDate,
  weeklyMenuFormSchema,
  type WeeklyMenuFormValues,
} from "../model/WeeklyMenuFormSchema";

type WeeklyMenuEditorFormProps = {
  initialValues: WeeklyMenuFormValues;
  mode: "backoffice" | "school-readonly";
  submitLabel: string;
  saving: boolean;
  onSubmit: (values: WeeklyMenuFormValues) => Promise<void>;
  headerNote?: ReactNode;
  recipeCatalogEnabled?: boolean;
};

export function WeeklyMenuEditorForm({
  initialValues,
  mode,
  submitLabel,
  saving,
  onSubmit,
  headerNote,
  recipeCatalogEnabled = false,
}: WeeklyMenuEditorFormProps) {
  const allowStructureEdits = mode === "backoffice";
  const allowValueEdits = mode !== "school-readonly";
  const resolveReadonlyReferences = !allowValueEdits;
  const form = useForm<WeeklyMenuFormValues>({
    resolver: zodResolver(weeklyMenuFormSchema),
    defaultValues: initialValues,
  });
  const daysFieldArray = useFieldArray({
    control: form.control,
    name: "days",
  });
  const watchedDays = useWatch({
    control: form.control,
    name: "days",
  });
  const watchedStartDate = useWatch({
    control: form.control,
    name: "starts_on",
  });
  const allergens = useQuery({
    ...allergensQueryOptions(""),
    enabled: recipeCatalogEnabled || resolveReadonlyReferences,
  });
  const remainingWeekdays = getRemainingWeekdays(watchedDays);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const safeActiveDayIndex = Math.min(
    activeDayIndex,
    Math.max(0, daysFieldArray.fields.length - 1),
  );
  const effectiveStartDate = resolveEffectiveStartDate(watchedStartDate);

  const submit = form.handleSubmit(
    async (values) => {
      form.clearErrors("root");

      try {
        await onSubmit(values);
        form.reset(values);
      } catch (error) {
        form.setError("root", {
          type: "server",
          message: getApiErrorMessage(error),
        });
      }
    },
    () => {
      form.setError("root", {
        type: "manual",
        message:
          "Форма не збереглась. Перевірте обов’язкові поля в назві меню, позиціях та виходах.",
      });
    },
  );

  const activeDay = watchedDays[safeActiveDayIndex];

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {headerNote ? (
        <div className="nf-panel">
          <div className="nf-panel-body">{headerNote}</div>
        </div>
      ) : null}

      <section className="nf-panel">
        <div className="nf-panel-header">
          <h2 className="nf-panel-title">Параметри тижневого меню</h2>
        </div>
        <div className="nf-panel-body grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <label htmlFor="weekly-menu-title" className="nf-label">
              Назва меню
            </label>
            {allowValueEdits ? (
              <input
                id="weekly-menu-title"
                {...form.register("title")}
                readOnly={!allowValueEdits}
                aria-invalid={form.formState.errors.title ? "true" : "false"}
                className="nf-input"
              />
            ) : (
              <ReadonlyFieldValue value={form.getValues("title")} />
            )}
            {form.formState.errors.title ? (
              <p role="alert" className="nf-field-error">
                {form.formState.errors.title.message}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="weekly-menu-meal-type" className="nf-label">
              Тип прийому їжі
            </label>
            {allowValueEdits ? (
              <select
                id="weekly-menu-meal-type"
                {...form.register("meal_type")}
                disabled={!allowValueEdits}
                className="nf-input"
              >
                <option value="lunch">Обід</option>
                <option value="breakfast">Сніданок</option>
              </select>
            ) : (
              <ReadonlyFieldValue
                value={
                  form.getValues("meal_type") === "lunch" ? "Обід" : "Сніданок"
                }
              />
            )}
          </div>

          <div>
            <label htmlFor="weekly-menu-cycle-week" className="nf-label">
              Тиждень циклу
            </label>
            {allowValueEdits ? (
              <input
                id="weekly-menu-cycle-week"
                inputMode="numeric"
                placeholder="1-4"
                {...form.register("cycle_week")}
                readOnly={!allowValueEdits}
                aria-invalid={
                  form.formState.errors.cycle_week ? "true" : "false"
                }
                className="nf-input"
              />
            ) : (
              <ReadonlyFieldValue value={form.getValues("cycle_week")} />
            )}
            {form.formState.errors.cycle_week ? (
              <p role="alert" className="nf-field-error">
                {form.formState.errors.cycle_week.message}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Меню затверджується помісячно, цикл можливий лише від 1 до 4.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="weekly-menu-starts-on" className="nf-label">
              Дата початку
            </label>
            {allowValueEdits ? (
              <input
                id="weekly-menu-starts-on"
                type="date"
                {...form.register("starts_on")}
                readOnly={!allowValueEdits}
                aria-invalid={
                  form.formState.errors.starts_on ? "true" : "false"
                }
                className="nf-input"
              />
            ) : (
              <ReadonlyFieldValue value={form.getValues("starts_on")} />
            )}
            {form.formState.errors.starts_on ? (
              <p role="alert" className="nf-field-error">
                {form.formState.errors.starts_on.message}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Для нового меню автоматично обирається найближчий наступний
                понеділок: {effectiveStartDate}.
              </p>
            )}
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="weekly-menu-notes" className="nf-label">
              Загальні нотатки
            </label>
            {allowValueEdits ? (
              <textarea
                id="weekly-menu-notes"
                {...form.register("notes")}
                readOnly={!allowValueEdits}
                className="nf-input min-h-24"
              />
            ) : (
              <ReadonlyFieldValue value={form.getValues("notes")} multiline />
            )}
            {form.formState.errors.notes ? (
              <p role="alert" className="nf-field-error">
                {form.formState.errors.notes.message}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="nf-panel">
        <div className="nf-panel-header">
          <div>
            <h2 className="nf-panel-title">Дні тижня</h2>
            <p className="mt-1 text-xs text-slate-600">
              {allowStructureEdits
                ? "Додавайте або прибирайте дні та керуйте кількістю страв."
                : "Кількість рядків фіксована. Для шкільного акаунта всі поля доступні лише для перегляду."}
            </p>
          </div>
        </div>
        <div className="nf-panel-body space-y-4">
          <div className="flex flex-wrap gap-2">
            {daysFieldArray.fields.map((field, index) => {
              const day = watchedDays[index];
              const resolvedDayDate = resolveEffectiveDayDate(
                watchedStartDate,
                WEEKDAY_ORDER.indexOf(day?.weekday ?? "monday"),
                day?.date,
              );

              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => setActiveDayIndex(index)}
                  className={`border px-3 py-2 text-left ${
                    index === safeActiveDayIndex
                      ? "border-(--nf-brand-dark) bg-(--nf-brand) text-white"
                      : "border-(--nf-line) bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="text-sm font-bold">
                    {WEEKDAY_LABELS[day?.weekday ?? "monday"]}
                  </div>
                  <div
                    className={`text-xs ${
                      index === safeActiveDayIndex
                        ? "text-white/80"
                        : "text-slate-500"
                    }`}
                  >
                    {resolvedDayDate}
                  </div>
                </button>
              );
            })}
          </div>

          {allowStructureEdits && remainingWeekdays.length ? (
            <div className="flex flex-wrap gap-2 border border-dashed border-(--nf-line) p-3">
              {remainingWeekdays.map((weekday) => (
                <button
                  key={weekday}
                  type="button"
                  className="nf-button nf-button-secondary"
                  onClick={() => {
                    daysFieldArray.append(createBlankDay(weekday));
                    setActiveDayIndex(daysFieldArray.fields.length);
                  }}
                >
                  Додати {WEEKDAY_LABELS[weekday]}
                </button>
              ))}
            </div>
          ) : null}

          {form.formState.errors.days &&
          !Array.isArray(form.formState.errors.days) ? (
            <p role="alert" className="nf-error">
              {form.formState.errors.days.message}
            </p>
          ) : null}

          {activeDay ? (
            <DailyMenuDayEditor
              key={activeDay.weekday}
              form={form}
              dayIndex={safeActiveDayIndex}
              allowStructureEdits={allowStructureEdits}
              allowValueEdits={allowValueEdits}
              recipeCatalogEnabled={recipeCatalogEnabled}
              resolveReadonlyReferences={resolveReadonlyReferences}
              allergenOptions={allergens.data?.items ?? []}
              effectiveStartDate={watchedStartDate}
              onRemoveDay={() => {
                if (daysFieldArray.fields.length <= 1) {
                  return;
                }

                daysFieldArray.remove(safeActiveDayIndex);
              }}
            />
          ) : null}
        </div>
      </section>

      {form.formState.errors.root ? (
        <p role="alert" className="nf-error">
          {form.formState.errors.root.message}
        </p>
      ) : null}

      {allowValueEdits ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="nf-button nf-button-primary"
          >
            {saving ? "Зберігаємо…" : submitLabel}
          </button>
          {form.formState.isDirty ? (
            <p className="text-xs text-slate-600">
              Є незбережені зміни у поточній формі.
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              Зміни синхронізовані з останнім збереженням.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-600">
          Шкільний акаунт бачить лише опубліковане меню без можливості
          редагування.
        </p>
      )}
    </form>
  );
}

function DailyMenuDayEditor({
  form,
  dayIndex,
  allowStructureEdits,
  allowValueEdits,
  recipeCatalogEnabled,
  resolveReadonlyReferences,
  allergenOptions,
  effectiveStartDate,
  onRemoveDay,
}: {
  form: UseFormReturn<WeeklyMenuFormValues>;
  dayIndex: number;
  allowStructureEdits: boolean;
  allowValueEdits: boolean;
  recipeCatalogEnabled: boolean;
  resolveReadonlyReferences: boolean;
  allergenOptions: Allergen[];
  effectiveStartDate: string;
  onRemoveDay: () => void;
}) {
  const itemsFieldArray = useFieldArray({
    control: form.control,
    name: `days.${dayIndex}.items` as const,
  });
  const day = useWatch({
    control: form.control,
    name: `days.${dayIndex}` as const,
  });
  const resolvedDayDate = resolveEffectiveDayDate(
    effectiveStartDate,
    WEEKDAY_ORDER.indexOf(day?.weekday ?? "monday"),
    day?.date,
  );
  const dateRegistration = form.register(`days.${dayIndex}.date` as const);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <details className="border border-(--nf-line) bg-slate-50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-800">
          Додатково для дня
        </summary>
        <div className="grid gap-4 border-t border-(--nf-line) p-4 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
          <div>
            <label className="nf-label" htmlFor={`day-date-${dayIndex}`}>
              Дата дня
            </label>
            {allowValueEdits ? (
              <input
                id={`day-date-${dayIndex}`}
                type="date"
                placeholder={resolvedDayDate}
                {...dateRegistration}
                onChange={(event) => {
                  form.setValue(
                    "days",
                    updateDayDate(
                      form.getValues("days"),
                      day?.weekday ?? "monday",
                      event.target.value,
                    ),
                    {
                      shouldDirty: true,
                      shouldValidate: true,
                    },
                  );
                }}
                readOnly={!allowValueEdits}
                className="nf-input"
              />
            ) : (
              <ReadonlyFieldValue value={day?.date ?? resolvedDayDate} />
            )}
            <p className="mt-1 text-xs text-slate-500">
              Якщо порожньо, автоматично: {resolvedDayDate}
            </p>
          </div>

          <div>
            <label className="nf-label" htmlFor={`day-notes-${dayIndex}`}>
              Нотатки дня
            </label>
            {allowValueEdits ? (
              <input
                id={`day-notes-${dayIndex}`}
                {...form.register(`days.${dayIndex}.notes` as const)}
                readOnly={!allowValueEdits}
                className="nf-input"
              />
            ) : (
              <ReadonlyFieldValue value={day?.notes} />
            )}
          </div>

          {allowStructureEdits ? (
            <div className="flex items-end">
              <button
                type="button"
                onClick={onRemoveDay}
                className="nf-button nf-button-danger"
              >
                Видалити день
              </button>
            </div>
          ) : null}
        </div>
      </details>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Страви дня</h3>
          <p className="mt-1 text-xs text-slate-600">
            Дата цього дня зараз рахується як {resolvedDayDate}.
          </p>
        </div>
        {allowStructureEdits ? (
          <button
            type="button"
            className="nf-button nf-button-secondary"
            onClick={() => itemsFieldArray.append(createBlankItem())}
          >
            Додати позицію
          </button>
        ) : null}
      </div>

      <div className="space-y-4">
        {itemsFieldArray.fields.map((field, itemIndex) => {
          const itemErrors =
            form.formState.errors.days?.[dayIndex]?.items?.[itemIndex];
          const item = day?.items[itemIndex];
          const isItemOpen = openItemId === field.id;
          const itemPanelId = `day-${dayIndex}-item-${itemIndex}-panel`;
          const hasItemErrors = Boolean(itemErrors);

          return (
            <section
              key={field.id}
              className={`border bg-white ${
                hasItemErrors
                  ? "border-red-300"
                  : "border-(--nf-line-strong)"
              }`}
            >
              <header className="flex flex-wrap items-center justify-between gap-3 bg-(--nf-panel-head)">
                <button
                  type="button"
                  className="flex min-h-16 min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
                  aria-expanded={isItemOpen}
                  aria-controls={itemPanelId}
                  onClick={() =>
                    setOpenItemId((currentId) =>
                      currentId === field.id ? null : field.id,
                    )
                  }
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">
                      Позиція {itemIndex + 1}
                    </span>
                    <span className="mt-1 block text-xs text-slate-600">
                      {item?.name?.trim() || "Нова позиція"}
                    </span>
                    {hasItemErrors ? (
                      <span className="mt-1 block text-xs font-medium text-red-700">
                        Є поля, які треба перевірити
                      </span>
                    ) : null}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className={`size-4 shrink-0 text-slate-600 transition-transform ${
                      isItemOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {allowStructureEdits ? (
                  <button
                    type="button"
                    onClick={() => itemsFieldArray.remove(itemIndex)}
                    disabled={itemsFieldArray.fields.length <= 1}
                    className="nf-button nf-button-danger mr-4"
                  >
                    Видалити
                  </button>
                ) : null}
              </header>

              <MenuItemReferenceSync
                form={form}
                dayIndex={dayIndex}
                itemIndex={itemIndex}
                resolveReferences={
                  recipeCatalogEnabled || resolveReadonlyReferences
                }
                allergenOptions={allergenOptions}
              />

              {isItemOpen ? (
                <div
                  id={itemPanelId}
                  className="border-t border-(--nf-line)"
                >
                  <div className="grid gap-4 p-4 lg:grid-cols-3">
                    <div className="lg:col-span-3">
                      <label className="nf-label">Джерело позиції</label>
                      {allowValueEdits ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!allowValueEdits}
                            className={`nf-button ${
                              item?.kind === "dish_card"
                                ? "nf-button-primary"
                                : ""
                            }`}
                            onClick={() => {
                              if (!allowValueEdits) {
                                return;
                              }
                              form.setValue(
                                `days.${dayIndex}.items.${itemIndex}.kind`,
                                "dish_card",
                                { shouldDirty: true },
                              );
                              form.setValue(
                                `days.${dayIndex}.items.${itemIndex}.product_ingredient_id`,
                                null,
                                { shouldDirty: true },
                              );
                              form.setValue(
                                `days.${dayIndex}.items.${itemIndex}.product_name_snapshot`,
                                "",
                                { shouldDirty: true },
                              );
                            }}
                          >
                            Техкарта
                          </button>
                          <button
                            type="button"
                            disabled={!allowValueEdits}
                            className={`nf-button ${
                              item?.kind === "product"
                                ? "nf-button-primary"
                                : ""
                            }`}
                            onClick={() => {
                              if (!allowValueEdits) {
                                return;
                              }
                              form.setValue(
                                `days.${dayIndex}.items.${itemIndex}.kind`,
                                "product",
                                { shouldDirty: true },
                              );
                              form.setValue(
                                `days.${dayIndex}.items.${itemIndex}.dish_card_id`,
                                null,
                                { shouldDirty: true },
                              );
                              form.setValue(
                                `days.${dayIndex}.items.${itemIndex}.dish_card_version_id`,
                                null,
                                { shouldDirty: true },
                              );
                              form.setValue(
                                `days.${dayIndex}.items.${itemIndex}.recipe_card_number`,
                                "",
                                { shouldDirty: true },
                              );
                              form.setValue(
                                `days.${dayIndex}.items.${itemIndex}.source_text`,
                                "пром. вироб.",
                                { shouldDirty: true },
                              );
                            }}
                          >
                            Пром. вироб.
                          </button>
                        </div>
                      ) : (
                        <ReadonlyFieldValue
                          value={
                            item?.kind === "dish_card"
                              ? "Техкарта"
                              : "Пром. вироб."
                          }
                        />
                      )}
                      <p className="mt-1 text-xs text-slate-500">
                        Для техкарти використовуємо каталог ТК, для промислового
                        виробу обираємо інгредієнт без власної ТК.
                      </p>
                    </div>

                    {item?.kind === "dish_card" ? (
                      <div className="lg:col-span-3">
                        {allowValueEdits ? (
                          <DishCardLookupField
                            form={form}
                            dayIndex={dayIndex}
                            itemIndex={itemIndex}
                            enabled={recipeCatalogEnabled}
                            readOnly={!allowValueEdits}
                          />
                        ) : (
                          <ReadonlyReferenceField
                            label="Техкарта"
                            value={
                              item?.recipe_card_number
                                ? `${item.recipe_card_number} · ${item.name || "Без назви"}`
                                : item?.name
                            }
                          />
                        )}
                      </div>
                    ) : (
                      <div className="lg:col-span-3">
                        {allowValueEdits ? (
                          <IngredientLookupField
                            form={form}
                            dayIndex={dayIndex}
                            itemIndex={itemIndex}
                            enabled={recipeCatalogEnabled}
                            readOnly={!allowValueEdits}
                          />
                        ) : (
                          <ReadonlyReferenceField
                            label="Промисловий виріб"
                            value={item?.product_name_snapshot ?? item?.name}
                          />
                        )}
                      </div>
                    )}

                    <div className="lg:col-span-2">
                      <label
                        className="nf-label"
                        htmlFor={`day-${dayIndex}-item-${itemIndex}-name`}
                      >
                        Назва позиції
                      </label>
                      {allowValueEdits ? (
                        <input
                          id={`day-${dayIndex}-item-${itemIndex}-name`}
                          {...form.register(
                            `days.${dayIndex}.items.${itemIndex}.name` as const,
                          )}
                          readOnly={!allowValueEdits}
                          aria-invalid={itemErrors?.name ? "true" : "false"}
                          className="nf-input"
                        />
                      ) : (
                        <ReadonlyFieldValue value={item?.name} />
                      )}
                      {itemErrors?.name ? (
                        <p role="alert" className="nf-field-error">
                          {itemErrors.name.message}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label
                        className="nf-label"
                        htmlFor={`day-${dayIndex}-item-${itemIndex}-allergens`}
                      >
                        Алергени
                      </label>
                      <AllergenCheckboxList
                        itemId={`day-${dayIndex}-item-${itemIndex}-allergens`}
                        options={allergenOptions}
                        selectedCodes={item?.allergen_codes ?? []}
                        readOnly={!allowValueEdits}
                        onChange={(nextCodes) => {
                          form.setValue(
                            `days.${dayIndex}.items.${itemIndex}.allergen_codes`,
                            nextCodes,
                            { shouldDirty: true },
                          );
                        }}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        {allowValueEdits
                          ? "Для техкарти алергени підтягуються автоматично. За потреби їх можна скоригувати вручну чекбоксами."
                          : "Алергени показані списком і, якщо позиція прив’язана до ТК, заповнюються з неї автоматично."}
                      </p>
                    </div>
                  </div>

                  <div className="px-4 pb-4">
                    <div className="nf-table-wrap">
                      <table className="nf-table">
                        <thead>
                          <tr>
                            <th>Вікова група</th>
                            <th>Вихід</th>
                            <th>Ккал</th>
                            <th>Білки</th>
                            <th>Жири</th>
                            <th>Вуглеводи</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(item?.portions ?? []).map(
                            (portion, portionIndex) => {
                              const portionErrors =
                                itemErrors?.portions?.[portionIndex];

                              return (
                                <tr key={portion.age_group}>
                                  <td className="font-medium text-slate-700">
                                    {AGE_GROUP_LABELS[portion.age_group]}
                                  </td>
                                  <td>
                                    {allowValueEdits ? (
                                      <input
                                        {...form.register(
                                          `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.yield_amount` as const,
                                        )}
                                        readOnly={!allowValueEdits}
                                        aria-invalid={
                                          portionErrors?.yield_amount
                                            ? "true"
                                            : "false"
                                        }
                                        className="nf-input"
                                      />
                                    ) : (
                                      <div className="text-sm text-slate-700">
                                        {portion.yield_amount}
                                      </div>
                                    )}
                                    {portionErrors?.yield_amount ? (
                                      <p
                                        role="alert"
                                        className="nf-field-error"
                                      >
                                        {portionErrors.yield_amount.message}
                                      </p>
                                    ) : null}
                                  </td>
                                  <NutritionCell
                                    value={portion.nutrition.kcal}
                                  />
                                  <NutritionCell
                                    value={portion.nutrition.proteins}
                                  />
                                  <NutritionCell
                                    value={portion.nutrition.fats}
                                  />
                                  <NutritionCell
                                    value={portion.nutrition.carbs}
                                  />
                                </tr>
                              );
                            },
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <details className="mx-4 mb-4 border border-(--nf-line)">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-800">
                      Додаткові поля позиції
                    </summary>
                    <div className="grid gap-4 border-t border-(--nf-line) p-4 lg:grid-cols-2">
                      <div>
                        <label
                          className="nf-label"
                          htmlFor={`day-${dayIndex}-item-${itemIndex}-recipe`}
                        >
                          Позначення ТК / номера
                        </label>
                        {allowValueEdits ? (
                          <input
                            id={`day-${dayIndex}-item-${itemIndex}-recipe`}
                            {...form.register(
                              `days.${dayIndex}.items.${itemIndex}.recipe_card_number` as const,
                            )}
                            readOnly={!allowValueEdits}
                            className="nf-input"
                          />
                        ) : (
                          <ReadonlyFieldValue
                            value={item?.recipe_card_number}
                          />
                        )}
                      </div>

                      <div>
                        <label
                          className="nf-label"
                          htmlFor={`day-${dayIndex}-item-${itemIndex}-source`}
                        >
                          Джерело / збірник
                        </label>
                        {allowValueEdits ? (
                          <input
                            id={`day-${dayIndex}-item-${itemIndex}-source`}
                            {...form.register(
                              `days.${dayIndex}.items.${itemIndex}.source_text` as const,
                            )}
                            readOnly={!allowValueEdits}
                            className="nf-input"
                          />
                        ) : (
                          <ReadonlyFieldValue value={item?.source_text} />
                        )}
                      </div>

                      <div className="lg:col-span-2">
                        <label
                          className="nf-label"
                          htmlFor={`day-${dayIndex}-item-${itemIndex}-notes`}
                        >
                          Нотатки до позиції
                        </label>
                        {allowValueEdits ? (
                          <textarea
                            id={`day-${dayIndex}-item-${itemIndex}-notes`}
                            {...form.register(
                              `days.${dayIndex}.items.${itemIndex}.notes` as const,
                            )}
                            readOnly={!allowValueEdits}
                            className="nf-input min-h-20"
                          />
                        ) : (
                          <ReadonlyFieldValue value={item?.notes} multiline />
                        )}
                        {itemErrors?.notes ? (
                          <p role="alert" className="nf-field-error">
                            {itemErrors.notes.message}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </details>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function DishCardLookupField({
  form,
  dayIndex,
  itemIndex,
  enabled,
  readOnly,
}: {
  form: UseFormReturn<WeeklyMenuFormValues>;
  dayIndex: number;
  itemIndex: number;
  enabled: boolean;
  readOnly: boolean;
}) {
  const item = useWatch({
    control: form.control,
    name: `days.${dayIndex}.items.${itemIndex}` as const,
  });
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const dishCards = useQuery({
    ...dishCardsQueryOptions(deferredQuery),
    enabled,
  });

  const selectedLabel = item?.recipe_card_number
    ? `${item.recipe_card_number} · ${item.name || "Без назви"}`
    : item?.name || "";

  return (
    <div className="space-y-2">
      <label
        className="nf-label"
        htmlFor={`dish-card-lookup-${dayIndex}-${itemIndex}`}
      >
        Техкарта
      </label>
      {enabled ? (
        <>
          <input
            id={`dish-card-lookup-${dayIndex}-${itemIndex}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Пошук ТК за номером або назвою"
            disabled={readOnly}
            className="nf-input"
          />
          {selectedLabel ? (
            <p className="text-xs text-slate-600">Обрано: {selectedLabel}</p>
          ) : null}
          <div className="max-h-56 overflow-y-auto border border-(--nf-line) bg-white">
            {dishCards.isPending ? (
              <div className="px-3 py-2 text-sm text-slate-600">
                Завантажуємо техкарти…
              </div>
            ) : null}
            {dishCards.data?.items.map((dishCard) => (
              <button
                key={dishCard.id}
                type="button"
                disabled={readOnly}
                className="block w-full border-b border-(--nf-line) px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                onClick={() =>
                  applyDishCardSelection(form, dayIndex, itemIndex, dishCard)
                }
              >
                <div className="text-sm font-bold text-slate-900">
                  {dishCard.card_number}
                </div>
                <div className="text-sm text-slate-700">{dishCard.name}</div>
                {dishCard.source ? (
                  <div className="text-xs text-slate-500">
                    {dishCard.source}
                  </div>
                ) : null}
              </button>
            ))}
            {dishCards.data && dishCards.data.items.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-600">
                За цим пошуком техкарт не знайдено.
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-600">
          {readOnly
            ? "Для шкільного акаунта довідник техкарт у цьому режимі не відкривається."
            : "Каталог техкарт недоступний для цієї ролі. Можна редагувати назву та номер вручну у додаткових полях."}
        </p>
      )}
    </div>
  );
}

function IngredientLookupField({
  form,
  dayIndex,
  itemIndex,
  enabled,
  readOnly,
}: {
  form: UseFormReturn<WeeklyMenuFormValues>;
  dayIndex: number;
  itemIndex: number;
  enabled: boolean;
  readOnly: boolean;
}) {
  const item = useWatch({
    control: form.control,
    name: `days.${dayIndex}.items.${itemIndex}` as const,
  });
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const ingredients = useQuery({
    ...ingredientsQueryOptions(deferredQuery),
    enabled,
  });

  return (
    <div className="space-y-2">
      <label
        className="nf-label"
        htmlFor={`ingredient-lookup-${dayIndex}-${itemIndex}`}
      >
        Промисловий виріб
      </label>
      {enabled ? (
        <>
          <input
            id={`ingredient-lookup-${dayIndex}-${itemIndex}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Пошук інгредієнта або готового виробу"
            disabled={readOnly}
            className="nf-input"
          />
          {item?.product_ingredient_id ? (
            <p className="text-xs text-slate-600">Обрано: {item.name}</p>
          ) : null}
          <div className="max-h-56 overflow-y-auto border border-(--nf-line) bg-white">
            {ingredients.isPending ? (
              <div className="px-3 py-2 text-sm text-slate-600">
                Завантажуємо інгредієнти…
              </div>
            ) : null}
            {ingredients.data?.items.map((ingredient) => (
              <button
                key={ingredient.id}
                type="button"
                disabled={readOnly}
                className="block w-full border-b border-(--nf-line) px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                onClick={() =>
                  applyIngredientSelection(
                    form,
                    dayIndex,
                    itemIndex,
                    ingredient,
                  )
                }
              >
                <div className="text-sm font-bold text-slate-900">
                  {ingredient.name}
                </div>
                <div className="text-xs text-slate-500">
                  Одиниця: {ingredient.unit}
                </div>
              </button>
            ))}
            {ingredients.data && ingredients.data.items.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-600">
                За цим пошуком інгредієнтів не знайдено.
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-600">
          {readOnly
            ? "Для шкільного акаунта довідник інгредієнтів у цьому режимі не відкривається."
            : "Каталог інгредієнтів недоступний для цієї ролі. Назву можна ввести вручну."}
        </p>
      )}
    </div>
  );
}

function MenuItemReferenceSync({
  form,
  dayIndex,
  itemIndex,
  resolveReferences,
  allergenOptions,
}: {
  form: UseFormReturn<WeeklyMenuFormValues>;
  dayIndex: number;
  itemIndex: number;
  resolveReferences: boolean;
  allergenOptions: Allergen[];
}) {
  const item = useWatch({
    control: form.control,
    name: `days.${dayIndex}.items.${itemIndex}` as const,
  });
  const dishCardId =
    item?.kind === "dish_card" ? (item.dish_card_id ?? "") : "";
  const versionId =
    item?.kind === "dish_card" ? (item.dish_card_version_id ?? "") : "";
  const portionYieldSignature =
    item?.portions
      .map((portion) => portion.yield_amount.trim())
      .join("|") ?? "";

  const dishCard = useQuery({
    ...dishCardQueryOptions(dishCardId),
    enabled: resolveReferences && dishCardId.length > 0,
  });
  const dishCardVersion = useQuery({
    ...dishCardVersionQueryOptions(versionId),
    enabled: resolveReferences && versionId.length > 0,
  });

  useEffect(() => {
    if (
      !resolveReferences ||
      item?.kind !== "dish_card" ||
      !dishCard.data ||
      item.dish_card_version_id ||
      !dishCard.data.current_version_id
    ) {
      return;
    }

    form.setValue(
      `days.${dayIndex}.items.${itemIndex}.dish_card_version_id`,
      dishCard.data.current_version_id,
      { shouldDirty: true },
    );
  }, [
    dayIndex,
    dishCard.data,
    form,
    item?.dish_card_version_id,
    item?.kind,
    itemIndex,
    resolveReferences,
  ]);

  useEffect(() => {
    if (!item || item.kind !== "product") {
      return;
    }

    const currentItem = form.getValues(
      `days.${dayIndex}.items.${itemIndex}` as const,
    );
    currentItem.portions.forEach((_portion, portionIndex) => {
      form.setValue(
        `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.dish_card_portion_variant_id`,
        null,
      );
      form.setValue(
        `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.nutrition.kcal`,
        "",
      );
      form.setValue(
        `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.nutrition.proteins`,
        "",
      );
      form.setValue(
        `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.nutrition.fats`,
        "",
      );
      form.setValue(
        `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.nutrition.carbs`,
        "",
      );
    });
  }, [dayIndex, form, item, itemIndex]);

  useEffect(() => {
    if (
      !resolveReferences ||
      item?.kind !== "dish_card" ||
      !dishCardVersion.data
    ) {
      return;
    }

    const currentItem = form.getValues(
      `days.${dayIndex}.items.${itemIndex}` as const,
    );
    syncNutritionFromVersion(
      form,
      dayIndex,
      itemIndex,
      currentItem,
      dishCardVersion.data,
    );
    syncAllergensFromVersion(
      form,
      dayIndex,
      itemIndex,
      currentItem.allergen_codes,
      dishCardVersion.data,
      allergenOptions,
    );
  }, [
    dayIndex,
    dishCardVersion.data,
    form,
    itemIndex,
    resolveReferences,
    item?.kind,
    portionYieldSignature,
    allergenOptions,
  ]);

  return null;
}

function NutritionCell({ value }: { value: string | undefined }) {
  return (
    <td className="text-sm text-slate-700">{value?.trim() ? value : "—"}</td>
  );
}

function AllergenCheckboxList({
  itemId,
  options,
  selectedCodes,
  readOnly,
  onChange,
}: {
  itemId: string;
  options: Allergen[];
  selectedCodes: string[];
  readOnly: boolean;
  onChange: (codes: string[]) => void;
}) {
  const selectedCodeSet = new Set(selectedCodes);
  const selectedOptions = options.filter((allergen) =>
    selectedCodeSet.has(allergen.code),
  );

  if (readOnly) {
    if (!selectedCodes.length) {
      return <ReadonlyFieldValue value={null} emptyLabel="Не вказано" />;
    }

    return (
      <div
        id={itemId}
        className="flex flex-wrap gap-2 rounded border border-dashed border-(--nf-line) bg-slate-50 p-3"
      >
        {(selectedOptions.length ? selectedOptions : selectedCodes).map(
          (item) => {
            if (typeof item === "string") {
              return (
                <span
                  key={item}
                  className="rounded-full border border-(--nf-line) bg-white px-2.5 py-1 text-sm text-slate-700"
                >
                  {item}
                </span>
              );
            }

            return (
              <span
                key={item.id}
                className="rounded-full border border-(--nf-line) bg-white px-2.5 py-1 text-sm text-slate-700"
              >
                <span className="font-medium text-slate-900">{item.code}</span>{" "}
                {item.name}
              </span>
            );
          },
        )}
      </div>
    );
  }

  if (!options.length) {
    return (
      <div
        id={itemId}
        className="rounded border border-dashed border-(--nf-line) px-3 py-2 text-sm text-slate-500"
      >
        Довідник алергенів поки недоступний.
      </div>
    );
  }

  return (
    <div
      id={itemId}
      className="max-h-56 space-y-2 overflow-y-auto rounded border border-(--nf-line) bg-slate-50 p-3"
    >
      {options.map((allergen) => {
        const checked = selectedCodeSet.has(allergen.code);

        return (
          <label
            key={allergen.id}
            className={`flex items-start gap-3 rounded px-2 py-1 text-sm ${
              readOnly ? "cursor-default" : "cursor-pointer hover:bg-white"
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={readOnly}
              onChange={(event) => {
                const nextCodes = event.target.checked
                  ? [...selectedCodes, allergen.code]
                  : selectedCodes.filter((code) => code !== allergen.code);

                onChange([...new Set(nextCodes)]);
              }}
            />
            <span className="text-slate-700">
              <span className="font-medium text-slate-900">
                {allergen.code}
              </span>{" "}
              {allergen.name}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function applyDishCardSelection(
  form: UseFormReturn<WeeklyMenuFormValues>,
  dayIndex: number,
  itemIndex: number,
  dishCard: DishCard,
) {
  form.setValue(`days.${dayIndex}.items.${itemIndex}.kind`, "dish_card", {
    shouldDirty: true,
  });
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.dish_card_id`,
    dishCard.id,
    { shouldDirty: true },
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.dish_card_version_id`,
    dishCard.current_version_id,
    { shouldDirty: true },
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.recipe_card_number`,
    dishCard.card_number,
    { shouldDirty: true },
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.source_text`,
    dishCard.source ?? "",
    { shouldDirty: true },
  );
  form.setValue(`days.${dayIndex}.items.${itemIndex}.name`, dishCard.name, {
    shouldDirty: true,
  });
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.product_ingredient_id`,
    null,
    { shouldDirty: true },
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.product_name_snapshot`,
    "",
    { shouldDirty: true },
  );
  form.setValue(`days.${dayIndex}.items.${itemIndex}.allergen_codes`, [], {
    shouldDirty: true,
  });
}

function applyIngredientSelection(
  form: UseFormReturn<WeeklyMenuFormValues>,
  dayIndex: number,
  itemIndex: number,
  ingredient: Ingredient,
) {
  form.setValue(`days.${dayIndex}.items.${itemIndex}.kind`, "product", {
    shouldDirty: true,
  });
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.product_ingredient_id`,
    ingredient.id,
    { shouldDirty: true },
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.product_name_snapshot`,
    ingredient.name,
    { shouldDirty: true },
  );
  form.setValue(`days.${dayIndex}.items.${itemIndex}.name`, ingredient.name, {
    shouldDirty: true,
  });
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.source_text`,
    "пром. вироб.",
    { shouldDirty: true },
  );
  form.setValue(`days.${dayIndex}.items.${itemIndex}.dish_card_id`, null, {
    shouldDirty: true,
  });
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.dish_card_version_id`,
    null,
    { shouldDirty: true },
  );
  form.setValue(`days.${dayIndex}.items.${itemIndex}.recipe_card_number`, "", {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.allergen_codes`, [], {
    shouldDirty: true,
  });
}
function normalizeGramAmount(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s*(?:г|гр|g)\s*$/u, "")
    .replace(",", ".");

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  return Number(normalized);
}

function findPortionVariantByYield(
  variants: PortionVariant[],
  yieldAmount: string,
  preferredVariantId: string | null,
) {
  const target = normalizeGramAmount(yieldAmount);

  if (target === null) {
    return (
      variants.find(
        (variant) => variant.id === preferredVariantId,
      ) ?? null
    );
  }

  const outputMatches = variants.filter(
    (variant) =>
      normalizeGramAmount(variant.output_grams) === target,
  );

  const portionMatches = variants.filter(
    (variant) =>
      normalizeGramAmount(variant.portion_grams) === target,
  );

  for (const matches of [outputMatches, portionMatches]) {
    const preferred = matches.find(
      (variant) => variant.id === preferredVariantId,
    );

    if (preferred) {
      return preferred;
    }

    if (matches[0]) {
      return matches[0];
    }
  }

  return null;
}
function syncNutritionFromVersion(
  form: UseFormReturn<WeeklyMenuFormValues>,
  dayIndex: number,
  itemIndex: number,
  item: WeeklyMenuFormValues["days"][number]["items"][number],
  version: DishCardVersion,
) {
  item.portions.forEach((portion, portionIndex) => {
    const variant = findPortionVariantByYield(
      version.portion_variants,
      portion.yield_amount,
      portion.dish_card_portion_variant_id,
    );

    applyVariantToPortion(
      form,
      dayIndex,
      itemIndex,
      portionIndex,
      portion.yield_amount,
      variant ?? undefined,
    );
  });
}

function syncAllergensFromVersion(
  form: UseFormReturn<WeeklyMenuFormValues>,
  dayIndex: number,
  itemIndex: number,
  currentCodes: string[],
  version: DishCardVersion,
  allergenOptions: Allergen[],
) {
  if (
    currentCodes.length ||
    !version.allergen_ids.length ||
    !allergenOptions.length
  ) {
    return;
  }

  const allergenById = new Map(
    allergenOptions.map((allergen) => [allergen.id, allergen.code]),
  );
  const resolvedCodes = version.allergen_ids
    .map((allergenId) => allergenById.get(allergenId))
    .filter((value): value is string => Boolean(value));

  if (!resolvedCodes.length) {
    return;
  }

  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.allergen_codes`,
    [...new Set(resolvedCodes)],
    { shouldDirty: false },
  );
}

function ReadonlyReferenceField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="space-y-2">
      <p className="nf-label">{label}</p>
      <ReadonlyFieldValue value={value} />
      <p className="text-xs text-slate-500">
        Поле доступне лише для перегляду.
      </p>
    </div>
  );
}

function ReadonlyFieldValue({
  value,
  emptyLabel = "Не вказано",
  multiline = false,
}: {
  value: string | number | null | undefined;
  emptyLabel?: string;
  multiline?: boolean;
}) {
  const hasValue =
    value !== null && value !== undefined && `${value}`.trim().length > 0;

  return (
    <div
      className={`rounded border border-dashed border-(--nf-line) bg-slate-50 px-3 py-2 text-sm ${
        multiline ? "whitespace-pre-wrap" : ""
      } ${hasValue ? "text-slate-700" : "text-slate-500"}`}
    >
      {hasValue ? value : emptyLabel}
    </div>
  );
}

function applyVariantToPortion(
  form: UseFormReturn<WeeklyMenuFormValues>,
  dayIndex: number,
  itemIndex: number,
  portionIndex: number,
  currentYieldAmount: string,
  variant: PortionVariant | undefined,
) {
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.dish_card_portion_variant_id`,
    variant?.id ?? null,
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.nutrition.kcal`,
    variant?.nutrition.kcal ?? "",
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.nutrition.proteins`,
    variant?.nutrition.proteins ?? "",
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.nutrition.fats`,
    variant?.nutrition.fats ?? "",
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.nutrition.carbs`,
    variant?.nutrition.carbs ?? "",
  );

  if (!currentYieldAmount.trim() && variant?.output_grams) {
    form.setValue(
      `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.yield_amount`,
      variant.output_grams,
      { shouldDirty: true },
    );
  }
}
