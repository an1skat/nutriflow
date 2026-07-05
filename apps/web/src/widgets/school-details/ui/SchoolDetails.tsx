"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useSchool } from "@/entities/school/api/SchoolQueries";
import { useSchoolUsers } from "@/entities/school-user/api/SchoolUserQueries";
import { DeleteSchoolAction } from "@/features/school-management/ui/DeleteSchoolAction";
import { EditSchoolForm } from "@/features/school-management/ui/EditSchoolForm";
import { CreateSchoolUserForm } from "@/features/school-user-management/ui/CreateSchoolUserForm";
import { formatDate } from "@/shared/lib/FormatDate";
import { PaginationControls } from "@/shared/ui/PaginationControls";
import { RequestError } from "@/shared/ui/RequestError";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { SchoolGroupsPanel } from "@/widgets/school-groups/ui/SchoolGroupsPanel";

const PAGE_SIZE = 20;

export function SchoolDetails({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const school = useSchool(schoolId);
  const [offset, setOffset] = useState(0);
  const users = useSchoolUsers(schoolId, {
    offset,
    limit: PAGE_SIZE,
  });

  if (school.isPending) {
    return (
      <main className="nf-page">
        <p role="status" className="text-sm text-slate-600">
          Завантажуємо школу…
        </p>
      </main>
    );
  }

  if (school.isError) {
    return (
      <main className="nf-page">
        <RequestError
          error={school.error}
          onRetry={() => void school.refetch()}
        />
      </main>
    );
  }

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <Link href="/admin/schools" className="nf-link text-xs">
          ← До списку шкіл
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div>
            <p className="nf-eyebrow">Картка школи</p>
            <h1 className="nf-title">{school.data.name}</h1>
          </div>
          <StatusBadge isActive={school.data.is_active} />
        </div>
        <p className="nf-description">
          Код: <code>{school.data.code}</code> · Створено{" "}
          {formatDate(school.data.created_at)}
        </p>
      </header>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="nf-panel">
          <div className="nf-panel-header">
            <h2 className="nf-panel-title">Параметри школи</h2>
          </div>
          <div className="nf-panel-body">
            <EditSchoolForm school={school.data} />
          </div>
        </div>
        <div className="nf-panel border-red-300">
          <div className="nf-panel-header bg-red-50">
            <h2 className="nf-panel-title text-red-900">Видалення</h2>
          </div>
          <div className="nf-panel-body">
            <p className="mb-4 text-xs leading-5 text-slate-600">
              Школу буде видалено разом з користувачами. Перед видаленням
              потрібно підтвердити дію.
            </p>
            <DeleteSchoolAction
              schoolId={schoolId}
              onDeleted={() => router.replace("/admin/schools")}
            />
          </div>
        </div>
      </section>

      <SchoolGroupsPanel mode="admin" schoolId={schoolId} />

      <section className="nf-panel mt-5">
        <div className="nf-panel-header">
          <h2 className="nf-panel-title">Додати користувача школи</h2>
        </div>
        <div className="nf-panel-body">
          {school.data.is_active ? (
            <CreateSchoolUserForm schoolId={schoolId} />
          ) : (
            <p className="text-sm text-amber-800">
              Спочатку активуйте школу, щоб додавати користувачів.
            </p>
          )}
        </div>
      </section>

      <section className="nf-panel mt-5">
        <div className="nf-panel-header">
          <div>
            <h2 className="nf-panel-title">Користувачі</h2>
            {users.data ? (
              <p className="mt-0.5 text-xs text-slate-600">
                Записів: {users.data.total}
              </p>
            ) : null}
          </div>
        </div>

        <div className="nf-panel-body">
          {users.isPending ? (
            <p role="status" className="text-sm text-slate-600">
              Завантажуємо користувачів…
            </p>
          ) : null}
          {users.isError ? (
            <RequestError
              error={users.error}
              onRetry={() => void users.refetch()}
            />
          ) : null}
          {users.data?.items.length === 0 ? (
            <div className="nf-empty">
              Користувачів за цими параметрами немає.
            </div>
          ) : null}
          {users.data?.items.length ? (
            <div className="nf-table-wrap">
              <table className="nf-table">
                <thead>
                  <tr>
                    <th>Логін</th>
                    <th>Email</th>
                    <th className="w-36">Статус</th>
                    <th className="w-52">Оновлено</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <Link
                          href={`/admin/schools/${schoolId}/users/${user.id}`}
                          className="nf-link"
                        >
                          {user.username}
                        </Link>
                      </td>
                      <td>{user.email ?? "Не вказано"}</td>
                      <td>
                        <StatusBadge
                          isActive={user.is_active}
                          activeLabel="Активний"
                          inactiveLabel="Неактивний"
                        />
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-600">
                        {formatDate(user.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {users.data ? (
            <PaginationControls
              offset={offset}
              limit={PAGE_SIZE}
              total={users.data.total}
              disabled={users.isFetching}
              onOffsetChange={setOffset}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
