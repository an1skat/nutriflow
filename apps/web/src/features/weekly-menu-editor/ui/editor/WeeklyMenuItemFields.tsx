'use client';

import { useDeferredValue, useEffect, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { type UseFormRegisterReturn, type UseFormReturn, useWatch } from 'react-hook-form';

import {
  dishCardQueryOptions,
  dishCardVersionQueryOptions,
  dishCardsQueryOptions,
  ingredientsQueryOptions,
} from '@/entities/recipe/api/RecipeQueries';
import type { Allergen } from '@/entities/recipe/model/Recipe';

import type { WeeklyMenuFormValues } from '../../model/WeeklyMenuFormSchema';
import {
  applyDishCardProductSelection,
  applyDishCardSelection,
  applyIngredientSelection,
  syncAllergensFromVersion,
  syncNutritionFromVersion,
} from './WeeklyMenuItemMappers';

export function DishCardLookupField({
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
  const [query, setQuery] = useState('');
  const [isLookupOpen, setIsLookupOpen] = useState(!item?.dish_card_id);
  const deferredQuery = useDeferredValue(query);
  const dishCards = useQuery({
    ...dishCardsQueryOptions(deferredQuery),
    enabled,
  });

  const selectedLabel = item?.recipe_card_number
    ? `${item.recipe_card_number} · ${item.name || 'Без назви'}`
    : item?.name || '';

  return (
    <div className="space-y-2">
      <label className="nf-label" htmlFor={`dish-card-lookup-${dayIndex}-${itemIndex}`}>
        Техкарта
      </label>
      {enabled ? (
        item?.dish_card_id && !isLookupOpen ? (
          <div className="flex items-center justify-between gap-3 border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                Техкарту обрано
              </p>
              <p className="text-sm font-medium text-slate-900">{selectedLabel}</p>
            </div>
            <button
              type="button"
              disabled={readOnly}
              className="nf-button nf-button-secondary shrink-0"
              onClick={() => setIsLookupOpen(true)}
            >
              Змінити техкарту
            </button>
          </div>
        ) : (
          <>
            <input
              id={`dish-card-lookup-${dayIndex}-${itemIndex}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Пошук ТК за номером або назвою"
              disabled={readOnly}
              className="nf-input"
            />
            <div className="max-h-56 overflow-y-auto border border-(--nf-line) bg-white">
              {dishCards.isPending ? (
                <div className="px-3 py-2 text-sm text-slate-600">Завантажуємо техкарти…</div>
              ) : null}
              {dishCards.data?.items.map((dishCard) => (
                <button
                  key={dishCard.id}
                  type="button"
                  disabled={readOnly}
                  className="block w-full border-b border-(--nf-line) px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                  onClick={() => {
                    applyDishCardSelection(form, dayIndex, itemIndex, dishCard);
                    setQuery('');
                    setIsLookupOpen(false);
                  }}
                >
                  <div className="text-sm font-bold text-slate-900">{dishCard.card_number}</div>
                  <div className="text-sm text-slate-700">{dishCard.name}</div>
                  {dishCard.source ? (
                    <div className="text-xs text-slate-500">{dishCard.source}</div>
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
        )
      ) : (
        <p className="text-xs text-slate-600">
          {readOnly
            ? 'Для шкільного акаунта довідник техкарт у цьому режимі не відкривається.'
            : 'Каталог техкарт недоступний для цієї ролі. Можна редагувати назву та номер вручну у додаткових полях.'}
        </p>
      )}
    </div>
  );
}
export function IngredientLookupField({
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
  const [query, setQuery] = useState('');
  const [isLookupOpen, setIsLookupOpen] = useState(!item?.product_ingredient_id);
  const deferredQuery = useDeferredValue(query);
  const ingredients = useQuery({
    ...ingredientsQueryOptions(deferredQuery),
    enabled,
  });
  const selectedLabel = item?.product_name_snapshot || item?.name || '';

  return (
    <div className="space-y-2">
      <label className="nf-label" htmlFor={`ingredient-lookup-${dayIndex}-${itemIndex}`}>
        Промисловий виріб
      </label>
      {enabled ? (
        item?.product_ingredient_id && !isLookupOpen ? (
          <div className="flex items-center justify-between gap-3 border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                Промисловий виріб обрано
              </p>
              <p className="text-sm font-medium text-slate-900">{selectedLabel}</p>
            </div>
            <button
              type="button"
              disabled={readOnly}
              className="nf-button nf-button-secondary shrink-0"
              onClick={() => setIsLookupOpen(true)}
            >
              Змінити пром. виріб
            </button>
          </div>
        ) : (
          <>
            <input
              id={`ingredient-lookup-${dayIndex}-${itemIndex}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Пошук інгредієнта або готового виробу"
              disabled={readOnly}
              className="nf-input"
            />
            <div className="max-h-56 overflow-y-auto border border-(--nf-line) bg-white">
              {ingredients.isPending ? (
                <div className="px-3 py-2 text-sm text-slate-600">Завантажуємо інгредієнти…</div>
              ) : null}
              {ingredients.data?.items.map((ingredient) => (
                <button
                  key={ingredient.id}
                  type="button"
                  disabled={readOnly}
                  className="block w-full border-b border-(--nf-line) px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                  onClick={() => {
                    applyIngredientSelection(form, dayIndex, itemIndex, ingredient);
                    setQuery('');
                    setIsLookupOpen(false);
                  }}
                >
                  <div className="text-sm font-bold text-slate-900">{ingredient.name}</div>
                  <div className="text-xs text-slate-500">Одиниця: {ingredient.unit}</div>
                </button>
              ))}
              {ingredients.data && ingredients.data.items.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-600">
                  За цим пошуком інгредієнтів не знайдено.
                </div>
              ) : null}
            </div>
          </>
        )
      ) : (
        <p className="text-xs text-slate-600">
          {readOnly
            ? 'Для шкільного акаунта довідник інгредієнтів у цьому режимі не відкривається.'
            : 'Каталог інгредієнтів недоступний для цієї ролі. Назву можна ввести вручну.'}
        </p>
      )}
    </div>
  );
}

