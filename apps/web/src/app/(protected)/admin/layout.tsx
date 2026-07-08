import type { ReactNode } from "react";

import { AccessGuard } from "@/features/access/ui/AccessGuard";

export default function AdminRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AccessGuard allowedRoles={["OWNER", "ADMIN", "TECHNOLOGIST"]}>
      {children}
    </AccessGuard>
  );
}
