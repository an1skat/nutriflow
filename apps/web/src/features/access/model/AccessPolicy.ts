import type {
  AdminPermission,
  AuthUser,
  UserRole,
} from "@/entities/session/model/Session";

export type RouteAccessDecision =
  | "allow"
  | "unauthenticated"
  | "forbidden-role"
  | "forbidden-tenant";

type AccessRequirements = {
  allowedRoles?: readonly UserRole[];
  requiredPermissions?: readonly AdminPermission[];
  schoolId?: string;
};

export function getHomePath(user: AuthUser): string {
  switch (user.role) {
    case "OWNER":
    case "ADMIN":
    case "SCHOOL_USER":
      return "/";
  }
}

export function isBackofficeUser(user: AuthUser): boolean {
  return user.role === "OWNER" || user.role === "ADMIN";
}

export function hasPermission(
  user: AuthUser,
  permission: AdminPermission,
): boolean {
  return user.role === "OWNER" || user.permissions.includes(permission);
}

export function hasEveryPermission(
  user: AuthUser,
  permissions: readonly AdminPermission[],
): boolean {
  return permissions.every((permission) => hasPermission(user, permission));
}

export function canAccessPath(user: AuthUser, path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return isBackofficeUser(user);
  }

  return true;
}

export function getPostLoginPath(
  user: AuthUser,
  requestedPath: string,
): { path: string; denied: boolean } {
  if (canAccessPath(user, requestedPath)) {
    return { path: requestedPath, denied: false };
  }

  return { path: getHomePath(user), denied: true };
}

export function canAccessSchool(
  user: AuthUser,
  requestedSchoolId: string,
): boolean {
  return isBackofficeUser(user) || user.school_id === requestedSchoolId;
}

export function getRouteAccess(
  user: AuthUser | null,
  requirements: AccessRequirements = {},
): RouteAccessDecision {
  if (!user) {
    return "unauthenticated";
  }

  if (
    requirements.allowedRoles &&
    !requirements.allowedRoles.includes(user.role)
  ) {
    return "forbidden-role";
  }

  if (
    requirements.requiredPermissions &&
    !hasEveryPermission(user, requirements.requiredPermissions)
  ) {
    return "forbidden-role";
  }

  if (
    requirements.schoolId !== undefined &&
    !canAccessSchool(user, requirements.schoolId)
  ) {
    return "forbidden-tenant";
  }

  return "allow";
}
