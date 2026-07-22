'use client';

import { useEffect } from 'react';

import { useRouter } from 'next/navigation';

import { useCurrentUser } from '@/entities/session/api/SessionQueries';
import { hasPermission } from '@/features/access/model/AccessPolicy';

export default function AdminPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const user = currentUser.data;

  useEffect(() => {
    if (!user) {
      return;
    }

    if (hasPermission(user, 'schools.manage')) {
      router.replace('/admin/schools');
      return;
    }

    if (hasPermission(user, 'recipes.view')) {
      router.replace('/admin/recipe');
      return;
    }

    if (user.role === 'OWNER') {
      router.replace('/admin/access');
      return;
    }

    router.replace('/');
  }, [router, user]);

  return (
    <main className="flex min-h-[50vh] items-center justify-center p-6">
      <p role="status" className="text-sm text-slate-600">
        Переспрямовуємо…
      </p>
    </main>
  );
}
