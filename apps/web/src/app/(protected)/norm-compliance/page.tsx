import { AccessGuard } from '@/features/access/ui/AccessGuard';
import { NormComplianceWorkspace } from '@/widgets/norm-compliance-workspace/ui/NormComplianceWorkspace';

export default function NormCompliancePage() {
  return (
    <AccessGuard allowedRoles={['OWNER', 'ADMIN', 'TECHNOLOGIST']}>
      <NormComplianceWorkspace />
    </AccessGuard>
  );
}
