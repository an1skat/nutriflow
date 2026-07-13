"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";

import { allergensQueryOptions } from "@/entities/recipe/api/RecipeQueries";
import {
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
} from "@/entities/weekly-menu/model/WeeklyMenu";
import { getApiErrorMessage } from "@/shared/api/HttpClient";

import {
  createBlankDay,
  getRemainingWeekdays,
  resolveEffectiveDayDate,
  resolveEffectiveStartDate,
  weeklyMenuFormSchema,
  type WeeklyMenuFormValues,
} from "../model/WeeklyMenuFormSchema";
import {
  DailyMenuDayEditor,
} from "./editor/WeeklyMenuDayEditor";
import { ReadonlyFieldValue } from "./editor/WeeklyMenuItemFields";

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
