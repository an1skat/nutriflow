"use client";

import Link from "next/link";

import { useCurrentUser } from "@/entities/session/api/SessionQueries";

export default function HomePage() {
  const currentUser = useCurrentUser();
  const user = currentUser.data;

  if (!user) {
    return null;
  }

  const roleLabel =
    user.role === "ADMIN" ? "Адміністратор" : "Користувач школи";

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Робоча область</p>
        <h1 className="nf-title">Огляд</h1>
        <p className="nf-description">
          Основна інформація про поточний обліковий запис і доступні розділи.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="nf-panel">
          <div className="nf-panel-header">
            <h2 className="nf-panel-title">Обліковий запис</h2>
          </div>
          <div className="nf-table-wrap border-0">
            <table className="nf-table">
              <tbody>
                <tr>
                  <th className="w-44">Користувач</th>
                  <td>{user.username}</td>
                </tr>
                <tr>
                  <th>Роль</th>
                  <td>{roleLabel}</td>
                </tr>
                <tr>
                  <th>Email</th>
                  <td>{user.email ?? "Не вказано"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="nf-panel">
          <div className="nf-panel-header">
            <h2 className="nf-panel-title">Доступні розділи</h2>
          </div>
          <div className="nf-panel-body">
            {user.role === "ADMIN" ? (
              <div>
                <Link href="/admin/schools" className="nf-link">
                  Школи та користувачі
                </Link>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Створення шкіл, керування статусами та обліковими записами.
                </p>
              </div>
            ) : (
              <p className="text-sm leading-5 text-slate-600">
                Для вашої ролі зараз доступний огляд облікового запису.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
