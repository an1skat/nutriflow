'use client';

import { type ComponentType, type ReactNode, useState } from 'react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useCurrentUser } from '@/entities/session/api/SessionQueries';
import type { AdminPermission, UserRole } from '@/entities/session/model/Session';
import { hasPermission, isBackofficeUser } from '@/features/access/model/AccessPolicy';
import { useLogout } from '@/features/auth/model/UseSession';
import { getApiErrorMessage } from '@/shared/api/HttpClient';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';

type NavigationItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  ownerOnly?: boolean;
  requiredPermission?: AdminPermission;
  excludedRoles?: readonly UserRole[];
  schoolOnly?: boolean;
  technologistOnly?: boolean;
};

const navigation: NavigationItem[] = [
  {
    href: '/',
    label: 'Огляд',
    icon: LayoutDashboard,
  },
  {
    href: '/admin/schools',
    label: 'Школи',
    icon: Building2,
    requiredPermission: 'schools.manage',
  },
  {
    href: '/admin/recipe',
    label: 'Техкарти',
    icon: BookOpen,
    requiredPermission: 'recipes.view',
  },
  {
    href: '/admin/menus',
    label: 'Тижневе меню',
    icon: CalendarDays,
    requiredPermission: 'menus.manage',
    excludedRoles: ['ADMIN'],
  },
  {
    href: '/admin/menu-changes',
    label: 'Зміни від шкіл',
    icon: ClipboardCheck,
    excludedRoles: ['OWNER', 'SCHOOL_USER'],
  },
  {
    href: '/admin/access',
    label: 'Доступ',
    icon: ShieldCheck,
    ownerOnly: true,
  },
  {
    href: '/menu',
    label: 'Тижневе меню',
    icon: CalendarDays,
    schoolOnly: true,
  },
  {
    href: '/daily-menu',
    label: 'Денне меню',
    icon: ClipboardList,
    schoolOnly: true,
  },
  {
    href: '/menu-requirements',
    label: 'Меню-вимога',
    icon: FileSpreadsheet,
    schoolOnly: true,
  },
  {
    href: '/menu-requirements/calendar',
    label: 'Календар вимог',
    icon: CalendarDays,
    excludedRoles: ['SCHOOL_USER'],
  },
  {
    href: '/school/groups',
    label: 'Групи',
    icon: UsersRound,
    schoolOnly: true,
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const currentUser = useCurrentUser();
  const logout = useLogout();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const user = currentUser.data;

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      router.replace('/login');
      router.refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  if (!user) {
    return null;
  }

  const visibleNavigation = navigation.filter(
    (item) =>
      (!item.ownerOnly || user.role === 'OWNER') &&
      (!item.excludedRoles || !item.excludedRoles.includes(user.role)) &&
      (!item.requiredPermission ||
        (isBackofficeUser(user) && hasPermission(user, item.requiredPermission))) &&
      (!item.schoolOnly || user.role === 'SCHOOL_USER') &&
      (!item.technologistOnly || user.role === 'TECHNOLOGIST')
  );
  const roleLabel =
    user.role === 'OWNER'
      ? 'Власник'
      : user.role === 'ADMIN'
        ? 'Адміністратор'
        : user.role === 'TECHNOLOGIST'
          ? 'Технолог'
          : 'Користувач школи';

  return (
    <div className="min-h-screen bg-background">
      <button
        type="button"
        onClick={() => setIsMenuOpen(true)}
        className="fixed left-3 top-3 z-30 flex size-9 items-center justify-center border border-slate-400 bg-white text-slate-800 shadow-sm md:hidden"
        aria-label="Відкрити навігацію"
        aria-expanded={isMenuOpen}
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {isMenuOpen ? (
        <button
          type="button"
          aria-label="Закрити навігацію"
          className="fixed inset-0 z-30 bg-slate-950/35 md:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-(--nf-line-strong) bg-(--nf-sidebar) transition-transform md:translate-x-0 ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-(--nf-line-strong) bg-(--nf-brand) px-4 text-white">
          <Link href="/" onClick={() => setIsMenuOpen(false)} className="font-bold tracking-wide">
            NutriFlow
          </Link>
          <button
            type="button"
            onClick={() => setIsMenuOpen(false)}
            className="flex size-8 items-center justify-center text-white md:hidden"
            aria-label="Закрити навігацію"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="border-b border-(--nf-line) px-4 py-3">
          <p className="truncate text-sm font-bold text-slate-900">{user.username}</p>
          <p className="mt-0.5 text-xs text-slate-600">{roleLabel}</p>
        </div>

        <nav aria-label="Основна навігація" className="flex-1 p-2">
          <p className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Розділи
          </p>
          <ul className="space-y-1">
            {visibleNavigation.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === '/'
                  : item.href === '/menu-requirements'
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-9 items-center gap-2 border px-2.5 text-sm ${
                      isActive
                        ? 'border-(--nf-brand-dark) bg-(--nf-brand) font-bold text-white'
                        : 'border-transparent text-slate-800 hover:border-(--nf-line) hover:bg-white'
                    }`}
                  >
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-(--nf-line-strong) p-2">
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={logout.isPending}
            className="flex min-h-9 w-full items-center gap-2 border border-transparent px-2.5 text-left text-sm text-slate-700 hover:border-(--nf-line) hover:bg-white disabled:opacity-50"
          >
            {logout.isPending ? (
              <LoadingSpinner size="sm" label="Виходимо…" />
            ) : (
              <>
                <LogOut className="size-4" aria-hidden />
                Вийти
              </>
            )}
          </button>
          <p className="px-2.5 pt-2 text-[10px] text-slate-500">
            NutriFlow · шкільне харчування
          </p>
        </div>
      </aside>

      <div className="min-h-screen md:pl-56">
        <div className="h-14 border-b border-(--nf-line) bg-white md:hidden">
          <div className="flex h-full items-center pl-14 text-sm font-bold text-slate-800">
            NutriFlow
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
