'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';

import {
  type AllergenFormValues,
  allergenFormSchema,
  orNull,
} from '../model/RecipeManagementSchemas';
import { useCreateAllergen } from '../model/UseRecipeMutations';

export function CreateAllergenForm({ onCreated }: { onCreated?: () => void }) {
  const create = useCreateAllergen();
  const form = useForm<AllergenFormValues>({
    resolver: zodResolver(allergenFormSchema),
    defaultValues: { code: '', name: '', description: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    try {
      await create.mutateAsync({
        code: values.code,
        name: values.name,
        description: orNull(values.description),
      });
      form.reset({ code: '', name: '', description: '' });
      onCreated?.();
    } catch (error) {
      form.setError('root', { type: 'server', message: getApiErrorMessage(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[100px_1fr_auto]">
      <div>
        <label htmlFor="allergen-code" className="nf-label">
          Код
        </label>
        <input id="allergen-code" className="nf-input uppercase" {...form.register('code')} />
        {form.formState.errors.code ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.code.message}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="allergen-name" className="nf-label">
          Назва
        </label>
        <input id="allergen-name" className="nf-input" {...form.register('name')} />
        {form.formState.errors.name ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.name.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col">
        <span className="nf-label invisible hidden sm:block" aria-hidden="true">
          &nbsp;
        </span>
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="nf-button nf-button-primary"
        >
          {form.formState.isSubmitting ? <LoadingSpinner size="sm" label="Додаємо…" /> : 'Додати'}
        </button>
      </div>
      <div className="sm:col-span-3">
        <label htmlFor="allergen-description" className="nf-label">
          Опис
        </label>
        <input id="allergen-description" className="nf-input" {...form.register('description')} />
      </div>
      {form.formState.errors.root ? (
        <p role="alert" className="nf-error sm:col-span-3">
          {form.formState.errors.root.message}
        </p>
      ) : null}
    </form>
  );
}
