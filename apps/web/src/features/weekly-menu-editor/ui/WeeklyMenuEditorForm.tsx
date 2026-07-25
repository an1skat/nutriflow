'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { type FieldErrors, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { allergensQueryOptions } from '@/entities/recipe/api/RecipeQueries';
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/entities/weekly-menu/model/WeeklyMenu';
import { getApiErrorMessage } from '@/shared/api/HttpClient';

import {
  type WeeklyMenuFormValues,
  createBlankDay,
  getRemainingWeekdays,
  resolveEffectiveDayDate,
  resolveEffectiveStartDate,
  weeklyMenuFormSchema,
} from '../model/WeeklyMenuFormSchema';
import {
  clearWeeklyMenuDraft,
  loadWeeklyMenuDraft,
  saveWeeklyMenuDraft,
} from '../model/WeeklyMenuDraftStorage';
import { DailyMenuDayEditor } from './editor/WeeklyMenuDayEditor';
import { ReadonlyFieldValue } from './editor/WeeklyMenuItemFields';

const VALIDATION_HIGHLIGHT_MS = 2600;
const DRAFT_SAVE_DELAY_MS = 500;

type WeeklyMenuEditorFormProps = {
  initialValues: WeeklyMenuFormValues;
  mode: 'backoffice' | 'school-readonly';
  submitLabel: string;
  saving: boolean;
  onSubmit: (values: WeeklyMenuFormValues) => Promise<boolean | void>;
  headerNote?: ReactNode;
  recipeCatalogEnabled?: boolean;
  draftKey?: string;
  draftBaseUpdatedAt?: string;
};

type ValidationFocus = {
  fieldPath: string;
  dayIndex?: number;
  itemIndex?: number;
};

