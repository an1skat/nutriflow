'use client';

import { type ReactNode, useEffect, useRef } from 'react';

import { usePathname, useRouter } from 'next/navigation';

import { toast } from 'sonner';

import { useCurrentUser } from '@/entities/session/api/SessionQueries';
import type { AdminPermission, UserRole } from '@/entities/session/model/Session';
import { getHomePath, getRouteAccess } from '@/features/access/model/AccessPolicy';
import { getApiErrorMessage } from '@/shared/api/HttpClient';

type AccessGuardProps = {
  children: ReactNode;
  allowedRoles?: readonly UserRole[];
  requiredPermissions?: readonly AdminPermission[];
  schoolId?: string;
};

export function AccessGuard({
  children,
  allowedRoles,
  requiredPermissions,
  schoolId,
}: AccessGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentUser = useCurrentUser();
  const redirectedRef = useRef(false);

  const decision =
    currentUser.isPending || currentUser.isError
      ? null
      : getRouteAccess(currentUser.data ?? null, {
          allowedRoles,
          requiredPermissions,
          schoolId,
        });

  useEffect(() => {
    if (decision !== 'unauthenticated') {
      return;
    }

    const returnPath =
      typeof window === 'undefined'
        ? pathname
        : `${window.location.pathname}${window.location.search}`;

    router.replace(`/login?next=${encodeURIComponent(returnPath)}`);
  }, [decision, pathname, router]);

  useEffect(() => {
    if (
      redirectedRef.current ||
      !currentUser.data ||
      (decision !== 'forbidden-role' && decision !== 'forbidden-tenant')
    ) {
      return;
    }

    redirectedRef.current = true;
    toast.error(
      decision === 'forbidden-tenant'
        ? 'Ви не маєте доступу до даних цієї школи.'
        : 'Цей розділ недоступний для вашої ролі.',
      {
        id: `access-denied:${pathname}`,
      }
    );
    router.replace(getHomePath(currentUser.data));
  }, [currentUser.data, decision, pathname, router]);

  if (currentUser.isPending) {
    return <SessionMessage text="Відновлюємо сесію…" />;
  }

  if (currentUser.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="nf-panel w-full max-w-md">
          <div className="nf-panel-header">
            <h1 className="nf-panel-title">Не вдалося перевірити сесію</h1>
          </div>
          <div className="nf-panel-body">
            <p className="text-sm text-slate-600">{getApiErrorMessage(currentUser.error)}</p>
            <button
              type="button"
              onClick={() => void currentUser.refetch()}
              disabled={currentUser.isFetching}
              className="nf-button nf-button-primary mt-4"
            >
              {currentUser.isFetching ? 'Перевіряємо…' : 'Повторити'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (decision !== 'allow') {
    return <SessionMessage text="Переспрямовуємо…" />;
  }

  return children;
}

function SessionMessage({ text }: { text: string }) {
  return (
    <main className="flex min-h-[50vh] items-center justify-center p-6">
      <p role="status" className="text-sm text-slate-600">
        {text}
      </p>
    </main>
  );
}
