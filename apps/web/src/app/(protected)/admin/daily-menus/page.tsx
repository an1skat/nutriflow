import { AccessGuard } from '@/features/access/ui/AccessGuard';
import { AdminDailyMenus } from '@/widgets/admin-daily-menus/ui/AdminDailyMenus';

export default async function AdminDailyMenusPage({
  searchParams,
}: {
  searchParams: Promise<{ school_id?: string }>;
}) {
  const { school_id } = await searchParams;
  return (
    <AccessGuard allowedRoles={['OWNER', 'ADMIN']} requiredPermissions={['menus.manage']}>
      <AdminDailyMenus initialSchoolId={school_id} />
    </AccessGuard>
  );
}
