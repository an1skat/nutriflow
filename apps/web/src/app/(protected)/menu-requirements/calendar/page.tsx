import { AccessGuard } from '@/features/access/ui/AccessGuard';
import { MenuRequirementCalendarWorkspace } from '@/widgets/menu-requirement-calendar-workspace/ui/MenuRequirementCalendarWorkspace';

export default function MenuRequirementsCalendarPage() {
  return (
    <AccessGuard allowedRoles={['OWNER', 'ADMIN', 'TECHNOLOGIST']}>
      <MenuRequirementCalendarWorkspace />
    </AccessGuard>
  );
}
