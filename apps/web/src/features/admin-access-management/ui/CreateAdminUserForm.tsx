'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';

import { getApiErrorMessage } from '@/shared/api/HttpClient';

import {
  type CreateAdminUserFormValues,
  adminPermissionOptions,
  createAdminUserSchema,
  defaultLowerAdminPermissions,
} from '../model/AdminAccessSchemas';
import { useCreateAdminUser } from '../model/UseAdminAccessMutations';

export function CreateAdminUserForm() {
  const createAdminUser = useCreateAdminUser();
  const form = useForm<CreateAdminUserFormValues>({
    resolver: zodResolver(createAdminUserSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      role: 'ADMIN',
      permissions: defaultLowerAdminPermissions,
    },
  });
  const role = useWatch({ control: form.control, name: 'role' });

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');

    try {
      await createAdminUser.mutateAsync(values);
      form.reset({
        username: '',
        email: '',
        password: '',
        role: 'ADMIN',
        permissions: defaultLowerAdminPermissions,
      });
    } catch (error) {
      form.setError('root', {
        type: 'server',
        message: getApiErrorMessage(error),
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label htmlFor="admin-username" className="nf-label">
            Логін
          </label>
          <input
            id="admin-username"
            {...form.register('username')}
            className="nf-input"
            autoComplete="off"
          />
          {form.formState.errors.username ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.username.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="admin-email" className="nf-label">
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            {...form.register('email')}
            className="nf-input"
            autoComplete="off"
          />
          {form.formState.errors.email ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.email.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="admin-password" className="nf-label">
            Пароль
          </label>
          <input
            id="admin-password"
            type="password"
            {...form.register('password')}
            className="nf-input"
            autoComplete="new-password"
          />
          {form.formState.errors.password ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.password.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="admin-role" className="nf-label">
            Роль
          </label>
          <select
            id="admin-role"
            {...form.register('role', {
              onChange: (event) => {
                const nextRole = event.target.value;
                form.setValue(
                  'permissions',
                  nextRole === 'TECHNOLOGIST' ? [] : defaultLowerAdminPermissions,
                  { shouldValidate: true }
                );
              },
            })}
            className="nf-input"
          >
            <option value="ADMIN">Адміністратор</option>
            <option value="TECHNOLOGIST">Технолог</option>
          </select>
        </div>
      </div>

      {role === 'ADMIN' ? (
        <fieldset>
          <legend className="nf-label">Права доступу</legend>
          <div className="grid gap-2 md:grid-cols-2">
            {adminPermissionOptions.map((permission) => (
              <label
                key={permission.value}
                className="flex min-h-16 gap-3 border border-[var(--nf-line)] bg-white p-3 text-sm"
              >
                <input
                  type="checkbox"
                  value={permission.value}
                  {...form.register('permissions')}
                  className="mt-1 size-4"
                />
                <span>
                  <span className="block font-bold text-slate-900">{permission.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-600">
                    {permission.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {form.formState.errors.permissions ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.permissions.message}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {form.formState.errors.root ? (
        <p role="alert" className="nf-error">
          {form.formState.errors.root.message}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="nf-button nf-button-primary"
        >
          {form.formState.isSubmitting
            ? 'Створюємо…'
            : role === 'TECHNOLOGIST'
              ? 'Створити технолога'
              : 'Створити адміністратора'}
        </button>
      </div>

      {createAdminUser.isSuccess ? (
        <p role="status" className="nf-success">
          {role === 'TECHNOLOGIST' ? 'Технолога створено.' : 'Адміністратора створено.'}
        </p>
      ) : null}
    </form>
  );
}
