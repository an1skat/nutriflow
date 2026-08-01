'use client';

import { useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import type { Allergen } from '@/entities/recipe/model/Recipe';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';

import { type AllergenFormValues, allergenFormSchema } from '../model/RecipeManagementSchemas';
import { useUpdateAllergen } from '../model/UseRecipeMutations';

type EditAllergenFormProps = {
  allergen: Allergen;
  onSaved?: () => void;
};

export function EditAllergenForm({ allergen, onSaved }: EditAllergenFormProps) {
  const update = useUpdateAllergen();
  const form = useForm<AllergenFormValues>({
    resolver: zodResolver(allergenFormSchema),
    defaultValues: {
      code: allergen.code,
      name: allergen.name,
      description: allergen.description ?? '',
    },
  });

  useEffect(() => {
    form.reset({
      code: allergen.code,
      name: allergen.name,
      description: allergen.description ?? '',
    });
  }, [form, allergen]);

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    try {
      await update.mutateAsync({ id: allergen.id, payload: values });
      onSaved?.();
    } catch (error) {
      form.setError('root', { type: 'server', message: getApiErrorMessage(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[100px_1fr]">
        <div>
          <label htmlFor="edit-allergen-code" className="nf-label">
            Код
          </label>
          <input
            id="edit-allergen-code"
            className="nf-input uppercase"
            {...form.register('code')}
          />
          {form.formState.errors.code ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.code.message}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="edit-allergen-name" className="nf-label">
            Назва
          </label>
          <input id="edit-allergen-name" className="nf-input" {...form.register('name')} />
          {form.formState.errors.name ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.name.message}
            </p>
          ) : null}
        </div>
      </div>
      <div>
        <label htmlFor="edit-allergen-description" className="nf-label">
          Опис
        </label>
        <input
          id="edit-allergen-description"
          className="nf-input"
          {...form.register('description')}
        />
      </div>
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
        {form.formState.isSubmitting ? (
          <LoadingSpinner size="sm" label="Зберігаємо…" />
        ) : (
          'Зберегти зміни'
        )}
      </button>
    </form>
  );
}