export function WeeklyMenuEditorForm({
  initialValues,
  mode,
  submitLabel,
  saving,
  onSubmit,
  headerNote,
  recipeCatalogEnabled = false,
  draftKey,
  draftBaseUpdatedAt,
}: WeeklyMenuEditorFormProps) {
  const allowStructureEdits = mode === 'backoffice';
  const allowValueEdits = mode !== 'school-readonly';
  const resolveReadonlyReferences = !allowValueEdits;
  const form = useForm<WeeklyMenuFormValues>({
    resolver: zodResolver(weeklyMenuFormSchema),
    defaultValues: initialValues,
    shouldFocusError: false,
  });
  const daySectionRef = useRef<HTMLElement>(null);
  const daysFieldArray = useFieldArray({
    control: form.control,
    name: 'days',
  });
  const watchedValues = useWatch({
    control: form.control,
  });
  const watchedDays = useWatch({
    control: form.control,
    name: 'days',
  });
  const watchedStartDate = useWatch({
    control: form.control,
    name: 'starts_on',
  });
  const allergens = useQuery({
    ...allergensQueryOptions(''),
    enabled: recipeCatalogEnabled || resolveReadonlyReferences,
  });
  const remainingWeekdays = getRemainingWeekdays(watchedDays);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [validationFocus, setValidationFocus] = useState<ValidationFocus | null>(null);
  const safeActiveDayIndex = Math.min(
    activeDayIndex,
    Math.max(0, daysFieldArray.fields.length - 1)
  );
  const effectiveStartDate = resolveEffectiveStartDate(watchedStartDate);
  const canUseDraftStorage = Boolean(allowValueEdits && draftKey && draftBaseUpdatedAt);

  useEffect(() => {
    if (!canUseDraftStorage || !draftKey || !draftBaseUpdatedAt) {
      return;
    }

    const draft = loadWeeklyMenuDraft(draftKey, draftBaseUpdatedAt);
    if (!draft) {
      return;
    }

    form.reset(draft.values);
    toast.info('Відновлено незбережену чернетку меню.', {
      id: 'weekly-menu-draft-restored',
    });
  }, [canUseDraftStorage, draftBaseUpdatedAt, draftKey, form]);

  useEffect(() => {
    if (!canUseDraftStorage || !draftKey || !draftBaseUpdatedAt || !form.formState.isDirty) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      saveWeeklyMenuDraft(draftKey, draftBaseUpdatedAt, form.getValues());
    }, DRAFT_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    canUseDraftStorage,
    draftBaseUpdatedAt,
    draftKey,
    form,
    form.formState.isDirty,
    watchedValues,
  ]);

  useEffect(() => {
    if (!validationFocus) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setValidationFocus((currentFocus) =>
        currentFocus === validationFocus ? null : currentFocus
      );
    }, VALIDATION_HIGHLIGHT_MS);

    runAfterFrame(() => {
      if (validationFocus.itemIndex !== undefined) {
        return;
      }

      const fieldId = getFieldElementId(validationFocus.fieldPath);
      if (fieldId) {
        document.getElementById(fieldId)?.scrollIntoView?.({
          behavior: 'smooth',
          block: 'center',
        });
      } else {
        daySectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      }
    });

    return () => window.clearTimeout(timeoutId);
  }, [safeActiveDayIndex, validationFocus]);

  const submit = form.handleSubmit(
    async (values) => {
      form.clearErrors('root');

      try {
        const saved = await onSubmit(values);
        if (saved === false) {
          return;
        }

        if (canUseDraftStorage && draftKey) {
          clearWeeklyMenuDraft(draftKey);
        }

        form.reset(values);
      } catch (error) {
        form.setError('root', {
          type: 'server',
          message: getApiErrorMessage(error),
        });
      }
    },
    (errors) => {
      const focus = getFirstValidationFocus(errors);
      if (focus?.dayIndex !== undefined) {
        setActiveDayIndex(focus.dayIndex);
      }
      setValidationFocus(focus);
      toast.error('Є незаповнені дані. Я підсвітив найближче місце.', {
        id: 'weekly-menu-validation-error',
      });
    }
  );

  const activeDay = watchedDays[safeActiveDayIndex];
  const nextDay = watchedDays[safeActiveDayIndex + 1];
  const goToNextDay = () => {
    if (!nextDay) {
      return;
    }

    setActiveDayIndex(safeActiveDayIndex + 1);
    runAfterFrame(() => {
      daySectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  };

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
                {...form.register('title')}
                readOnly={!allowValueEdits}
                aria-invalid={isFocusedField(validationFocus, 'title') ? 'true' : 'false'}
                className="nf-input"
              />
            ) : (
              <ReadonlyFieldValue value={form.getValues('title')} />
            )}
            {form.formState.errors.title && isFocusedField(validationFocus, 'title') ? (
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
                {...form.register('meal_type')}
                disabled={!allowValueEdits}
                className="nf-input"
              >
                <option value="lunch">Обід</option>
                <option value="breakfast">Сніданок</option>
              </select>
            ) : (
              <ReadonlyFieldValue
                value={form.getValues('meal_type') === 'lunch' ? 'Обід' : 'Сніданок'}
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
                {...form.register('cycle_week')}
                readOnly={!allowValueEdits}
                aria-invalid={isFocusedField(validationFocus, 'cycle_week') ? 'true' : 'false'}
                className="nf-input"
              />
            ) : (
              <ReadonlyFieldValue value={form.getValues('cycle_week')} />
            )}
            {form.formState.errors.cycle_week && isFocusedField(validationFocus, 'cycle_week') ? (
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
                {...form.register('starts_on')}
                readOnly={!allowValueEdits}
                aria-invalid={isFocusedField(validationFocus, 'starts_on') ? 'true' : 'false'}
                className="nf-input"
              />
            ) : (
              <ReadonlyFieldValue value={form.getValues('starts_on')} />
            )}
            {form.formState.errors.starts_on && isFocusedField(validationFocus, 'starts_on') ? (
              <p role="alert" className="nf-field-error">
                {form.formState.errors.starts_on.message}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Для нового меню автоматично обирається найближчий наступний понеділок:{' '}
                {effectiveStartDate}.
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
                {...form.register('notes')}
                readOnly={!allowValueEdits}
                className="nf-input min-h-24"
              />
            ) : (
              <ReadonlyFieldValue value={form.getValues('notes')} multiline />
            )}
            {form.formState.errors.notes && isFocusedField(validationFocus, 'notes') ? (
              <p role="alert" className="nf-field-error">
                {form.formState.errors.notes.message}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section ref={daySectionRef} className="nf-panel scroll-mt-24">
        <div className="nf-panel-header">
          <div>
            <h2 className="nf-panel-title">Дні тижня</h2>
            <p className="mt-1 text-xs text-slate-600">
              {allowStructureEdits
                ? 'Додавайте або прибирайте дні та керуйте кількістю страв.'
                : 'Кількість рядків фіксована. Для шкільного акаунта всі поля доступні лише для перегляду.'}
            </p>
          </div>
        </div>
        <div className="nf-panel-body space-y-4">
          <div className="flex flex-wrap gap-2">
            {daysFieldArray.fields.map((field, index) => {
              const day = watchedDays[index];
              const resolvedDayDate = resolveEffectiveDayDate(
                watchedStartDate,
                WEEKDAY_ORDER.indexOf(day?.weekday ?? 'monday'),
                day?.date
              );

              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => setActiveDayIndex(index)}
                  className={`border px-3 py-2 text-left ${
                    index === safeActiveDayIndex
                      ? 'border-(--nf-brand-dark) bg-(--nf-brand) text-white'
                      : 'border-(--nf-line) bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm font-bold">
                    {WEEKDAY_LABELS[day?.weekday ?? 'monday']}
                  </div>
                  <div
                    className={`text-xs ${
                      index === safeActiveDayIndex ? 'text-white/80' : 'text-slate-500'
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
          !Array.isArray(form.formState.errors.days) &&
          isFocusedField(validationFocus, 'days') ? (
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
              validationFocus={
                validationFocus?.dayIndex === safeActiveDayIndex
                  ? {
                      fieldPath: validationFocus.fieldPath,
                      itemIndex: validationFocus.itemIndex,
                    }
                  : null
              }
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
          {nextDay ? (
            <button type="button" onClick={goToNextDay} className="nf-button nf-button-secondary">
              Наступний день: {WEEKDAY_LABELS[nextDay.weekday]}
            </button>
          ) : null}
          <button type="submit" disabled={saving} className="nf-button nf-button-primary">
            {saving ? 'Зберігаємо…' : submitLabel}
          </button>
          {form.formState.isDirty ? (
            <p className="text-xs text-slate-600">Є незбережені зміни у поточній формі.</p>
          ) : (
            <p className="text-xs text-slate-600">Зміни синхронізовані з останнім збереженням.</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-600">
          Шкільний акаунт бачить лише опубліковане меню без можливості редагування.
        </p>
      )}
    </form>
  );
}

function getFirstValidationFocus(
  errors: FieldErrors<WeeklyMenuFormValues>
): Omit<ValidationFocus, 'serial'> | null {
  if (errors.title) {
    return { fieldPath: 'title' };
  }
  if (errors.cycle_week) {
    return { fieldPath: 'cycle_week' };
  }
  if (errors.starts_on) {
    return { fieldPath: 'starts_on' };
  }
  if (errors.notes) {
    return { fieldPath: 'notes' };
  }

  if (errors.days && !Array.isArray(errors.days)) {
    return { fieldPath: 'days' };
  }

  if (!Array.isArray(errors.days)) {
    return null;
  }

  for (const [dayIndex, dayError] of errors.days.entries()) {
    if (!dayError) {
      continue;
    }
    if (dayError.date) {
      return { fieldPath: `days.${dayIndex}.date`, dayIndex };
    }
    if (dayError.notes) {
      return { fieldPath: `days.${dayIndex}.notes`, dayIndex };
    }
    if (!Array.isArray(dayError.items)) {
      continue;
    }

    for (const [itemIndex, itemError] of dayError.items.entries()) {
      if (!itemError) {
        continue;
      }

      const basePath = `days.${dayIndex}.items.${itemIndex}`;
      if (itemError.name) {
        return { fieldPath: `${basePath}.name`, dayIndex, itemIndex };
      }
      if (Array.isArray(itemError.portions)) {
        for (const [portionIndex, portionError] of itemError.portions.entries()) {
          if (!portionError) {
            continue;
          }

          const portionPath = `${basePath}.portions.${portionIndex}`;
          if (portionError.yield_amount) {
            return { fieldPath: `${portionPath}.yield_amount`, dayIndex, itemIndex };
          }
          if (portionError.nutrition?.kcal) {
            return { fieldPath: `${portionPath}.nutrition.kcal`, dayIndex, itemIndex };
          }
          if (portionError.nutrition?.proteins) {
            return { fieldPath: `${portionPath}.nutrition.proteins`, dayIndex, itemIndex };
          }
          if (portionError.nutrition?.fats) {
            return { fieldPath: `${portionPath}.nutrition.fats`, dayIndex, itemIndex };
          }
          if (portionError.nutrition?.carbs) {
            return { fieldPath: `${portionPath}.nutrition.carbs`, dayIndex, itemIndex };
          }
        }
      }
      if (itemError.notes) {
        return { fieldPath: `${basePath}.notes`, dayIndex, itemIndex };
      }

      return { fieldPath: basePath, dayIndex, itemIndex };
    }
  }

  return null;
}

function isFocusedField(validationFocus: ValidationFocus | null, fieldPath: string) {
  return validationFocus?.fieldPath === fieldPath;
}

function getFieldElementId(fieldPath: string) {
  if (fieldPath === 'title') {
    return 'weekly-menu-title';
  }
  if (fieldPath === 'cycle_week') {
    return 'weekly-menu-cycle-week';
  }
  if (fieldPath === 'starts_on') {
    return 'weekly-menu-starts-on';
  }
  if (fieldPath === 'notes') {
    return 'weekly-menu-notes';
  }

  const dayDateMatch = /^days\.(\d+)\.date$/.exec(fieldPath);
  if (dayDateMatch) {
    return `day-date-${dayDateMatch[1]}`;
  }

  return null;
}

function runAfterFrame(callback: () => void) {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback);
    return;
  }

  window.setTimeout(callback, 0);
}
