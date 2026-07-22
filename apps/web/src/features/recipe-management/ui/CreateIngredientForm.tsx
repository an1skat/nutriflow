'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { getApiErrorMessage } from '@/shared/api/HttpClient';

import {
  type IngredientFormValues,
  ingredientFormSchema,
  parseAliases,
} from '../model/RecipeManagementSchemas';
import { useCreateIngredient } from '../model/UseRecipeMutations';

export function CreateIngredientForm({ onCreated }: { onCreated?: () => void }) {
  const create = useCreateIngredient();
  const form = useForm<IngredientFormValues>({
    resolver: zodResolver(ingredientFormSchema),
    defaultValues: { name: '', unit: 'g', aliases: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    try {
      await create.mutateAsync({
        name: values.name,
        unit: values.unit,
        aliases: parseAliases(values.aliases),
      });
      form.reset({ name: '', unit: 'g', aliases: '' });
      onCreated?.();
    } catch (error) {
      form.setError('root', { type: 'server', message: getApiErrorMessage(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_100px_auto]">
      <div>
        <label htmlFor="ingredient-name" className="nf-label">
          Назва
        </label>
        <input id="ingredient-name" className="nf-input" {...form.register('name')} />
        {form.formState.errors.name ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.name.message}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="ingredient-unit" className="nf-label">
          Одиниця
        </label>
        <input id="ingredient-unit" className="nf-input" {...form.register('unit')} />
        {form.formState.errors.unit ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.unit.message}
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
          {form.formState.isSubmitting ? '…' : 'Додати'}
        </button>
      </div>
      <div className="sm:col-span-3">
        <label htmlFor="ingredient-aliases" className="nf-label">
          Аліаси (через кому)
        </label>
        <input
          id="ingredient-aliases"
          className="nf-input"
          placeholder="морква, морква свіжа"
          {...form.register('aliases')}
        />
      </div>
      {form.formState.errors.root ? (
        <p role="alert" className="nf-error sm:col-span-3">
          {form.formState.errors.root.message}
        </p>
      ) : null}
    </form>
  );
}
