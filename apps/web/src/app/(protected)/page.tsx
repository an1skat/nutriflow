'use client';

import Link from 'next/link';

import { useCurrentUser } from '@/entities/session/api/SessionQueries';
import { hasPermission, isBackofficeUser } from '@/features/access/model/AccessPolicy';

export default function HomePage() {
  const currentUser = useCurrentUser();
  const user = currentUser.data;

  if (!user) {
    return null;
  }

  const roleLabel =
    user.role === 'OWNER'
      ? 'Власник'
      : user.role === 'ADMIN'
        ? 'Адміністратор'
        : user.role === 'TECHNOLOGIST'
          ? 'Технолог'
          : 'Користувач школи';

  return (
    <main className="nf-page">
      <header className="nf-page-header">
        <p className="nf-eyebrow">Робоча область</p>
        <h1 className="nf-title">Огляд</h1>
        <p className="nf-description">
          Основна інформація про поточний обліковий запис і доступні розділи.
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
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
                  <td>{user.email ?? 'Не вказано'}</td>
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
            {isBackofficeUser(user) ? (
              <div>
                {hasPermission(user, 'schools.manage') ? (
                  <Link href="/admin/schools" className="nf-link">
                    Школи та користувачі
                  </Link>
                ) : null}
                {user.role !== 'ADMIN' && hasPermission(user, 'menus.manage') ? (
                  <Link href="/admin/menus" className="nf-link block">
                    Тижневе меню
                  </Link>
                ) : null}
                {user.role === 'TECHNOLOGIST' ? (
                  <Link href="/admin/menu-changes" className="nf-link block">
                    Зміни меню від шкіл
                  </Link>
                ) : null}
                {user.role === 'OWNER' ? (
                  <Link href="/admin/access" className="nf-link block">
                    Доступ адміністраторів
                  </Link>
                ) : null}
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Розділи залежать від прав поточного облікового запису.
                </p>
              </div>
            ) : (
              <div>
                <Link href="/menu" className="nf-link">
                  Тижневе меню
                </Link>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Основний робочий екран для редагування отриманого меню школи.
                </p>
                <Link href="/school/groups" className="nf-link block">
                  Групи школи
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
