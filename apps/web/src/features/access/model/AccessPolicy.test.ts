import { describe, expect, it } from "vitest";

import {
  canAccessPath,
  canAccessSchool,
  getHomePath,
  getPostLoginPath,
  getRouteAccess,
  hasPermission,
} from "./AccessPolicy";
import type { AuthUser } from "@/entities/session/model/Session";

const owner: AuthUser = {
  id: "owner-id",
  username: "owner",
  email: "owner@example.com",
  role: "OWNER",
  school_id: null,
  permissions: [
    "schools.manage",
    "school_users.manage",
    "school_groups.manage",
    "menus.manage",
    "recipes.manage",
  ],
  is_active: true,
};

const admin: AuthUser = {
  id: "admin-id",
  username: "admin",
  email: "admin@example.com",
  role: "ADMIN",
  school_id: null,
  permissions: ["schools.manage"],
  is_active: true,
};

const schoolUser: AuthUser = {
  id: "school-user-id",
  username: "school.user",
  email: null,
  role: "SCHOOL_USER",
  school_id: "school-a",
  permissions: [],
  is_active: true,
};

describe("authorization", () => {
  it("requires authentication", () => {
    expect(getRouteAccess(null)).toBe("unauthenticated");
  });

  it("enforces roles", () => {
    expect(getRouteAccess(owner, { allowedRoles: ["OWNER"] })).toBe("allow");
    expect(getRouteAccess(admin, { allowedRoles: ["ADMIN"] })).toBe("allow");
    expect(
      getRouteAccess(schoolUser, {
        allowedRoles: ["ADMIN"],
      }),
    ).toBe("forbidden-role");
  });

  it("allows backoffice users to access schools", () => {
    expect(canAccessSchool(owner, "school-b")).toBe(true);
    expect(canAccessSchool(admin, "school-b")).toBe(true);
  });

  it("enforces permissions", () => {
    expect(hasPermission(owner, "recipes.manage")).toBe(true);
    expect(hasPermission(admin, "schools.manage")).toBe(true);
    expect(hasPermission(admin, "recipes.manage")).toBe(false);
    expect(
      getRouteAccess(admin, {
        requiredPermissions: ["recipes.manage"],
      }),
    ).toBe("forbidden-role");
  });

  it("limits a school user to their own school", () => {
    expect(canAccessSchool(schoolUser, "school-a")).toBe(true);
    expect(canAccessSchool(schoolUser, "school-b")).toBe(false);
    expect(
      getRouteAccess(schoolUser, {
        schoolId: "school-b",
      }),
    ).toBe("forbidden-tenant");
  });

  it("provides a safe home route for every role", () => {
    expect(getHomePath(owner)).toBe("/");
    expect(getHomePath(admin)).toBe("/");
    expect(getHomePath(schoolUser)).toBe("/menu");
  });

  it("keeps admin routes hidden from school users", () => {
    expect(canAccessPath(owner, "/admin/access")).toBe(true);
    expect(canAccessPath(admin, "/admin/schools")).toBe(true);
    expect(canAccessPath(schoolUser, "/admin/schools")).toBe(false);
    expect(canAccessPath(schoolUser, "/?tab=account")).toBe(true);
  });

  it("falls back after login when the requested route is forbidden", () => {
    expect(getPostLoginPath(admin, "/admin/schools")).toEqual({
      path: "/admin/schools",
      denied: false,
    });
    expect(getPostLoginPath(schoolUser, "/admin/schools")).toEqual({
      path: "/menu",
      denied: true,
    });
  });
});
