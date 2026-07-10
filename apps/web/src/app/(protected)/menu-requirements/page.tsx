import { AccessGuard } from "@/features/access/ui/AccessGuard";
import { MenuRequirementSchoolWorkspace } from "@/widgets/menu-requirement-school-workspace/ui/MenuRequirementSchoolWorkspace";

export default function MenuRequirementsPage() {
  return (
    <AccessGuard
      allowedRoles={["OWNER", "ADMIN", "TECHNOLOGIST", "SCHOOL_USER"]}
    >
      <MenuRequirementSchoolWorkspace />
    </AccessGuard>
  );
}
