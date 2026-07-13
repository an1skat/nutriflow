"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { useAllergens } from "@/entities/recipe/api/RecipeQueries";
import { getApiErrorMessage } from "@/shared/api/HttpClient";
import { FormField as Field, FormSection as Section } from "@/shared/ui/FormLayout";

import {
  recipeUploadSchema,
  type RecipeUploadFormValues,
} from "../model/RecipeUploadSchema";
import {
  useUploadDishCard,
  type UploadProgress,
} from "../model/UseRecipeUpload";

function newPortionTempId(): string {
  return `portion-${Math.random().toString(36).slice(2, 9)}`;
}

function newIngredientTempId(): string {
  return `ingredient-${Math.random().toString(36).slice(2, 9)}`;
}

const defaultValues: RecipeUploadFormValues = {
  card_number: "",
  name: "",
  category: "",
  source: "",
  technology_text: "",
  selected_allergen_ids: [],
  allergens: [],
  portions: [
    {
      tempId: newPortionTempId(),
      portion_grams: "120",
      kcal: "0",
      proteins: "0",
      fats: "0",
      carbs: "0",
    },
  ],
  ingredients: [
    {
      tempId: newIngredientTempId(),
      ingredient_name_snapshot: "",
      group_key: "",
      alternative_label: "",
      notes: "",
      amounts: {},
    },
  ],
};

const PROGRESS_LABELS: Record<UploadProgress["step"], string> = {
  "resolving-catalog": "Оновлюємо довідники…",
  "creating-card": "Створюємо картку страви…",
  "creating-version": "Зберігаємо версію техкарти…",
  validating: "Перевіряємо техкарту…",
  confirming: "Підтверджуємо техкарту…",
};

