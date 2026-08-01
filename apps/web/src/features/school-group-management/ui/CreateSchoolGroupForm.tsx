'use client';

import { useEffect, useMemo } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import {
  type AgeGroup,
  type SchoolGroup,
  ageGroupLabels,
  ageGroupOptions,
} from '@/entities/school-group/model/SchoolGroup';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';

import { type SchoolGroupFormValues, schoolGroupFormSchema } from '../model/SchoolGroupFormSchemas';
import { useRestoreSchoolGroup } from '../model/UseSchoolGroupMutations';

type CreateSchoolGroupFormProps = {
  schoolId: string;
  groups: SchoolGroup[];
};

export function CreateSchoolGroupForm({ schoolId, groups }: CreateSchoolGroupFormProps) {
  const inactiveGroups = groups.filter((group) => !group.is_active);
  const groupsByAge = useMemo(
    () =>
      Object.fromEntries(inactiveGroups.map((group) => [group.age_group, group.id])) as Partial<
        Record<AgeGroup, string>
      >,
    [inactiveGroups]
  );
  const availableOptions = useMemo(
    () => ageGroupOptions.filter((option) => groupsByAge[option.value]),
    [groupsByAge]
  );
  const restoreGroup = useRestoreSchoolGroup(schoolId, groupsByAge);
  const firstAvailableAge = availableOptions[0]?.value ?? '6-11';
  const hasAvailableOptions = availableOptions.length > 0;
  const form = useForm<SchoolGroupFormValues>({
    resolver: zodResolver(schoolGroupFormSchema),
    defaultValues: {
      name: hasAvailableOptions ? ageGroupLabels[firstAvailableAge] : '',
      age_group: firstAvailableAge,
    },
  });
  const ageGroupField = form.register('age_group');

  useEffect(() => {
    form.reset({
      name: hasAvailableOptions ? ageGroupLabels[firstAvailableAge] : '',
      age_group: firstAvailableAge,
    });
  }, [firstAvailableAge, form, hasAvailableOptions]);

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');

    try {
      await restoreGroup.mutateAsync(values);
      form.reset({
        name: hasAvailableOptions ? ageGroupLabels[firstAvailableAge] : '',
        age_group: firstAvailableAge,
      });
    } catch (error) {
      form.setError('root', {
        type: 'server',
        message: getApiErrorMessage(error),
      });
    }
  });

  if (availableOptions.length === 0) {
    return (
      <div className="nf-empty">
        Усі стандартні вікові групи вже активні. Нові довільні групи бекенд поки не створює.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="new-group-age" className="nf-label">
            Вікова група
          </label>
          <select
            id="new-group-age"
            {...ageGroupField}
            onChange={(event) => {
              void ageGroupField.onChange(event);
              form.setValue('name', ageGroupLabels[event.target.value as AgeGroup], {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
            className="nf-input"
          >
            {availableOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {form.formState.errors.age_group ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.age_group.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="new-group-name" className="nf-label">
            Назва групи
          </label>
          <input id="new-group-name" {...form.register('name')} className="nf-input" />
          {form.formState.errors.name ? (
            <p role="alert" className="nf-field-error">
              {form.formState.errors.name.message}
            </p>
          ) : null}
        </div>
      </div>

      {form.formState.errors.root ? (
        <p role="alert" className="nf-error">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {restoreGroup.isSuccess ? (
        <p role="status" className="nf-success">
          Групу додано до активних.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="nf-button nf-button-primary"
      >
        {form.formState.isSubmitting ? (
          <LoadingSpinner size="sm" label="Додаємо…" />
        ) : (
          'Додати групу'
        )}
      </button>
    </form>
  );
}
