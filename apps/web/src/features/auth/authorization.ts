import type { AuthUser, UserRole } from "./model";

export type RouteAccessDecision =
  | "allow"
  | "unauthenticated"
  | "forbidden-role"
  | "forbidden-tenant";

type AccessRequirements = {
  allowedRoles?: readonly UserRole[];
  schoolId?: string;
};

export function canAccessSchool(
  user: AuthUser,
  requestedSchoolId: string,
): boolean {
  return user.role === "ADMIN" || user.school_id === requestedSchoolId;
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
    requirements.schoolId !== undefined &&
    !canAccessSchool(user, requirements.schoolId)
  ) {
    return "forbidden-tenant";
  }

  return "allow";
}
