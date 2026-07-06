import { AccessGuard } from "@/features/access/ui/AccessGuard";
import { SchoolUserDetails } from "@/widgets/school-user-details/ui/SchoolUserDetails";

type SchoolUserPageProps = {
  params: Promise<{
    schoolId: string;
    userId: string;
  }>;
};

export default async function SchoolUserPage({
  params,
}: SchoolUserPageProps) {
  const { schoolId, userId } = await params;
  return (
    <AccessGuard requiredPermissions={["school_users.manage"]}>
      <SchoolUserDetails schoolId={schoolId} userId={userId} />
    </AccessGuard>
  );
}
