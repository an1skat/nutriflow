import { AccessGuard } from "@/features/access/ui/AccessGuard";
import { DailyMenuSchoolWorkspace } from "@/widgets/daily-menu-school-workspace/ui/DailyMenuSchoolWorkspace";

export default function DailyMenuPage() {
  return (
    <AccessGuard allowedRoles={["SCHOOL_USER"]}>
      <DailyMenuSchoolWorkspace />
    </AccessGuard>
  );
}
