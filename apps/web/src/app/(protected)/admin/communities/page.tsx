import { AccessGuard } from '@/features/access/ui/AccessGuard';
import { CommunitiesOverview } from '@/widgets/communities-overview/ui/CommunitiesOverview';

export default function CommunitiesPage() {
  return (
    <AccessGuard
      allowedRoles={['OWNER', 'ADMIN']}
      requiredPermissions={['schools.manage']}
    >
      <CommunitiesOverview />
    </AccessGuard>
  );
}