export function DishCardProductSelect({
  form,
  dayIndex,
  itemIndex,
  readOnly,
}: {
  form: UseFormReturn<WeeklyMenuFormValues>;
  dayIndex: number;
  itemIndex: number;
  readOnly: boolean;
}) {
  const item = useWatch({
    control: form.control,
    name: `days.${dayIndex}.items.${itemIndex}` as const,
  });
  const versionId = item?.dish_card_version_id ?? '';
  const version = useQuery(dishCardVersionQueryOptions(versionId));
  const productNames = [
    ...new Set(
      version.data?.ingredient_amounts.map((amount) => amount.ingredient_name_snapshot) ?? []
    ),
  ].sort((left, right) => left.localeCompare(right, 'uk'));
  const selectedName = productNames.includes(item?.name ?? '') ? item?.name : '';

  return (
    <select
      id={`day-${dayIndex}-item-${itemIndex}-name`}
      aria-label="Назва позиції"
      value={selectedName}
      disabled={readOnly || version.isPending}
      className="nf-input"
      onChange={(event) => {
        if (event.target.value && version.data) {
          applyDishCardProductSelection(
            form,
            dayIndex,
            itemIndex,
            event.target.value,
            version.data
          );
        }
      }}
    >
      <option value="">{version.isPending ? 'Завантажуємо продукти…' : 'Оберіть продукт'}</option>
      {productNames.map((productName) => (
        <option key={productName} value={productName}>
          {productName}
        </option>
      ))}
    </select>
  );
}

export function MenuItemReferenceSync({
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
  const dishCardId = item?.kind === 'dish_card' ? (item.dish_card_id ?? '') : '';
  const versionId = item?.kind === 'dish_card' ? (item.dish_card_version_id ?? '') : '';
  const portionYieldSignature =
    item?.portions.map((portion) => portion.yield_amount.trim()).join('|') ?? '';

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
      item?.kind !== 'dish_card' ||
      !dishCard.data ||
      item.dish_card_version_id ||
      !dishCard.data.current_version_id
    ) {
      return;
    }

    form.setValue(
      `days.${dayIndex}.items.${itemIndex}.dish_card_version_id`,
      dishCard.data.current_version_id,
      { shouldDirty: true }
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
    if (item?.kind !== 'product') {
      return;
    }

    const currentItem = form.getValues(`days.${dayIndex}.items.${itemIndex}` as const);
    currentItem.portions.forEach((_portion, portionIndex) => {
      form.setValue(
        `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.dish_card_portion_variant_id`,
        null
      );
      form.setValue(
        `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.calculated_from`,
        null
      );
    });
  }, [dayIndex, form, item?.kind, itemIndex]);

  useEffect(() => {
    if (!resolveReferences || item?.kind !== 'dish_card' || !dishCardVersion.data) {
      return;
    }

    const currentItem = form.getValues(`days.${dayIndex}.items.${itemIndex}` as const);
    syncNutritionFromVersion(form, dayIndex, itemIndex, currentItem, dishCardVersion.data);
    syncAllergensFromVersion(
      form,
      dayIndex,
      itemIndex,
      currentItem.allergen_codes,
      dishCardVersion.data,
      allergenOptions
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

export function NutritionCell({
  value,
  label,
  registration,
  error,
}: {
  value: string | undefined;
  label: string;
  registration?: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <td className="text-sm text-slate-700">
      {registration ? (
        <>
          <input
            aria-label={label}
            inputMode="decimal"
            {...registration}
            aria-invalid={error ? 'true' : 'false'}
            className="nf-input min-w-20"
          />
          {error ? (
            <p role="alert" className="nf-field-error">
              {error}
            </p>
          ) : null}
        </>
      ) : value?.trim() ? (
        value
      ) : (
        '—'
      )}
    </td>
  );
}

export function AllergenCheckboxList({
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
  const selectedOptions = options.filter((allergen) => selectedCodeSet.has(allergen.code));

  if (readOnly) {
    if (!selectedCodes.length) {
      return <ReadonlyFieldValue value={null} emptyLabel="Не вказано" />;
    }

    return (
      <div
        id={itemId}
        className="flex flex-wrap gap-2 rounded border border-dashed border-(--nf-line) bg-slate-50 p-3"
      >
        {(selectedOptions.length ? selectedOptions : selectedCodes).map((item) => {
          if (typeof item === 'string') {
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
              <span className="font-medium text-slate-900">{item.code}</span> {item.name}
            </span>
          );
        })}
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
              readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-white'
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
              <span className="font-medium text-slate-900">{allergen.code}</span> {allergen.name}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function ReadonlyReferenceField({
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
      <p className="text-xs text-slate-500">Поле доступне лише для перегляду.</p>
    </div>
  );
}

export function ReadonlyFieldValue({
  value,
  emptyLabel = 'Не вказано',
  multiline = false,
}: {
  value: string | number | null | undefined;
  emptyLabel?: string;
  multiline?: boolean;
}) {
  const hasValue = value !== null && value !== undefined && `${value}`.trim().length > 0;

  return (
    <div
      className={`rounded border border-dashed border-(--nf-line) bg-slate-50 px-3 py-2 text-sm ${
        multiline ? 'whitespace-pre-wrap' : ''
      } ${hasValue ? 'text-slate-700' : 'text-slate-500'}`}
    >
      {hasValue ? value : emptyLabel}
    </div>
  );
}
