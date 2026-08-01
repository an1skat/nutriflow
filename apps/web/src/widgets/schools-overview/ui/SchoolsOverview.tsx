'use client';

import { useState } from 'react';

import Link from 'next/link';

import { useSchools } from '@/entities/school/api/SchoolQueries';
import { CreateSchoolForm } from '@/features/school-management/ui/CreateSchoolForm';
import { formatDate } from '@/shared/lib/FormatDate';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';
import { PaginationControls } from '@/shared/ui/PaginationControls';
import { RequestError } from '@/shared/ui/RequestError';
import { StatusBadge } from '@/shared/ui/StatusBadge';

const PAGE_SIZE = 20;

export function SchoolsOverview() {
  const [offset, setOffset] = useState(0);
  const schools = useSchools({
    offset,
    limit: PAGE_SIZE,
  });

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Адміністрування</p>
        <h1 className="nf-title">Школи</h1>
        <p className="nf-description">Створюйте школи, керуйте їхнім статусом і користувачами.</p>
      </header>

      <section aria-labelledby="create-school-heading" className="nf-panel">
        <div className="nf-panel-header">
          <h2 id="create-school-heading" className="nf-panel-title">
            Додати школу
          </h2>
        </div>
        <div className="nf-panel-body">
          <CreateSchoolForm />
        </div>
      </section>

      <section aria-labelledby="school-list-heading" className="nf-panel mt-5">
        <div className="nf-panel-header">
          <div>
            <h2 id="school-list-heading" className="nf-panel-title">
              Список шкіл
            </h2>
            {schools.data ? (
              <p className="mt-0.5 text-xs text-slate-600">Записів: {schools.data.total}</p>
            ) : null}
          </div>
        </div>

        <div className="nf-panel-body">
          {schools.isPending ? <LoadingSpinner label="Завантажуємо школи…" /> : null}

          {schools.isError ? (
            <RequestError error={schools.error} onRetry={() => void schools.refetch()} />
          ) : null}

          {schools.data?.items.length === 0 ? (
            <div className="nf-empty">Шкіл за цими параметрами немає.</div>
          ) : null}

          {schools.data?.items.length ? (
            <div className="nf-table-wrap">
              <table className="nf-table">
                <thead>
                  <tr>
                    <th>Назва</th>
                    <th className="w-44">Код</th>
                    <th className="w-40">Статус</th>
                    <th className="w-52">Оновлено</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.data.items.map((school) => (
                    <tr key={school.id}>
                      <td>
                        <Link href={`/admin/schools/${school.id}`} className="nf-link">
                          {school.name}
                        </Link>
                      </td>
                      <td>
                        <code className="text-xs">{school.code}</code>
                      </td>
                      <td>
                        <StatusBadge isActive={school.is_active} />
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-600">
                        {formatDate(school.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {schools.data ? (
            <PaginationControls
              offset={offset}
              limit={PAGE_SIZE}
              total={schools.data.total}
              disabled={schools.isFetching}
              onOffsetChange={setOffset}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
