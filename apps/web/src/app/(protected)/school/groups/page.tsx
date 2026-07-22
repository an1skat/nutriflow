'use client';

import { AccessGuard } from '@/features/access/ui/AccessGuard';
import { SchoolGroupsPanel } from '@/widgets/school-groups/ui/SchoolGroupsPanel';

export default function SchoolGroupsPage() {
  return (
    <AccessGuard allowedRoles={['SCHOOL_USER']}>
      <main className="nf-page">
        <header className="nf-page-header">
          <p className="nf-eyebrow">Школа</p>
          <h1 className="nf-title">Групи</h1>
          <p className="nf-description">
            Довідник вікових груп для майбутнього денного обліку страв.
          </p>
        </header>

        <SchoolGroupsPanel mode="own" />
      </main>
    </AccessGuard>
  );
}
