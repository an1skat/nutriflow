import { AccessGuard } from "@/features/access/ui/AccessGuard";
import { MenuChangeRequestsWorkspace } from "@/widgets/menu-change-requests/ui/MenuChangeRequestsWorkspace";

export default async function MenuChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string | string[] }>;
}) {
  const requestIdParam = (await searchParams).requestId;
  const initialRequestId = Array.isArray(requestIdParam)
    ? requestIdParam[0]
    : requestIdParam;

  return (
    <AccessGuard allowedRoles={["OWNER", "TECHNOLOGIST"]}>
      <MenuChangeRequestsWorkspace initialRequestId={initialRequestId} />
    </AccessGuard>
  );
}
