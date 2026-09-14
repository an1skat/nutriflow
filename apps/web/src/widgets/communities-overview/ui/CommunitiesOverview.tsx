'use client';

import { useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { type UseFormReturn, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  useCommunities,
  useCommunityAdminOptions,
  useCommunitySchoolOptions,
} from '@/entities/community/api/CommunityQueries';
import type {
  Community,
  CommunityAdminOption,
  CommunitySchoolOption,
} from '@/entities/community/model/Community';
import { useCurrentUser } from '@/entities/session/api/SessionQueries';
import { hasPermission } from '@/features/access/model/AccessPolicy';
import {
  type CommunityFormValues,
  communityFormSchema,
} from '@/features/community-management/model/CommunityFormSchema';
import {
  useAddCommunitySchool,
  useCreateCommunity,
  useRemoveCommunitySchool,
  useUpdateCommunity,
} from '@/features/community-management/model/UseCommunityMutations';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';
import { PaginationControls } from '@/shared/ui/PaginationControls';
import { RequestError } from '@/shared/ui/RequestError';

const PAGE_SIZE = 20;

export function CommunitiesOverview() {
  const [offset, setOffset] = useState(0);
  const currentUser = useCurrentUser();
  const user = currentUser.data;
  const canEdit = user ? hasPermission(user, 'schools.manage') : false;
  const canAssignAdmin = user?.role === 'OWNER';
  const communities = useCommunities({ offset, limit: PAGE_SIZE });
  const admins = useCommunityAdminOptions(canAssignAdmin);
  const schools = useCommunitySchoolOptions();

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Адміністрування</p>
        <h1 className="nf-title">Громади</h1>
        <p className="nf-description">
          Створюйте громади, призначайте адміністраторів і керуйте складом шкіл.
        </p>
      </header>

      {canEdit ? (
        <section aria-labelledby="create-community-heading" className="nf-panel">
          <div className="nf-panel-header">
            <h2 id="create-community-heading" className="nf-panel-title">
              Додати громаду
            </h2>
          </div>
          <div className="nf-panel-body">
            <CommunityForm
              admins={admins.data ?? []}
              canAssignAdmin={canAssignAdmin}
            />
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="community-list-heading"
        className={`nf-panel ${canEdit ? 'mt-5' : ''}`}
      >
        <div className="nf-panel-header">
          <div>
            <h2 id="community-list-heading" className="nf-panel-title">
              Список громад
            </h2>
            {communities.data ? (
              <p className="mt-0.5 text-xs text-slate-600">Записів: {communities.data.total}</p>
            ) : null}
          </div>
        </div>

        <div className="nf-panel-body">
          {communities.isPending || schools.isPending ? (
            <LoadingSpinner label="Завантажуємо громади…" />
          ) : null}
          {communities.isError ? (
            <RequestError error={communities.error} onRetry={() => void communities.refetch()} />
          ) : null}
          {schools.isError ? (
            <RequestError error={schools.error} onRetry={() => void schools.refetch()} />
          ) : null}
          {communities.data?.items.length === 0 ? (
            <div className="nf-empty">Громад ще немає.</div>
          ) : null}

          {communities.data?.items.length && schools.data ? (
            <div className="grid gap-4">
              {communities.data.items.map((community) => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  admins={admins.data ?? []}
                  schools={schools.data}
                  canEdit={canEdit}
                  canAssignAdmin={canAssignAdmin}
                />
              ))}
            </div>
          ) : null}

          {communities.data ? (
            <PaginationControls
              offset={offset}
              limit={PAGE_SIZE}
              total={communities.data.total}
              disabled={communities.isFetching}
              onOffsetChange={setOffset}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function CommunityForm({
  admins,
  canAssignAdmin,
}: {
  admins: CommunityAdminOption[];
  canAssignAdmin: boolean;
}) {
  const createCommunity = useCreateCommunity();
  const form = useForm<CommunityFormValues>({
    resolver: zodResolver(communityFormSchema),
    defaultValues: { code: '', name: '', admin_owner_id: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    try {
      await createCommunity.mutateAsync({
        ...values,
        admin_owner_id: values.admin_owner_id || null,
      });
      form.reset();
      toast.success('Громаду створено.');
    } catch (error) {
      form.setError('root', { type: 'server', message: getApiErrorMessage(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-3 lg:grid-cols-[1fr_1.4fr_1fr_auto]">
      <CommunityFields
        form={form}
        admins={admins}
        prefix="create"
        canAssignAdmin={canAssignAdmin}
      />
      <div className="flex flex-col">
        <span className="nf-label invisible hidden lg:block" aria-hidden="true">
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
            'Створити громаду'
          )}
        </button>
      </div>
      {form.formState.errors.root ? (
        <p role="alert" className="nf-error lg:col-span-4">
          {form.formState.errors.root.message}
        </p>
      ) : null}
    </form>
  );
}

function CommunityCard({
  community,
  admins,
  schools,
  canEdit,
  canAssignAdmin,
}: {
  community: Community;
  admins: CommunityAdminOption[];
  schools: CommunitySchoolOption[];
  canEdit: boolean;
  canAssignAdmin: boolean;
}) {
  const [schoolId, setSchoolId] = useState('');
  const updateCommunity = useUpdateCommunity(community.id);
  const addSchool = useAddCommunitySchool(community.id);
  const removeSchool = useRemoveCommunitySchool(community.id);
  const form = useForm<CommunityFormValues>({
    resolver: zodResolver(communityFormSchema),
    defaultValues: {
      code: community.code,
      name: community.name,
      admin_owner_id: community.admin_owner_id ?? '',
    },
  });
  const members = schools.filter((school) => school.community === community.code);
  const availableSchools = schools.filter((school) => school.community === null);

  useEffect(() => {
    form.reset({
      code: community.code,
      name: community.name,
      admin_owner_id: community.admin_owner_id ?? '',
    });
  }, [community, form]);

  const saveCommunity = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    try {
      await updateCommunity.mutateAsync(
        canAssignAdmin
          ? { name: values.name, admin_owner_id: values.admin_owner_id || null }
          : { name: values.name }
      );
      toast.success('Громаду оновлено.');
    } catch (error) {
      form.setError('root', { type: 'server', message: getApiErrorMessage(error) });
    }
  });

  const handleAddSchool = async () => {
    if (!schoolId) return;
    try {
      await addSchool.mutateAsync(schoolId);
      setSchoolId('');
      toast.success('Школу додано до громади.');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleRemoveSchool = async (memberSchoolId: string) => {
    try {
      await removeSchool.mutateAsync(memberSchoolId);
      toast.success('Школу вилучено з громади.');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <article className="border border-(--nf-line) bg-white p-4">
      {canEdit ? (
        <form onSubmit={saveCommunity} className="grid gap-3 lg:grid-cols-[1fr_1.4fr_1fr_auto]">
          <CommunityFields
            form={form}
            admins={admins}
            prefix={community.id}
            codeReadOnly
            canAssignAdmin={canAssignAdmin}
            adminUsername={community.admin_username}
          />
          <div className="flex flex-col">
            <span className="nf-label invisible hidden lg:block" aria-hidden="true">
              &nbsp;
            </span>
            <button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="nf-button nf-button-secondary"
            >
              {form.formState.isSubmitting ? (
                <LoadingSpinner size="sm" label="Зберігаємо…" />
              ) : (
                'Зберегти'
              )}
            </button>
          </div>
          {form.formState.errors.root ? (
            <p role="alert" className="nf-error lg:col-span-4">
              {form.formState.errors.root.message}
            </p>
          ) : null}
        </form>
      ) : (
        <div>
          <h3 className="font-bold text-slate-900">{community.name}</h3>
          <p className="mt-1 text-xs text-slate-600">Код: {community.code}</p>
          <p className="mt-1 text-xs text-slate-600">
            Адміністратор: {community.admin_username ?? 'Не призначено'}
          </p>
        </div>
      )}

      <div className="mt-4 border-t border-(--nf-line) pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-900">Школи ({community.school_count})</h4>
          {canEdit ? (
            <div className="flex min-w-72 flex-1 gap-2 sm:max-w-xl">
              <label className="sr-only" htmlFor={`school-${community.id}`}>
                Додати школу до {community.name}
              </label>
              <select
                id={`school-${community.id}`}
                value={schoolId}
                onChange={(event) => setSchoolId(event.target.value)}
                className="nf-input"
                disabled={addSchool.isPending || availableSchools.length === 0}
              >
                <option value="">Оберіть школу</option>
                {availableSchools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleAddSchool()}
                disabled={!schoolId || addSchool.isPending}
                className="nf-button nf-button-primary whitespace-nowrap"
              >
                Додати
              </button>
            </div>
          ) : null}
        </div>

        {members.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {members.map((school) => (
              <li
                key={school.id}
                className="flex min-h-10 items-center justify-between border border-(--nf-line) px-3 text-sm"
              >
                <span>{school.name}</span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void handleRemoveSchool(school.id)}
                    disabled={removeSchool.isPending}
                    className="flex size-8 items-center justify-center text-red-700 hover:bg-red-50 disabled:opacity-50"
                    aria-label={`Вилучити ${school.name} з громади`}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-600">У громаді ще немає шкіл.</p>
        )}
      </div>
    </article>
  );
}

function CommunityFields({
  form,
  admins,
  prefix,
  codeReadOnly = false,
  canAssignAdmin,
  adminUsername,
}: {
  form: UseFormReturn<CommunityFormValues>;
  admins: CommunityAdminOption[];
  prefix: string;
  codeReadOnly?: boolean;
  canAssignAdmin: boolean;
  adminUsername?: string | null;
}) {
  return (
    <>
      <div>
        <label htmlFor={`${prefix}-community-code`} className="nf-label">
          Код
        </label>
        <input
          id={`${prefix}-community-code`}
          {...form.register('code')}
          className={`nf-input ${codeReadOnly ? 'bg-slate-100' : ''}`}
          placeholder="obukhivska"
          readOnly={codeReadOnly}
        />
        {form.formState.errors.code ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.code.message}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor={`${prefix}-community-name`} className="nf-label">
          Назва
        </label>
        <input id={`${prefix}-community-name`} {...form.register('name')} className="nf-input" />
        {form.formState.errors.name ? (
          <p role="alert" className="nf-field-error">
            {form.formState.errors.name.message}
          </p>
        ) : null}
      </div>
      {canAssignAdmin ? (
        <label htmlFor={`${prefix}-community-admin`}>
          <span className="nf-label">Адміністратор</span>
          <select
            id={`${prefix}-community-admin`}
            {...form.register('admin_owner_id')}
            className="nf-input"
          >
            <option value="">Не призначено</option>
            {admins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.username}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div>
          <span className="nf-label">Адміністратор</span>
          <p className="nf-input bg-slate-100">
            {adminUsername ?? 'Поточний адміністратор'}
          </p>
        </div>
      )}
    </>
  );
}
