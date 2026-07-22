import type { ReactNode } from 'react';

import { AccessGuard } from '@/features/access/ui/AccessGuard';
import { AppShell } from '@/widgets/app-shell/ui/AppShell';

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <AccessGuard>
      <AppShell>{children}</AppShell>
    </AccessGuard>
  );
}