export function DishCardUploadForm() {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const upload = useUploadDishCard();
  const allergenQuery = useAllergens("");

  const form = useForm<RecipeUploadFormValues>({
    resolver: zodResolver(recipeUploadSchema),
    defaultValues,
  });

  const portions = useFieldArray({ control: form.control, name: "portions" });
  const allergenEntries = useFieldArray({ control: form.control, name: "allergens" });
  const ingredients = useFieldArray({
    control: form.control,
    name: "ingredients",
  });

  const allergens = allergenQuery.data?.items ?? [];
  const selectedAllergenIds = useWatch({
    control: form.control,
    name: "selected_allergen_ids",
  });

  const toggleAllergen = (id: string) => {
    const current = form.getValues("selected_allergen_ids");
    const next = current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id];
    form.setValue("selected_allergen_ids", next, { shouldDirty: true });
  };

  const addAllergen = () => {
    allergenEntries.append({ code: "", name: "" });
  };

  const addPortion = () => {
    portions.append({
      tempId: newPortionTempId(),
      portion_grams: "",
      kcal: "0",
      proteins: "0",
      fats: "0",
      carbs: "0",
    });
  };

  const addIngredient = () => {
    ingredients.append({
      tempId: newIngredientTempId(),
      ingredient_name_snapshot: "",
      group_key: "",
      alternative_label: "",
      notes: "",
      amounts: {},
    });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors("root");
    setSuccess(null);

    try {
      const result = await upload.mutateAsync({
        values,
        onProgress: setProgress,
      });
      setSuccess(
        `Техкарту збережено та підтверджено. Картка ${result.dishCardId}, версія ${result.versionId}.`,
      );
      form.reset(defaultValues);
      toast.success("Техкарту завантажено");
    } catch (error) {
      form.setError("root", {
        type: "server",
        message: getApiErrorMessage(error),
      });
    } finally {
      setProgress(null);
    }
  });

  const isBusy = form.formState.isSubmitting || upload.isPending;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      <Section title="Основне">
        <Field label="Номер техкарти" error={form.formState.errors.card_number?.message}>
          <input
            id="card-number"
            className="nf-input"
            placeholder="1.17"
            {...form.register("card_number")}
          />
        </Field>
        <Field label="Назва страви" error={form.formState.errors.name?.message}>
          <input
            id="dish-name"
            className="nf-input"
            placeholder="Салат з моркви та яблук…"
            {...form.register("name")}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Категорія" error={form.formState.errors.category?.message as string | undefined}>
            <input
              id="dish-category"
              className="nf-input"
              placeholder="холодні страви"
              {...form.register("category")}
            />
          </Field>
          <Field label="Джерело" error={form.formState.errors.source?.message as string | undefined}>
            <input
              id="dish-source"
              className="nf-input"
              placeholder="ТК до весняного меню…"
              {...form.register("source")}
            />
          </Field>
        </div>
        <Field
          label="Технологія приготування"
          error={form.formState.errors.technology_text?.message as string | undefined}
        >
          <textarea
            id="dish-technology"
            className="nf-input min-h-24"
            rows={4}
            {...form.register("technology_text")}
          />
        </Field>
        <Field
          label="Алергени з довідника"
          error={form.formState.errors.selected_allergen_ids?.message}
        >
          {allergenQuery.isLoading ? (
            <p className="text-sm text-slate-500">Завантажуємо алергени…</p>
          ) : allergens.length === 0 ? (
            <p className="text-sm text-slate-500">Алергени відсутні у довіднику.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allergens.map((allergen) => {
                const selected = selectedAllergenIds.includes(allergen.id);
                return (
                  <button
                    key={allergen.id}
                    type="button"
                    onClick={() => toggleAllergen(allergen.id)}
                    className={`nf-button ${
                      selected ? "nf-button-primary" : "nf-button-secondary"
                    }`}
                    aria-pressed={selected}
                  >
                    {allergen.code} — {allergen.name}
                  </button>
                );
              })}
            </div>
          )}
        </Field>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="nf-label">Нові алергени для цієї техкарти</span>
            <button
              type="button"
              onClick={addAllergen}
              className="nf-button nf-button-secondary"
            >
              <Plus className="size-4" aria-hidden /> Додати алерген
            </button>
          </div>
          {allergenEntries.fields.length === 0 ? (
            <p className="text-sm text-slate-500">Якщо алергенів немає, залиште список порожнім.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {allergenEntries.fields.map((field, index) => (
                <div key={field.id} className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                  <Field
                    label="Код"
                    error={form.formState.errors.allergens?.[index]?.code?.message}
                  >
                    <input
                      className="nf-input"
                      placeholder="ГЦ"
                      {...form.register(`allergens.${index}.code`)}
                    />
                  </Field>
                  <Field
                    label="Назва"
                    error={form.formState.errors.allergens?.[index]?.name?.message}
                  >
                    <input
                      className="nf-input"
                      placeholder="гірчиця"
                      {...form.register(`allergens.${index}.name`)}
                    />
                  </Field>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => allergenEntries.remove(index)}
                      className="nf-button nf-button-ghost"
                      aria-label="Видалити алерген"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Порції"
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
          {portions.fields.map((field, index) => (
            <div key={field.id} className="nf-panel">
              <div className="nf-panel-body grid gap-3 sm:grid-cols-[120px_repeat(4,1fr)_auto]">
                <Field
                  label="Маса, г"
                  error={form.formState.errors.portions?.[index]?.portion_grams?.message}
                >
                  <input
                    className="nf-input"
                    placeholder="120"
                    {...form.register(`portions.${index}.portion_grams`)}
                  />
                </Field>
                <Field
                  label="Білки"
                  error={form.formState.errors.portions?.[index]?.proteins?.message as string | undefined}
                >
                  <input
                    className="nf-input"
                    placeholder="1.18"
                    {...form.register(`portions.${index}.proteins`)}
                  />
                </Field>
                <Field
                  label="Жири"
                  error={form.formState.errors.portions?.[index]?.fats?.message as string | undefined}
                >
                  <input
                    className="nf-input"
                    placeholder="4.27"
                    {...form.register(`portions.${index}.fats`)}
                  />
                </Field>
                <Field
                  label="Вуглеводи"
                  error={form.formState.errors.portions?.[index]?.carbs?.message as string | undefined}
                >
                  <input
                    className="nf-input"
                    placeholder="11.03"
                    {...form.register(`portions.${index}.carbs`)}
                  />
                </Field>
                <Field
                  label="ккал"
                  error={form.formState.errors.portions?.[index]?.kcal?.message as string | undefined}
                >
                  <input
                    className="nf-input"
                    placeholder="82.8"
                    {...form.register(`portions.${index}.kcal`)}
                  />
                </Field>
                <div className="flex items-end">
                  {portions.fields.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => portions.remove(index)}
                      className="nf-button nf-button-ghost"
                      aria-label="Видалити порцію"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Інгредієнти"
        action={
          <button
            type="button"
            onClick={addIngredient}
            className="nf-button nf-button-secondary"
          >
            <Plus className="size-4" aria-hidden /> Додати інгредієнт
          </button>
        }
      >
        {form.formState.errors.ingredients?.message ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.ingredients.message}
          </p>
        ) : null}
        <div className="flex flex-col gap-4">
          {ingredients.fields.map((field, index) => (
            <IngredientRow
              key={field.id}
              index={index}
              portions={portions.fields}
              register={form.register}
              errors={form.formState.errors.ingredients?.[index]}
              onRemove={ingredients.fields.length > 1 ? () => ingredients.remove(index) : undefined}
            />
          ))}
        </div>
      </Section>

      {form.formState.errors.root ? (
        <p role="alert" className="nf-error">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="nf-success">
          {success}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={isBusy} className="nf-button nf-button-primary">
          {isBusy ? "Зберігаємо…" : "Зберегти та підтвердити техкарту"}
        </button>
        {progress ? (
          <span role="status" className="text-sm text-slate-600">
            {PROGRESS_LABELS[progress.step] ?? progress.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

type IngredientRowProps = {
  index: number;
  portions: { id: string; tempId: string; portion_grams: string }[];
  register: ReturnType<typeof useForm<RecipeUploadFormValues>>["register"];
  errors: Record<string, unknown> | undefined;
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
    <div className="nf-panel">
      <div className="nf-panel-body flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_160px_160px_auto]">
          <Field
            label="Назва інгредієнта"
            error={(errors as { ingredient_name_snapshot?: { message?: string } })?.ingredient_name_snapshot?.message}
          >
            <input
              className="nf-input"
              placeholder="Морква свіжа до 01.01"
              {...register(`ingredients.${index}.ingredient_name_snapshot`)}
            />
          </Field>
          <Field
            label="Група альтернатив"
            error={(errors as { group_key?: { message?: string } })?.group_key?.message as string | undefined}
          >
            <input
              className="nf-input"
              placeholder="carrot-season"
              {...register(`ingredients.${index}.group_key`)}
            />
          </Field>
          <Field
            label="Варіант"
            error={(errors as { alternative_label?: { message?: string } })?.alternative_label?.message as string | undefined}
          >
            <input
              className="nf-input"
              placeholder="до 01.01"
              {...register(`ingredients.${index}.alternative_label`)}
            />
          </Field>
          <div className="flex items-end">
            {onRemove ? (
              <button
                type="button"
                onClick={onRemove}
                className="nf-button nf-button-ghost"
                aria-label="Видалити інгредієнт"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        <Field
          label="Примітка"
          error={(errors as { notes?: { message?: string } })?.notes?.message as string | undefined}
        >
          <input
            className="nf-input"
            placeholder="Оригінал брутто: 1/6 шт."
            {...register(`ingredients.${index}.notes`)}
          />
        </Field>

        <div>
          <p className="nf-label">Брутто / нетто на порцію, г</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {portions.map((portion) => (
              <AmountCell
                key={portion.id}
                index={index}
                portionTempId={portion.tempId}
                portionGrams={portion.portion_grams || "?"}
                register={register}
                error={(errors as { amounts?: Record<string, { message?: string }> })?.amounts?.[portion.tempId]?.message}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type AmountCellProps = {
  index: number;
  portionTempId: string;
  portionGrams: string;
  register: ReturnType<typeof useForm<RecipeUploadFormValues>>["register"];
  error: string | undefined;
};

function AmountCell({ index, portionTempId, portionGrams, register, error }: AmountCellProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-600">Порція {portionGrams} г</span>
      <div className="grid grid-cols-2 gap-1">
        <input
          className="nf-input"
          placeholder="брутто"
          aria-label={`Брутто для порції ${portionGrams}`}
          {...register(`ingredients.${index}.amounts.${portionTempId}.gross`)}
        />
        <input
          className="nf-input"
          placeholder="нетто"
          aria-label={`Нетто для порції ${portionGrams}`}
          {...register(`ingredients.${index}.amounts.${portionTempId}.net`)}
        />
      </div>
      {error ? <p role="alert" className="nf-field-error">{error}</p> : null}
    </div>
  );
}
