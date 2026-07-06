import { AccessGuard } from "@/features/access/ui/AccessGuard";
import { SchoolsOverview } from "@/widgets/schools-overview/ui/SchoolsOverview";

export default function SchoolsPage() {
  return (
    <AccessGuard requiredPermissions={["schools.manage"]}>
      <SchoolsOverview />
    </AccessGuard>
  );
}
