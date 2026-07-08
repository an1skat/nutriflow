import { AccessGuard } from "@/features/access/ui/AccessGuard";
import { MenuChangeRequestsWorkspace } from "@/widgets/menu-change-requests/ui/MenuChangeRequestsWorkspace";

export default function MenuChangesPage() {
  return (
    <AccessGuard allowedRoles={["OWNER", "TECHNOLOGIST"]}>
      <MenuChangeRequestsWorkspace />
    </AccessGuard>
  );
}
