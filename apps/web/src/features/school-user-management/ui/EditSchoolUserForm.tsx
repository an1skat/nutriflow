'use client';

import { useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import type { SchoolUser } from '@/entities/school-user/model/SchoolUser';
import { getApiErrorMessage } from '@/shared/api/HttpClient';

import {
  type EditSchoolUserFormValues,
  editSchoolUserFormSchema,
} from '../model/SchoolUserFormSchemas';
import { useUpdateSchoolUser } from '../model/UseSchoolUserMutations';

type EditSchoolUserFormProps = {
  schoolId: string;
  user: SchoolUser;
};

export function EditSchoolUserForm({ schoolId, user }: EditSchoolUserFormProps) {
  const updateUser = useUpdateSchoolUser(schoolId, user.id);
  const form = useForm<EditSchoolUserFormValues>({
    resolver: zodResolver(editSchoolUserFormSchema),
    defaultValues: {
      username: user.username,
      email: user.email ?? '',
      is_active: user.is_active,
    },
  });

  useEffect(() => {
    form.reset({
      username: user.username,
      email: user.email ?? '',
      is_active: user.is_active,
    });
  }, [form, user]);

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');

    try {
      await updateUser.mutateAsync(values);
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
          <label htmlFor={`username-${user.id}`} className="nf-label">
            Логін
          </label>
          <input id={`username-${user.id}`} {...form.register('username')} className="nf-input" />
          {form.formState.errors.username ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.username.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={`email-${user.id}`} className="nf-label">
            Email
          </label>
          <input
            id={`email-${user.id}`}
            type="email"
            {...form.register('email')}
            className="nf-input"
          />
          {form.formState.errors.email ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.email.message}
            </p>
          ) : null}
        </div>
      </div>

      <label className="nf-checkbox-row">
        <input type="checkbox" {...form.register('is_active')} className="mt-0.5 size-4" />
        <span>
          <span className="block text-sm font-bold">Обліковий запис активний</span>
          <span className="block text-xs text-slate-600">
            Деактивація негайно завершить поточні сесії користувача.
          </span>
        </span>
      </label>

      {form.formState.errors.root ? (
        <p role="alert" className="nf-error">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {updateUser.isSuccess ? (
        <p role="status" className="nf-success">
          Зміни збережено.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="nf-button nf-button-primary"
      >
        {form.formState.isSubmitting ? 'Зберігаємо…' : 'Зберегти'}
      </button>
    </form>
  );
}
