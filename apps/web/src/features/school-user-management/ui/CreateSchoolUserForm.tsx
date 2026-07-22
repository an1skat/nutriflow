'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { getApiErrorMessage } from '@/shared/api/HttpClient';

import {
  type CreateSchoolUserFormValues,
  createSchoolUserFormSchema,
} from '../model/SchoolUserFormSchemas';
import { useCreateSchoolUser } from '../model/UseSchoolUserMutations';

export function CreateSchoolUserForm({ schoolId }: { schoolId: string }) {
  const createUser = useCreateSchoolUser(schoolId);
  const form = useForm<CreateSchoolUserFormValues>({
    resolver: zodResolver(createSchoolUserFormSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');

    try {
      await createUser.mutateAsync(values);
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
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label htmlFor="new-user-username" className="nf-label">
            Логін
          </label>
          <input
            id="new-user-username"
            autoComplete="off"
            {...form.register('username')}
            className="nf-input"
          />
          {form.formState.errors.username ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.username.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="new-user-email" className="nf-label">
            Email, необов’язково
          </label>
          <input
            id="new-user-email"
            type="email"
            autoComplete="off"
            {...form.register('email')}
            className="nf-input"
          />
          {form.formState.errors.email ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.email.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="new-user-password" className="nf-label">
            Початковий пароль
          </label>
          <input
            id="new-user-password"
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
      </div>

      {form.formState.errors.root ? (
        <p role="alert" className="nf-error">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {createUser.isSuccess ? (
        <p role="status" className="nf-success">
          Користувача створено.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="nf-button nf-button-primary"
      >
        {form.formState.isSubmitting ? 'Створюємо…' : 'Створити користувача'}
      </button>
    </form>
  );
}
