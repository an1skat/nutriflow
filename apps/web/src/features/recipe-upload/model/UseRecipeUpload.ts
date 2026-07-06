"use client";

import { useMutation } from "@tanstack/react-query";

import {
  confirmDishCardVersion,
  createAllergen,
  createDishCard,
  createDishCardVersion,
  createIngredient,
  fetchAllergens,
  fetchIngredients,
  validateDishCardVersion,
} from "@/entities/recipe/api/RecipeApi";
import { getApiErrorMessage } from "@/shared/api/HttpClient";

import { orNull, orZero, type RecipeUploadFormValues } from "./RecipeUploadSchema";

export type UploadProgress = {
  step:
    | "resolving-catalog"
    | "creating-card"
    | "creating-version"
    | "validating"
    | "confirming";
  message: string;
};

export type UploadResult = {
  dishCardId: string;
  versionId: string;
};

export class RecipeUploadError extends Error {
  constructor(message: string, readonly step: UploadProgress["step"]) {
    super(message);
    this.name = "RecipeUploadError";
  }
}

/**
 * Generate a 24-char hex id compatible with Beanie's PydanticObjectId.
 * The backend validates portion_variant_id / portion id as ObjectId, so a
 * crypto.randomUUID() (with dashes) is rejected. 24 random hex characters
 * parse cleanly as a BSON ObjectId.
 */
function newObjectId(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 12; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeLookupText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function findAllergenByCode(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  const result = await fetchAllergens(normalizedCode);
  return result.items.find((item) => item.code.toUpperCase() === normalizedCode) ?? null;
}

async function ensureAllergenId(code: string, name: string): Promise<string> {
  const existing = await findAllergenByCode(code);
  if (existing) {
    return existing.id;
  }

  try {
    const created = await createAllergen({ code, name });
    return created.id;
  } catch (error) {
    const afterConflict = await findAllergenByCode(code);
    if (afterConflict) {
      return afterConflict.id;
    }
    throw error;
  }
}

async function findIngredientByNameAndUnit(name: string, unit: string) {
  const normalizedName = normalizeLookupText(name);
  const normalizedUnit = normalizeLookupText(unit);
  const result = await fetchIngredients(name);
  return (
    result.items.find(
      (item) =>
        item.normalized_name === normalizedName &&
        normalizeLookupText(item.unit) === normalizedUnit,
    ) ?? null
  );
}

async function ensureIngredientId(name: string, unit: string): Promise<string> {
  const existing = await findIngredientByNameAndUnit(name, unit);
  if (existing) {
    return existing.id;
  }

  try {
    const created = await createIngredient({ name, unit, aliases: [] });
    return created.id;
  } catch (error) {
    const afterConflict = await findIngredientByNameAndUnit(name, unit);
    if (afterConflict) {
      return afterConflict.id;
    }
    throw error;
  }
}

async function resolveCatalogReferences(values: RecipeUploadFormValues) {
  const allergenIds = new Set(values.selected_allergen_ids);
  const seenAllergenCodes = new Set<string>();

  for (const allergen of values.allergens) {
    const code = allergen.code.trim();
    const normalizedCode = code.toUpperCase();
    if (seenAllergenCodes.has(normalizedCode)) {
      continue;
    }
    seenAllergenCodes.add(normalizedCode);
    allergenIds.add(await ensureAllergenId(code, allergen.name.trim()));
  }

  const ingredientIdsByTempId: Record<string, string> = {};
  const ingredientIdsByName = new Map<string, string>();

  for (const ingredient of values.ingredients) {
    const name = ingredient.ingredient_name_snapshot.trim();
    const key = `${normalizeLookupText(name)}|g`;
    let ingredientId = ingredientIdsByName.get(key);
    if (!ingredientId) {
      ingredientId = await ensureIngredientId(name, "g");
      ingredientIdsByName.set(key, ingredientId);
    }
    ingredientIdsByTempId[ingredient.tempId] = ingredientId;
  }

  return {
    allergenIds: Array.from(allergenIds),
    ingredientIdsByTempId,
  };
}

function buildVersionPayload(
  values: RecipeUploadFormValues,
  portionIds: Record<string, string>,
  catalogReferences: Awaited<ReturnType<typeof resolveCatalogReferences>>,
) {
  return {
    technology_text: orNull(values.technology_text),
    allergen_ids: catalogReferences.allergenIds,
    portion_variants: values.portions.map((portion) => ({
      id: portionIds[portion.tempId],
      age_group: null,
      portion_grams: portion.portion_grams,
      output_grams: portion.portion_grams,
      nutrition: {
        kcal: orZero(portion.kcal),
        proteins: orZero(portion.proteins),
        fats: orZero(portion.fats),
        carbs: orZero(portion.carbs),
      },
    })),
    ingredient_amounts: values.ingredients.flatMap((ingredient) =>
      values.portions.map((portion) => ({
        ingredient_id: catalogReferences.ingredientIdsByTempId[ingredient.tempId],
        ingredient_name_snapshot: ingredient.ingredient_name_snapshot,
        group_key: orNull(ingredient.group_key),
        alternative_label: orNull(ingredient.alternative_label),
        gross_amount: ingredient.amounts[portion.tempId].gross,
        net_amount: ingredient.amounts[portion.tempId].net,
        unit: "g",
        amount_basis: "per_portion" as const,
        portion_variant_id: portionIds[portion.tempId],
        notes: orNull(ingredient.notes),
      })),
    ),
  };
}

async function uploadDishCard(
  values: RecipeUploadFormValues,
  onProgress: (progress: UploadProgress) => void,
): Promise<UploadResult> {
  onProgress({ step: "resolving-catalog", message: "Оновлюємо довідники…" });
  const catalogReferences = await resolveCatalogReferences(values);

  onProgress({ step: "creating-card", message: "Створюємо картку страви…" });
  const dishCard = await createDishCard({
    card_number: values.card_number,
    name: values.name,
    category: orNull(values.category),
    source: orNull(values.source),
  });

  // Allocate stable portion ids upfront so ingredient amounts can reference them.
  // Must be 24-char hex (PydanticObjectId-compatible); crypto.randomUUID() is rejected.
  const portionIds: Record<string, string> = {};
  for (const portion of values.portions) {
    portionIds[portion.tempId] = newObjectId();
  }

  onProgress({ step: "creating-version", message: "Зберігаємо версію техкарти…" });
  const version = await createDishCardVersion(
    dishCard.id,
    buildVersionPayload(values, portionIds, catalogReferences),
  );

  onProgress({ step: "validating", message: "Перевіряємо техкарту…" });
  const validation = await validateDishCardVersion(version.id);
  if (validation.blocking_errors.length > 0) {
    throw new RecipeUploadError(
      validation.blocking_errors[0]?.message ?? "Техкарта має блокуючі помилки.",
      "validating",
    );
  }

  onProgress({ step: "confirming", message: "Підтверджуємо техкарту…" });
  await confirmDishCardVersion(version.id);

  return { dishCardId: dishCard.id, versionId: version.id };
}

export function useUploadDishCard() {
  return useMutation({
    mutationFn: ({
      values,
      onProgress,
    }: {
      values: RecipeUploadFormValues;
      onProgress: (progress: UploadProgress) => void;
    }) => uploadDishCard(values, onProgress),
  });
}

export { getApiErrorMessage };
