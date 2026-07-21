"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import {
  validateDishCardVersion,
} from "@/entities/recipe/api/RecipeApi";
import { useAllergens } from "@/entities/recipe/api/RecipeQueries";
import type { DishCardVersion } from "@/entities/recipe/model/Recipe";
import { getApiErrorMessage } from "@/shared/api/HttpClient";
import { createObjectId } from "@/shared/lib/ObjectId";
import { FormField as Field, FormSection as Section } from "@/shared/ui/FormLayout";

import {
  dishCardVersionFormSchema,
  orNull,
  orZero,
  type DishCardVersionFormValues,
  type VersionPortionFormValues,
} from "../model/DishCardVersionSchema";
import {
  useConfirmDishCardVersion,
  useCreateDishCardVersion,
  useUpdateDishCardVersion,
} from "../model/UseRecipeMutations";

const NUTRITION_FIELDS = ["kcal", "proteins", "fats", "carbs"] as const;

function isZeroDecimal(value: string | null | undefined): boolean {
  return value === null || value === undefined || Number(value) === 0;
}

function isUnknownNutrition(
  nutrition: DishCardVersion["portion_variants"][number]["nutrition"],
): boolean {
  return NUTRITION_FIELDS.every((field) => isZeroDecimal(nutrition[field]));
}

function nutritionFormValue(
  nutrition: DishCardVersion["portion_variants"][number]["nutrition"],
  field: (typeof NUTRITION_FIELDS)[number],
): string {
  return isUnknownNutrition(nutrition) ? "" : (nutrition[field] ?? "0");
}

function isBlankNutrition(portion: VersionPortionFormValues | undefined): boolean {
  if (!portion) {
    return false;
  }
  return NUTRITION_FIELDS.every((field) => portion[field].trim() === "");
}

function versionToFormValues(version: DishCardVersion): DishCardVersionFormValues {
  return {
    technology_text: version.technology_text ?? "",
    allergen_ids: version.allergen_ids,
    portions: version.portion_variants.map((p) => ({
      tempId: p.id,
      id: p.id,
      portion_grams: p.portion_grams ?? p.output_grams,
      kcal: nutritionFormValue(p.nutrition, "kcal"),
      proteins: nutritionFormValue(p.nutrition, "proteins"),
      fats: nutritionFormValue(p.nutrition, "fats"),
      carbs: nutritionFormValue(p.nutrition, "carbs"),
      normative_contributions: p.normative_contributions,
    })),
    ingredients: Array.from(
      new Map(
        version.ingredient_amounts.map((a) => [
          a.ingredient_name_snapshot,
          {
            tempId: createObjectId(),
            ingredient_id: a.ingredient_id,
            ingredient_name_snapshot: a.ingredient_name_snapshot,
            notes: a.notes ?? "",
            amounts: {} as Record<string, { gross: string; net: string }>,
          },
        ]),
      ).values(),
    ).map((row) => {
      for (const a of version.ingredient_amounts) {
        if (
          a.ingredient_name_snapshot === row.ingredient_name_snapshot
        ) {
          row.amounts[a.portion_variant_id] = {
            gross: a.gross_amount,
            net: a.net_amount,
          };
        }
      }
      return row;
    }),
  };
}

function emptyValues(): DishCardVersionFormValues {
  return {
    technology_text: "",
    allergen_ids: [],
    portions: [
      {
        tempId: createObjectId(),
        portion_grams: "120",
        kcal: "",
        proteins: "",
        fats: "",
        carbs: "",
        normative_contributions: [],
      },
    ],
    ingredients: [
      {
        tempId: createObjectId(),
        ingredient_id: null,
        ingredient_name_snapshot: "",
        notes: "",
        amounts: {},
      },
    ],
  };
}

type DishCardVersionFormProps = {
  dishCardId: string;
  version?: DishCardVersion;
  mode: "create" | "edit";
  onDone?: () => void;
};

