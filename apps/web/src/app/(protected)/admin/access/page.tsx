import { AccessGuard } from '@/features/access/ui/AccessGuard';
import { AdminAccessPanel } from '@/widgets/admin-access/ui/AdminAccessPanel';

export default function AdminAccessPage() {
  return (
    <AccessGuard allowedRoles={['OWNER']}>
      <AdminAccessPanel />
    </AccessGuard>
  );
}
