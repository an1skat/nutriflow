'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';

import { type SchoolFormValues, schoolFormSchema } from '../model/SchoolFormSchema';
import { useCreateSchool } from '../model/UseSchoolMutations';

export function CreateSchoolForm() {
  const createSchool = useCreateSchool();
  const form = useForm<SchoolFormValues>({
    resolver: zodResolver(schoolFormSchema),
    defaultValues: {
      name: '',
      code: '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');

    try {
      await createSchool.mutateAsync(values);
      form.reset();
    } catch (error) {
      form.setError('root', {
        type: 'server',
        message: getApiErrorMessage(error),
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_180px_auto]">
      <div>
        <label htmlFor="school-name" className="nf-label">
          Назва школи
        </label>
        <input id="school-name" {...form.register('name')} className="nf-input" />
        {form.formState.errors.name ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.name.message}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="school-code" className="nf-label">
          Код
        </label>
        <input id="school-code" {...form.register('code')} className="nf-input uppercase" />
        {form.formState.errors.code ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.code.message}
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
          {form.formState.isSubmitting ? (
            <LoadingSpinner size="sm" label="Створюємо…" />
          ) : (
            'Створити школу'
          )}
        </button>
      </div>

      {form.formState.errors.root ? (
        <p role="alert" className="nf-error sm:col-span-3">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {createSchool.isSuccess ? (
        <p role="status" className="nf-success sm:col-span-3">
          Школу створено.
        </p>
      ) : null}
    </form>
  );
}
