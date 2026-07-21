"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useState } from "react";
import {
  useFieldArray,
  useWatch,
  type UseFormReturn,
} from "react-hook-form";

import type { Allergen } from "@/entities/recipe/model/Recipe";
import {
  AGE_GROUP_LABELS,
  WEEKDAY_ORDER,
} from "@/entities/weekly-menu/model/WeeklyMenu";
import { normalizeGramAmount } from "@/shared/lib/Portion";

import {
  createBlankItem,
  resolveEffectiveDayDate,
  updateDayDate,
  type WeeklyMenuFormValues,
} from "../../model/WeeklyMenuFormSchema";
import {
  AllergenCheckboxList,
  DishCardLookupField,
  IngredientLookupField,
  MenuItemReferenceSync,
  NutritionCell,
  ReadonlyFieldValue,
  ReadonlyReferenceField,
} from "./WeeklyMenuItemFields";

export function DailyMenuDayEditor({
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
                                <Fragment key={portion.age_group}>
                                  <tr>
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
                                  {portion.calculated_from ? (
                                    <tr>
                                      <td colSpan={6} className="bg-amber-50">
                                        <p
                                          role="status"
                                          className="text-xs font-medium text-amber-800"
                                        >
                                          {getCalculationWarning(
                                            portion.yield_amount,
                                            portion.calculated_from.yield_amount,
                                          )}
                                        </p>
                                      </td>
                                    </tr>
                                  ) : null}
                                </Fragment>
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

function formatScaleFactor(targetValue: string, sourceValue: string) {
  const target = normalizeGramAmount(targetValue);
  const source = normalizeGramAmount(sourceValue);
  if (target === null || source === null || source <= 0) {
    return "—";
  }

  return (target / source).toLocaleString("uk-UA", {
    maximumFractionDigits: 4,
  });
}

function getCalculationWarning(targetValue: string, sourceValue: string) {
  const factor = formatScaleFactor(targetValue, sourceValue);
  return [
    `У ТК немає порції ${targetValue}.`,
    "Порцію задано вручну; КБЖВ автоматично розраховано",
    `на основі порції ${sourceValue}, коефіцієнт ${factor}.`,
  ].join(" ");
}
