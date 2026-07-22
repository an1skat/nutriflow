'use client';

import { useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import type { Ingredient } from '@/entities/recipe/model/Recipe';
import { getApiErrorMessage } from '@/shared/api/HttpClient';

import {
  type IngredientEditFormValues,
  ingredientEditFormSchema,
  parseAliases,
} from '../model/RecipeManagementSchemas';
import { useUpdateIngredient } from '../model/UseRecipeMutations';

type EditIngredientFormProps = {
  ingredient: Ingredient;
  onSaved?: () => void;
};

export function EditIngredientForm({ ingredient, onSaved }: EditIngredientFormProps) {
  const update = useUpdateIngredient();
  const form = useForm<IngredientEditFormValues>({
    resolver: zodResolver(ingredientEditFormSchema),
    defaultValues: {
      name: ingredient.name,
      unit: ingredient.unit,
      aliases: ingredient.aliases.join(', '),
      is_active: ingredient.is_active,
    },
  });

  useEffect(() => {
    form.reset({
      name: ingredient.name,
      unit: ingredient.unit,
      aliases: ingredient.aliases.join(', '),
      is_active: ingredient.is_active,
    });
  }, [form, ingredient]);

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    try {
      await update.mutateAsync({
        id: ingredient.id,
        payload: {
          ...values,
          aliases: parseAliases(values.aliases),
        },
      });
      onSaved?.();
    } catch (error) {
      form.setError('root', {
        type: 'server',
        message: getApiErrorMessage(error),
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
        <div>
          <label htmlFor="edit-ingredient-name" className="nf-label">
            Назва
          </label>
          <input id="edit-ingredient-name" className="nf-input" {...form.register('name')} />
          {form.formState.errors.name ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.name.message}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="edit-ingredient-unit" className="nf-label">
            Одиниця
          </label>
          <input id="edit-ingredient-unit" className="nf-input" {...form.register('unit')} />
          {form.formState.errors.unit ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.unit.message}
            </p>
          ) : null}
        </div>
      </div>
      <div>
        <label htmlFor="edit-ingredient-aliases" className="nf-label">
          Аліаси (через кому)
        </label>
        <input
          id="edit-ingredient-aliases"
          className="nf-input"
          placeholder="морква, морква свіжа"
          {...form.register('aliases')}
        />
      </div>
      <label className="nf-checkbox-row">
        <input type="checkbox" {...form.register('is_active')} className="mt-0.5 size-4" />
        <span>
          <span className="block text-sm font-bold">Інгредієнт активний</span>
          <span className="block text-xs text-slate-600">
            Деактивація приховує інгредієнт із пошуку, не видаляючи його з наявних техкарт.
          </span>
        </span>
      </label>
      {form.formState.errors.root ? (
        <p role="alert" className="nf-error">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {update.isSuccess ? (
        <p role="status" className="nf-success">
          Зміни збережено.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="nf-button nf-button-primary"
      >
        {form.formState.isSubmitting ? 'Зберігаємо…' : 'Зберегти зміни'}
      </button>
    </form>
  );
}
