import { AccessGuard } from "@/features/access/ui/AccessGuard";
import { WeeklyMenuSchoolWorkspace } from "@/widgets/weekly-menu-school-workspace/ui/WeeklyMenuSchoolWorkspace";

export default function SchoolMenuPage() {
  return (
    <AccessGuard allowedRoles={["SCHOOL_USER"]}>
      <WeeklyMenuSchoolWorkspace />
    </AccessGuard>
  );
}
