'use client';

import { useMemo, useState } from 'react';

import { useSchoolGroups } from '@/entities/school-group/api/SchoolGroupQueries';
import { type SchoolGroup, ageGroupLabels } from '@/entities/school-group/model/SchoolGroup';
import { CreateSchoolGroupForm } from '@/features/school-group-management/ui/CreateSchoolGroupForm';
import { DeactivateSchoolGroupAction } from '@/features/school-group-management/ui/DeactivateSchoolGroupAction';
import { EditSchoolGroupForm } from '@/features/school-group-management/ui/EditSchoolGroupForm';
import { formatDate } from '@/shared/lib/FormatDate';
import { PaginationControls } from '@/shared/ui/PaginationControls';
import { RequestError } from '@/shared/ui/RequestError';
import { StatusBadge } from '@/shared/ui/StatusBadge';

const PAGE_SIZE = 20;

type SchoolGroupsPanelProps =
  | {
      mode: 'admin';
      schoolId: string;
    }
  | {
      mode: 'own';
      schoolId?: never;
    };

export function SchoolGroupsPanel(props: SchoolGroupsPanelProps) {
  const [offset, setOffset] = useState(0);
  const request = useMemo(
    () => ({
      offset,
      limit: PAGE_SIZE,
    }),
    [offset]
  );
  const groupsQuery = useSchoolGroups(props, request);
  const isEditable = props.mode === 'admin';

  return (
    <section className="nf-panel mt-5">
      <div className="nf-panel-header">
        <div>
          <h2 className="nf-panel-title">Групи школи</h2>
          {groupsQuery.data ? (
            <p className="mt-0.5 text-xs text-slate-600">Записів: {groupsQuery.data.total}</p>
          ) : null}
        </div>
      </div>

      <div className="nf-panel-body">
        {groupsQuery.isPending ? (
          <p role="status" className="text-sm text-slate-600">
            Завантажуємо групи…
          </p>
        ) : null}
        {groupsQuery.isError ? (
          <RequestError error={groupsQuery.error} onRetry={() => void groupsQuery.refetch()} />
        ) : null}
        {groupsQuery.data?.items.length === 0 ? (
          <div className="nf-empty">Груп у цій школі ще немає.</div>
        ) : null}
        {groupsQuery.data?.items.length ? (
          <div className="space-y-4">
            <SchoolGroupsTable groups={groupsQuery.data.items} />
            {isEditable ? (
              <div className="grid gap-4">
                {groupsQuery.data.items.map((group) => (
                  <div key={group.id} className="border border-[var(--nf-line)] bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{group.name}</h3>
                        <p className="text-xs text-slate-600">{ageGroupLabels[group.age_group]}</p>
                      </div>
                      <StatusBadge
                        isActive={group.is_active}
                        activeLabel="Активна"
                        inactiveLabel="Неактивна"
                      />
                    </div>
                    <EditSchoolGroupForm schoolId={props.schoolId} group={group} />
                    <div className="mt-3">
                      <DeactivateSchoolGroupAction
                        schoolId={props.schoolId}
                        groupId={group.id}
                        disabled={!group.is_active}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs leading-5 text-slate-600">
                Це довідник активних вікових груп. Кількість дітей школа буде вводити в денному меню
                окремо біля кожної страви.
              </p>
            )}
          </div>
        ) : null}

        {groupsQuery.data ? (
          <PaginationControls
            offset={offset}
            limit={PAGE_SIZE}
            total={groupsQuery.data.total}
            disabled={groupsQuery.isFetching}
            onOffsetChange={setOffset}
          />
        ) : null}
      </div>

      {isEditable && groupsQuery.data ? (
        <div className="border-t border-[var(--nf-line)] p-4">
          <h3 className="text-sm font-bold text-slate-900">Додати групу</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Для MVP школа має стандартні вікові групи. Якщо групу деактивували, її можна повернути
            до активних без введення кількості дітей.
          </p>
          <div className="mt-3">
            <CreateSchoolGroupForm schoolId={props.schoolId} groups={groupsQuery.data.items} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SchoolGroupsTable({ groups }: { groups: SchoolGroup[] }) {
  return (
    <div className="nf-table-wrap">
      <table className="nf-table">
        <thead>
          <tr>
            <th>Назва</th>
            <th className="w-36">Вік</th>
            <th className="w-36">Статус</th>
            <th className="w-52">Оновлено</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.id}>
              <td>{group.name}</td>
              <td>{ageGroupLabels[group.age_group]}</td>
              <td>
                <StatusBadge
                  isActive={group.is_active}
                  activeLabel="Активна"
                  inactiveLabel="Неактивна"
                />
              </td>
              <td className="whitespace-nowrap text-xs text-slate-600">
                {formatDate(group.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
