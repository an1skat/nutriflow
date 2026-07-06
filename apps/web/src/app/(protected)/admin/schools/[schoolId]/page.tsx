import { AccessGuard } from "@/features/access/ui/AccessGuard";
import { SchoolDetails } from "@/widgets/school-details/ui/SchoolDetails";

type SchoolPageProps = {
  params: Promise<{
    schoolId: string;
  }>;
};

export default async function SchoolPage({ params }: SchoolPageProps) {
  const { schoolId } = await params;
  return (
    <AccessGuard requiredPermissions={["schools.manage"]}>
      <SchoolDetails schoolId={schoolId} />
    </AccessGuard>
  );
}
