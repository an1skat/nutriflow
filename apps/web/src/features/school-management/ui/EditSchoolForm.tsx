'use client';

import { useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import type { School } from '@/entities/school/model/School';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';

import { type EditSchoolFormValues, editSchoolFormSchema } from '../model/SchoolFormSchema';
import { useUpdateSchool } from '../model/UseSchoolMutations';

type EditSchoolFormProps = {
  school: School;
};

export function EditSchoolForm({ school }: EditSchoolFormProps) {
  const updateSchool = useUpdateSchool(school.id);
  const form = useForm<EditSchoolFormValues>({
    resolver: zodResolver(editSchoolFormSchema),
    defaultValues: {
      name: school.name,
      code: school.code,
      is_active: school.is_active,
    },
  });

  useEffect(() => {
    form.reset({
      name: school.name,
      code: school.code,
      is_active: school.is_active,
    });
  }, [form, school]);

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');

    try {
      await updateSchool.mutateAsync(values);
    } catch (error) {
      form.setError('root', {
        type: 'server',
        message: getApiErrorMessage(error),
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="edit-school-name" className="nf-label">
            Назва школи
          </label>
          <input id="edit-school-name" {...form.register('name')} className="nf-input" />
          {form.formState.errors.name ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.name.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="edit-school-code" className="nf-label">
            Код
          </label>
          <input id="edit-school-code" {...form.register('code')} className="nf-input uppercase" />
          {form.formState.errors.code ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.code.message}
            </p>
          ) : null}
        </div>
      </div>

      <label className="nf-checkbox-row">
        <input type="checkbox" {...form.register('is_active')} className="mt-0.5 size-4" />
        <span>
          <span className="block text-sm font-bold">Школа активна</span>
          <span className="block text-xs text-slate-600">
            Деактивація завершить сесії користувачів, але збереже школу, меню та вимоги.
          </span>
        </span>
      </label>

      {form.formState.errors.root ? (
        <p role="alert" className="nf-error">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {updateSchool.isSuccess ? (
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
