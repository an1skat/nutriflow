'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

import { useMenuRequirements } from '@/entities/menu-requirement/api/MenuRequirementQueries';
import type { UpdateMenuRequirementPayload } from '@/entities/menu-requirement/model/MenuRequirement';
import { useCurrentUser } from '@/entities/session/api/SessionQueries';
import {
  useDeleteMenuRequirement,
  useUpdateMenuRequirement,
} from '@/features/menu-requirement-edit/model/UseMenuRequirementMutations';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { RequestError } from '@/shared/ui/RequestError';

import {
  MenuRequirementTable,
  RequirementNavigator,
  filterRequirementsForUser,
} from './requirement/RequirementContent';

export {
  filterRequirementsForUser,
  MenuRequirementTable,
  RequirementNavigator,
} from './requirement/RequirementContent';

export function MenuRequirementSchoolWorkspace() {
  const searchParams = useSearchParams();
  const currentUser = useCurrentUser();
  const requirements = useMenuRequirements({
    offset: 0,
    limit: 100,
  });
  const [selectedId, setSelectedId] = useState('');
  const allItems = useMemo(() => requirements.data?.items ?? [], [requirements.data?.items]);
  const items = useMemo(
    () => filterRequirementsForUser(allItems, currentUser.data),
    [allItems, currentUser.data]
  );
  const requestedRequirementId = searchParams.get('requirement_id') ?? '';
  const effectiveSelectedId = items.some((item) => item.id === selectedId)
    ? selectedId
    : items.some((item) => item.id === requestedRequirementId)
      ? requestedRequirementId
      : (items[0]?.id ?? '');

  const selectedRequirement = items.find((item) => item.id === effectiveSelectedId) ?? null;
  const viewerRole = currentUser.data?.role;
  const isSchoolUser = viewerRole === 'SCHOOL_USER';
  const showAdminHierarchy = viewerRole === 'OWNER' || viewerRole === 'TECHNOLOGIST';
  const canEditRequirement = showAdminHierarchy;
  const updateRequirement = useUpdateMenuRequirement(selectedRequirement?.id ?? '');
  const deleteRequirement = useDeleteMenuRequirement(selectedRequirement?.id ?? '');

  const handleSaveRequirement = async (payload: UpdateMenuRequirementPayload) => {
    try {
      await updateRequirement.mutateAsync(payload);
      toast.success('Меню-вимогу оновлено.');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      throw error;
    }
  };

  const handleDeleteRequirement = async () => {
    if (!selectedRequirement) {
      return;
    }

    try {
      await deleteRequirement.mutateAsync();
      setSelectedId('');
      toast.success('Меню-вимогу видалено.');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      throw error;
    }
  };

  return (
    <main className="nf-page nf-page-wide">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Облік продуктів</p>
        <h1 className="nf-title">Меню-вимога</h1>
        <p className="nf-description">
          Нетто інгредієнтів на одну особу та округлена кількість продуктів до видачі для конкретної
          групи.
          {viewerRole === 'ADMIN' ? ' Дані згруповано за школами.' : null}
          {showAdminHierarchy ? ' Дані згруповано за адміністратором і школою.' : null}
        </p>
      </header>

      {requirements.isError ? (
        <RequestError error={requirements.error} onRetry={() => void requirements.refetch()} />
      ) : null}

      {requirements.isPending ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <p role="status" className="text-sm text-slate-600">
              Завантажуємо меню-вимоги…
            </p>
          </div>
        </section>
      ) : null}

      {requirements.data && items.length === 0 ? (
        <section className="nf-panel">
          <div className="nf-panel-body">
            <div className="nf-empty">
              <FileSpreadsheet className="mx-auto mb-3 size-8 text-slate-400" aria-hidden />
              <p>Ще немає сформованих меню-вимог.</p>
              {isSchoolUser ? (
                <Link href="/daily-menu" className="nf-link mt-2 inline-block">
                  Перейти до денного меню
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {items.length > 0 && viewerRole ? (
        <div className="grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <RequirementNavigator
            requirements={items}
            viewerRole={viewerRole}
            selectedId={effectiveSelectedId}
            onSelect={setSelectedId}
          />
          <div className="min-w-0">
            {selectedRequirement ? (
              <MenuRequirementTable
                key={`${selectedRequirement.id}:${selectedRequirement.revision}`}
                requirement={selectedRequirement}
                showSchoolName={!isSchoolUser}
                showAdministrator={showAdminHierarchy}
                editable={canEditRequirement}
                isSaving={updateRequirement.isPending}
                onSave={handleSaveRequirement}
                deletable={canEditRequirement}
                isDeleting={deleteRequirement.isPending}
                onDelete={handleDeleteRequirement}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
