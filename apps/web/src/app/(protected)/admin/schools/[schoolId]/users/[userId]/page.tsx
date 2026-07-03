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
  return <SchoolUserDetails schoolId={schoolId} userId={userId} />;
}
