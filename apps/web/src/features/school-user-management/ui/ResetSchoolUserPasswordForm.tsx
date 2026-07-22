'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { getApiErrorMessage } from '@/shared/api/HttpClient';

import {
  type ResetSchoolUserPasswordFormValues,
  resetSchoolUserPasswordFormSchema,
} from '../model/SchoolUserFormSchemas';
import { useResetSchoolUserPassword } from '../model/UseSchoolUserMutations';

type ResetSchoolUserPasswordFormProps = {
  schoolId: string;
  userId: string;
};

export function ResetSchoolUserPasswordForm({
  schoolId,
  userId,
}: ResetSchoolUserPasswordFormProps) {
  const resetPassword = useResetSchoolUserPassword(schoolId, userId);
  const form = useForm<ResetSchoolUserPasswordFormValues>({
    resolver: zodResolver(resetSchoolUserPasswordFormSchema),
    defaultValues: {
      password: '',
      passwordConfirmation: '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');

    try {
      await resetPassword.mutateAsync(values.password);
      form.reset();
    } catch (error) {
      form.setError('root', {
        type: 'server',
        message: getApiErrorMessage(error),
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs leading-5 text-slate-600">
        Після зміни пароля всі поточні сесії користувача буде завершено.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`password-${userId}`} className="nf-label">
            Новий пароль
          </label>
          <input
            id={`password-${userId}`}
            type="password"
            autoComplete="new-password"
            {...form.register('password')}
            className="nf-input"
          />
          {form.formState.errors.password ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.password.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={`password-confirmation-${userId}`} className="nf-label">
            Повторіть пароль
          </label>
          <input
            id={`password-confirmation-${userId}`}
            type="password"
            autoComplete="new-password"
            {...form.register('passwordConfirmation')}
            className="nf-input"
          />
          {form.formState.errors.passwordConfirmation ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.passwordConfirmation.message}
            </p>
          ) : null}
        </div>
      </div>

      {form.formState.errors.root ? (
        <p role="alert" className="nf-error">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {resetPassword.isSuccess ? (
        <p role="status" className="nf-success">
          Пароль змінено.
        </p>
      ) : null}

      <button type="submit" disabled={form.formState.isSubmitting} className="nf-button">
        {form.formState.isSubmitting ? 'Змінюємо…' : 'Змінити пароль'}
      </button>
    </form>
  );
}
