'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useSchoolUser } from '@/entities/school-user/api/SchoolUserQueries';
import { useSchool } from '@/entities/school/api/SchoolQueries';
import { DeleteSchoolUserAction } from '@/features/school-user-management/ui/DeleteSchoolUserAction';
import { EditSchoolUserForm } from '@/features/school-user-management/ui/EditSchoolUserForm';
import { ResetSchoolUserPasswordForm } from '@/features/school-user-management/ui/ResetSchoolUserPasswordForm';
import { formatDate } from '@/shared/lib/FormatDate';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';
import { RequestError } from '@/shared/ui/RequestError';
import { StatusBadge } from '@/shared/ui/StatusBadge';

type SchoolUserDetailsProps = {
  schoolId: string;
  userId: string;
};

export function SchoolUserDetails({ schoolId, userId }: SchoolUserDetailsProps) {
  const router = useRouter();
  const school = useSchool(schoolId);
  const user = useSchoolUser(schoolId, userId);

  if (school.isPending || user.isPending) {
    return (
      <main className="nf-page">
        <LoadingSpinner label="Завантажуємо користувача…" />
      </main>
    );
  }

  if (school.isError || user.isError) {
    return (
      <main className="nf-page">
        <RequestError
          error={school.error ?? user.error}
          onRetry={() => {
            void school.refetch();
            void user.refetch();
          }}
        />
      </main>
    );
  }

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <Link href={`/admin/schools/${schoolId}`} className="nf-link text-xs">
          ← До школи «{school.data.name}»
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div>
            <p className="nf-eyebrow">Обліковий запис школи</p>
            <h1 className="nf-title">{user.data.username}</h1>
          </div>
          <StatusBadge
            isActive={user.data.is_active}
            activeLabel="Активний"
            inactiveLabel="Неактивний"
          />
        </div>
        <p className="nf-description">
          {user.data.email ?? 'Email не вказано'} · Створено {formatDate(user.data.created_at)}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="nf-panel">
            <div className="nf-panel-header">
              <h2 className="nf-panel-title">Параметри облікового запису</h2>
            </div>
            <div className="nf-panel-body">
              <EditSchoolUserForm schoolId={schoolId} user={user.data} />
            </div>
          </section>

          <section className="nf-panel">
            <div className="nf-panel-header">
              <h2 className="nf-panel-title">Зміна пароля</h2>
            </div>
            <div className="nf-panel-body">
              <ResetSchoolUserPasswordForm schoolId={schoolId} userId={userId} />
            </div>
          </section>
        </div>

        <section className="nf-panel h-fit border-red-300">
          <div className="nf-panel-header bg-red-50">
            <h2 className="nf-panel-title text-red-900">Видалення користувача</h2>
          </div>
          <div className="nf-panel-body">
            <p className="mb-4 text-xs leading-5 text-slate-600">
              Обліковий запис буде фізично видалено, а його поточні сесії — завершено.
            </p>
            <DeleteSchoolUserAction
              schoolId={schoolId}
              userId={userId}
              onDeleted={() => router.replace(`/admin/schools/${schoolId}`)}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
