import type { UseFormReturn } from 'react-hook-form';

import type {
  Allergen,
  DishCard,
  DishCardVersion,
  Ingredient,
  PortionVariant,
} from '@/entities/recipe/model/Recipe';
import { normalizeGramAmount } from '@/shared/lib/Portion';

import type { WeeklyMenuFormValues } from '../../model/WeeklyMenuFormSchema';

export function applyDishCardSelection(
  form: UseFormReturn<WeeklyMenuFormValues>,
  dayIndex: number,
  itemIndex: number,
  dishCard: DishCard
) {
  form.setValue(`days.${dayIndex}.items.${itemIndex}.kind`, 'dish_card', {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.dish_card_id`, dishCard.id, {
    shouldDirty: true,
  });
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.dish_card_version_id`,
    dishCard.current_version_id,
    { shouldDirty: true }
  );
  form.setValue(`days.${dayIndex}.items.${itemIndex}.recipe_card_number`, dishCard.card_number, {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.source_text`, dishCard.source ?? '', {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.name`, dishCard.name, {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.product_ingredient_id`, null, {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.product_name_snapshot`, '', {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.allergen_codes`, [], {
    shouldDirty: true,
  });
}

export function applyIngredientSelection(
  form: UseFormReturn<WeeklyMenuFormValues>,
  dayIndex: number,
  itemIndex: number,
  ingredient: Ingredient
) {
  form.setValue(`days.${dayIndex}.items.${itemIndex}.kind`, 'product', {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.product_ingredient_id`, ingredient.id, {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.product_name_snapshot`, ingredient.name, {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.name`, ingredient.name, {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.source_text`, 'пром. вироб.', {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.dish_card_id`, null, {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.dish_card_version_id`, null, {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.recipe_card_number`, '', {
    shouldDirty: true,
  });
  form.setValue(`days.${dayIndex}.items.${itemIndex}.allergen_codes`, [], {
    shouldDirty: true,
  });
}
type PortionVariantResolution = {
  variant: PortionVariant;
  factor: number;
  isScaled: boolean;
};

function findExactPortionVariantByYield(
  variants: PortionVariant[],
  yieldAmount: string,
  preferredVariantId: string | null
) {
  const target = normalizeGramAmount(yieldAmount);

  if (target === null) {
    return variants.find((variant) => variant.id === preferredVariantId) ?? null;
  }

  const outputMatches = variants.filter(
    (variant) => normalizeGramAmount(variant.output_grams) === target
  );

  const portionMatches = variants.filter(
    (variant) => normalizeGramAmount(variant.portion_grams) === target
  );

  for (const matches of [outputMatches, portionMatches]) {
    const preferred = matches.find((variant) => variant.id === preferredVariantId);

    if (preferred) {
      return preferred;
    }

    if (matches[0]) {
      return matches[0];
    }
  }

  return null;
}

export function resolvePortionVariantByYield(
  variants: PortionVariant[],
  yieldAmount: string,
  preferredVariantId: string | null
): PortionVariantResolution | null {
  const target = normalizeGramAmount(yieldAmount);
  if (target === null || target <= 0) {
    return null;
  }

  const exact = findExactPortionVariantByYield(variants, yieldAmount, preferredVariantId);
  if (exact) {
    return { variant: exact, factor: 1, isScaled: false };
  }

  const candidates = variants
    .map((variant) => ({
      variant,
      output: normalizeGramAmount(variant.output_grams),
    }))
    .filter(
      (candidate): candidate is { variant: PortionVariant; output: number } =>
        candidate.output !== null && candidate.output > 0
    )
    .sort(
      (left, right) =>
        Math.abs(left.output - target) - Math.abs(right.output - target) ||
        right.output - left.output
    );

  const nearest = candidates[0];
  if (!nearest) {
    return null;
  }

  return {
    variant: nearest.variant,
    factor: target / nearest.output,
    isScaled: true,
  };
}
export function syncNutritionFromVersion(
  form: UseFormReturn<WeeklyMenuFormValues>,
  dayIndex: number,
  itemIndex: number,
  item: WeeklyMenuFormValues['days'][number]['items'][number],
  version: DishCardVersion
) {
  item.portions.forEach((portion, portionIndex) => {
    const resolution = resolvePortionVariantByYield(
      version.portion_variants,
      portion.yield_amount,
      portion.dish_card_portion_variant_id ?? portion.calculated_from?.portion_variant_id ?? null
    );

    applyVariantToPortion(
      form,
      dayIndex,
      itemIndex,
      portionIndex,
      portion.yield_amount,
      resolution ?? undefined
    );
  });
}

export function syncAllergensFromVersion(
  form: UseFormReturn<WeeklyMenuFormValues>,
  dayIndex: number,
  itemIndex: number,
  currentCodes: string[],
  version: DishCardVersion,
  allergenOptions: Allergen[]
) {
  if (currentCodes.length || !version.allergen_ids.length || !allergenOptions.length) {
    return;
  }

  const allergenById = new Map(allergenOptions.map((allergen) => [allergen.id, allergen.code]));
  const resolvedCodes = version.allergen_ids
    .map((allergenId) => allergenById.get(allergenId))
    .filter((value): value is string => Boolean(value));

  if (!resolvedCodes.length) {
    return;
  }

  form.setValue(`days.${dayIndex}.items.${itemIndex}.allergen_codes`, [...new Set(resolvedCodes)], {
    shouldDirty: false,
  });
}

function applyVariantToPortion(
  form: UseFormReturn<WeeklyMenuFormValues>,
  dayIndex: number,
  itemIndex: number,
  portionIndex: number,
  currentYieldAmount: string,
  resolution: PortionVariantResolution | undefined
) {
  const variant = resolution?.variant;
  const nutrition = resolution?.isScaled
    ? {
        kcal: scaleNutritionValue(variant?.nutrition.kcal, resolution.factor),
        proteins: scaleNutritionValue(variant?.nutrition.proteins, resolution.factor),
        fats: scaleNutritionValue(variant?.nutrition.fats, resolution.factor),
        carbs: scaleNutritionValue(variant?.nutrition.carbs, resolution.factor),
      }
    : variant?.nutrition;

  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.dish_card_portion_variant_id`,
    resolution && !resolution.isScaled ? (variant?.id ?? null) : null
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.calculated_from`,
    resolution?.isScaled && variant
      ? {
          portion_variant_id: variant.id,
          yield_amount: variant.output_grams,
        }
      : null
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.nutrition.kcal`,
    nutrition?.kcal ?? ''
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.nutrition.proteins`,
    nutrition?.proteins ?? ''
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.nutrition.fats`,
    nutrition?.fats ?? ''
  );
  form.setValue(
    `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.nutrition.carbs`,
    nutrition?.carbs ?? ''
  );

  if (!currentYieldAmount.trim() && variant?.output_grams) {
    form.setValue(
      `days.${dayIndex}.items.${itemIndex}.portions.${portionIndex}.yield_amount`,
      variant.output_grams,
      { shouldDirty: true }
    );
  }
}

function scaleNutritionValue(value: string | undefined, factor: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '';
  }

  const scaled = Math.round((numericValue * factor + Number.EPSILON) * 100) / 100;
  return String(scaled);
}