export function DishCardVersionForm({
  dishCardId,
  version,
  mode,
  onDone,
}: DishCardVersionFormProps) {
  const isImmutable =
    mode === "edit" &&
    version !== undefined &&
    (version.status === "confirmed" || version.status === "archived");

  const allergenQuery = useAllergens("");
  const createVersion = useCreateDishCardVersion(dishCardId);
  const updateVersion = useUpdateDishCardVersion();
  const confirmVersion = useConfirmDishCardVersion();
  const [status, setStatus] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const form = useForm<DishCardVersionFormValues>({
    resolver: zodResolver(dishCardVersionFormSchema),
    defaultValues: version ? versionToFormValues(version) : emptyValues(),
  });

  const portions = useFieldArray({ control: form.control, name: "portions" });
  const ingredients = useFieldArray({ control: form.control, name: "ingredients" });
  const allergens = allergenQuery.data?.items ?? [];
  const selectedAllergenIds =
    useWatch({ control: form.control, name: "allergen_ids" }) ?? [];
  const watchedPortions =
    useWatch({ control: form.control, name: "portions" }) ?? [];

  const toggleAllergen = (id: string) => {
    const current = form.getValues("allergen_ids");
    form.setValue(
      "allergen_ids",
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
      { shouldDirty: true },
    );
  };

  const addPortion = () =>
    portions.append({
      tempId: createObjectId(),
      portion_grams: "",
      kcal: "",
      proteins: "",
      fats: "",
      carbs: "",
      normative_contributions: [],
    });
  const addIngredient = () =>
    ingredients.append({
      tempId: createObjectId(),
      ingredient_id: null,
      ingredient_name_snapshot: "",
      notes: "",
      amounts: {},
    });
  const buildPayload = (values: DishCardVersionFormValues) => ({
    technology_text: orNull(values.technology_text),
    allergen_ids: values.allergen_ids,
    portion_variants: values.portions.map((p) => ({
      id: p.id ?? p.tempId,
      age_group: null,
      portion_grams: p.portion_grams,
      output_grams: p.portion_grams,
      nutrition: {
        kcal: orZero(p.kcal),
        proteins: orZero(p.proteins),
        fats: orZero(p.fats),
        carbs: orZero(p.carbs),
      },
      normative_contributions: p.normative_contributions,
    })),
    ingredient_amounts: values.ingredients.flatMap((ingredient) =>
      values.portions.map((portion) => ({
        ingredient_id: ingredient.ingredient_id,
        ingredient_name_snapshot: ingredient.ingredient_name_snapshot,
        gross_amount: ingredient.amounts[portion.tempId].gross,
        net_amount: ingredient.amounts[portion.tempId].net,
        unit: "g",
        amount_basis: "per_portion" as const,
        portion_variant_id: portion.id ?? portion.tempId,
        notes: orNull(ingredient.notes),
      })),
    ),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors("root");
    setStatus(null);
    try {
      if (mode === "create") {
        const created = await createVersion.mutateAsync(buildPayload(values));
        setStatus(`Версію ${created.version} створено (draft).`);
        toast.success("Версію створено");
        onDone?.();
      } else if (version) {
        const updated = await updateVersion.mutateAsync({
          id: version.id,
          payload: buildPayload(values),
        });
        setStatus(`Версію ${updated.version} оновлено.`);
        toast.success("Версію оновлено");
        onDone?.();
      }
    } catch (error) {
      form.setError("root", { type: "server", message: getApiErrorMessage(error) });
    }
  });

  const handleConfirm = async () => {
    if (!version) return;
    setConfirmError(null);
    try {
      const validation = await validateDishCardVersion(version.id);
      if (validation.blocking_errors.length > 0) {
        setConfirmError(validation.blocking_errors[0]?.message ?? "Блокуючі помилки.");
        return;
      }
      await confirmVersion.mutateAsync(version.id);
      setStatus("Версію підтверджено.");
      toast.success("Версію підтверджено");
      onDone?.();
    } catch (error) {
      setConfirmError(getApiErrorMessage(error));
    }
  };

  const isBusy =
    form.formState.isSubmitting ||
    createVersion.isPending ||
    updateVersion.isPending ||
    confirmVersion.isPending;

  if (isImmutable) {
    return (
      <div className="nf-panel">
        <div className="nf-panel-body">
          <p className="text-sm text-slate-700">
            Версія має статус <b>{version!.status}</b> і є незмінною. Створіть нову версію,
            щоб внести правки.
          </p>
          <Link
            href={`/admin/recipe/dish-cards/${dishCardId}/versions/new`}
            className="nf-button nf-button-primary mt-3 inline-flex"
          >
            Створити нову версію
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Section title="Алергени">
        {allergenQuery.isLoading ? (
          <p className="text-sm text-slate-500">Завантажуємо…</p>
        ) : allergens.length === 0 ? (
          <p className="text-sm text-slate-500">Аллергени відсутні.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allergens.map((a) => {
              const selected = selectedAllergenIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAllergen(a.id)}
                  className={`nf-button ${selected ? "nf-button-primary" : "nf-button-secondary"}`}
                  aria-pressed={selected}
                >
                  {a.code} — {a.name}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Технологія">
        <textarea
          className="nf-input min-h-24"
          rows={4}
          {...form.register("technology_text")}
        />
      </Section>

      <Section
        title="Порції та КБЖУ"
        action={
          <button type="button" onClick={addPortion} className="nf-button nf-button-secondary">
            <Plus className="size-4" aria-hidden /> Додати порцію
          </button>
        }
      >
        {form.formState.errors.portions?.message ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.portions.message}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          {portions.fields.map((field, index) => {
            const portionError = form.formState.errors.portions?.[index];
            const nutritionBlank = isBlankNutrition(watchedPortions[index]);

            return (
              <div key={field.id} className="border border-slate-200 bg-white p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="m-0 text-xs font-bold text-slate-700">
                    Порція {index + 1}
                  </p>
                  {nutritionBlank ? (
                    <span className="border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600">
                      КБЖУ не вказано
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-[120px_repeat(4,1fr)_auto]">
                  <Field
                    label="Маса, г"
                    error={portionError?.portion_grams?.message}
                  >
                    <input
                      className="nf-input"
                      placeholder="120"
                      aria-invalid={portionError?.portion_grams ? "true" : undefined}
                      {...form.register(`portions.${index}.portion_grams`)}
                    />
                  </Field>
                  <Field
                    label="Білки"
                    error={portionError?.proteins?.message as string | undefined}
                  >
                    <input
                      className="nf-input"
                      placeholder="0"
                      aria-invalid={portionError?.proteins ? "true" : undefined}
                      {...form.register(`portions.${index}.proteins`)}
                    />
                  </Field>
                  <Field
                    label="Жири"
                    error={portionError?.fats?.message as string | undefined}
                  >
                    <input
                      className="nf-input"
                      placeholder="0"
                      aria-invalid={portionError?.fats ? "true" : undefined}
                      {...form.register(`portions.${index}.fats`)}
                    />
                  </Field>
                  <Field
                    label="Вуглеводи"
                    error={portionError?.carbs?.message as string | undefined}
                  >
                    <input
                      className="nf-input"
                      placeholder="0"
                      aria-invalid={portionError?.carbs ? "true" : undefined}
                      {...form.register(`portions.${index}.carbs`)}
                    />
                  </Field>
                  <Field
                    label="ккал"
                    error={portionError?.kcal?.message as string | undefined}
                  >
                    <input
                      className="nf-input"
                      placeholder="0"
                      aria-invalid={portionError?.kcal ? "true" : undefined}
                      {...form.register(`portions.${index}.kcal`)}
                    />
                  </Field>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => portions.remove(index)}
                      className="nf-button nf-button-ghost"
                      aria-label="Видалити порцію"
                      disabled={portions.fields.length === 1}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="Інгредієнти"
        action={
          <button type="button" onClick={addIngredient} className="nf-button nf-button-secondary">
            <Plus className="size-4" aria-hidden /> Додати інгредієнт
          </button>
        }
      >
        {form.formState.errors.ingredients?.message ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.ingredients.message}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          {ingredients.fields.map((field, index) => (
            <IngredientRow
              key={field.id}
              index={index}
              portions={watchedPortions}
              register={form.register}
              errors={form.formState.errors.ingredients?.[index]}
              onRemove={ingredients.fields.length > 1 ? () => ingredients.remove(index) : undefined}
            />
          ))}
        </div>
      </Section>

      {form.formState.errors.root ? (
        <p role="alert" className="nf-error">{form.formState.errors.root.message}</p>
      ) : null}
      {status ? <p role="status" className="nf-success">{status}</p> : null}
      {confirmError ? <p role="alert" className="nf-error">{confirmError}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={isBusy} className="nf-button nf-button-primary">
          {isBusy ? "…" : mode === "create" ? "Створити версію (draft)" : "Зберегти версію"}
        </button>
        {mode === "edit" && version && version.status !== "confirmed" ? (
          <button type="button" onClick={() => void handleConfirm()} disabled={isBusy} className="nf-button nf-button-secondary">
            Підтвердити версію
          </button>
        ) : null}
        <Link href={`/admin/recipe/dish-cards/${dishCardId}`} className="nf-button nf-button-ghost">
          Назад до версій
        </Link>
      </div>
    </form>
  );
}

type IngredientRowProps = {
  index: number;
  portions: Pick<VersionPortionFormValues, "tempId" | "portion_grams">[];
  register: ReturnType<typeof useForm<DishCardVersionFormValues>>["register"];
  errors: unknown;
  onRemove: (() => void) | undefined;
};

function IngredientRow({
  index,
  portions,
  register,
  errors,
  onRemove,
}: IngredientRowProps) {
  return (
    <div className="border border-slate-200 bg-white p-3">
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field
            label="Назва інгредієнта"
            error={
              (errors as { ingredient_name_snapshot?: { message?: string } })
                ?.ingredient_name_snapshot?.message
            }
          >
            <input
              className="nf-input"
              placeholder="Морква свіжа"
              aria-invalid={
                (errors as { ingredient_name_snapshot?: unknown })?.ingredient_name_snapshot
                  ? "true"
                  : undefined
              }
              {...register(`ingredients.${index}.ingredient_name_snapshot`)}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              onClick={onRemove}
              className="nf-button nf-button-ghost"
              aria-label="Видалити інгредієнт"
              disabled={!onRemove}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <Field
          label="Примітка"
          error={(errors as { notes?: { message?: string } })?.notes?.message}
        >
          <input
            className="nf-input"
            placeholder="Оригінал брутто: 1/6 шт."
            aria-invalid={(errors as { notes?: unknown })?.notes ? "true" : undefined}
            {...register(`ingredients.${index}.notes`)}
          />
        </Field>

        <div>
          <p className="nf-label">Брутто / нетто на порцію, г</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {portions.map((portion) => (
              <AmountCell
                key={portion.tempId}
                index={index}
                portionTempId={portion.tempId}
                portionGrams={portion.portion_grams || "?"}
                register={register}
                error={amountError(errors, portion.tempId)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function amountError(errors: unknown, portionTempId: string): string | undefined {
  const amount = (
    errors as {
      amounts?: Record<
        string,
        {
          gross?: { message?: string };
          net?: { message?: string };
          message?: string;
        }
      >;
    }
  )?.amounts?.[portionTempId];

  return amount?.message ?? amount?.gross?.message ?? amount?.net?.message;
}

type AmountCellProps = {
  index: number;
  portionTempId: string;
  portionGrams: string;
  register: ReturnType<typeof useForm<DishCardVersionFormValues>>["register"];
  error: string | undefined;
};

function AmountCell({
  index,
  portionTempId,
  portionGrams,
  register,
  error,
}: AmountCellProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-600">Порція {portionGrams} г</span>
      <div className="grid grid-cols-2 gap-1">
        <input
          className="nf-input"
          placeholder="брутто"
          aria-label={`Брутто для порції ${portionGrams}`}
          aria-invalid={error ? "true" : undefined}
          {...register(`ingredients.${index}.amounts.${portionTempId}.gross`)}
        />
        <input
          className="nf-input"
          placeholder="нетто"
          aria-label={`Нетто для порції ${portionGrams}`}
          aria-invalid={error ? "true" : undefined}
          {...register(`ingredients.${index}.amounts.${portionTempId}.net`)}
        />
      </div>
      {error ? <p role="alert" className="nf-field-error">{error}</p> : null}
    </div>
  );
}
