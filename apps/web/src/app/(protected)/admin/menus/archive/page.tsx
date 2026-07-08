import { AccessGuard } from "@/features/access/ui/AccessGuard";
import { WeeklyMenuArchiveWorkspace } from "@/widgets/weekly-menu-admin-workspace/ui/WeeklyMenuArchiveWorkspace";

export default function AdminMenuArchivePage() {
  return (
    <AccessGuard
      allowedRoles={["OWNER", "ADMIN", "TECHNOLOGIST"]}
      requiredPermissions={["menus.manage"]}
    >
      <WeeklyMenuArchiveWorkspace />
    </AccessGuard>
  );
}
