"use client";

import { useRouter } from "next/navigation";

import { useCurrentUser, useLogout } from "@/features/auth/hooks";
import { getApiErrorMessage } from "@/lib/api-client";

export default function HomePage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const logout = useLogout();
  const user = currentUser.data;

  if (!user) {
    return null;
  }

  const roleLabel =
    user.role === "ADMIN" ? "Адміністратор" : "Користувач школи";

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      router.replace("/login");
      router.refresh();
    } catch {
      // The mutation error is rendered below.
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <section className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">NutriFlow</p>
            <h1 className="mt-1 text-2xl font-semibold">Сесія активна</h1>
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={logout.isPending}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {logout.isPending ? "Виходимо…" : "Вийти"}
          </button>
        </div>

        <dl className="mt-8 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-zinc-500">Користувач</dt>
            <dd className="mt-1 font-medium">{user.username}</dd>
          </div>

          <div>
            <dt className="text-sm text-zinc-500">Роль</dt>
            <dd className="mt-1 font-medium">{roleLabel}</dd>
          </div>
        </dl>

        {logout.isError ? (
          <p role="alert" className="mt-6 text-sm text-red-700">
            {getApiErrorMessage(logout.error)}
          </p>
        ) : null}
      </section>
    </main>
  );
}
