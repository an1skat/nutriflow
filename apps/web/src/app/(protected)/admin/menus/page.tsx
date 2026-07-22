import { AccessGuard } from '@/features/access/ui/AccessGuard';
import { WeeklyMenuAdminWorkspace } from '@/widgets/weekly-menu-admin-workspace/ui/WeeklyMenuAdminWorkspace';

export default function AdminMenusPage() {
  return (
    <AccessGuard allowedRoles={['OWNER', 'TECHNOLOGIST']} requiredPermissions={['menus.manage']}>
      <WeeklyMenuAdminWorkspace />
    </AccessGuard>
  );
}
