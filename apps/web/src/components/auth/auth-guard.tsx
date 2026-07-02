"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { getRouteAccess } from "@/features/auth/authorization";
import { useCurrentUser } from "@/features/auth/hooks";
import type { UserRole } from "@/features/auth/model";
import { getApiErrorMessage } from "@/lib/api-client";

type AuthGuardProps = {
  children: ReactNode;
  allowedRoles?: readonly UserRole[];
  schoolId?: string;
};

export function AuthGuard({
  children,
  allowedRoles,
  schoolId,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentUser = useCurrentUser();

  const decision =
    currentUser.isPending || currentUser.isError
      ? null
      : getRouteAccess(currentUser.data ?? null, {
          allowedRoles,
          schoolId,
        });

  useEffect(() => {
    if (decision !== "unauthenticated") {
      return;
    }

    const returnPath =
      typeof window === "undefined"
        ? pathname
        : `${window.location.pathname}${window.location.search}`;

    router.replace(`/login?next=${encodeURIComponent(returnPath)}`);
  }, [decision, pathname, router]);

  if (currentUser.isPending) {
    return <SessionMessage text="Відновлюємо сесію…" />;
  }

  if (currentUser.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Не вдалося перевірити сесію</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {getApiErrorMessage(currentUser.error)}
          </p>
          <button
            type="button"
            onClick={() => void currentUser.refetch()}
            disabled={currentUser.isFetching}
            className="mt-5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {currentUser.isFetching ? "Перевіряємо…" : "Повторити"}
          </button>
        </div>
      </main>
    );
  }

  if (
    decision === "forbidden-role" ||
    decision === "forbidden-tenant"
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-amber-700">403</p>
          <h1 className="mt-1 text-xl font-semibold">Доступ заборонено</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {decision === "forbidden-tenant"
              ? "Ваш обліковий запис не має доступу до цієї школи."
              : "Ваша роль не має доступу до цього розділу."}
          </p>
        </div>
      </main>
    );
  }

  if (decision !== "allow") {
    return <SessionMessage text="Переспрямовуємо…" />;
  }

  return children;
}

function SessionMessage({ text }: { text: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p role="status" className="text-sm text-zinc-600">
        {text}
      </p>
    </main>
  );
}
