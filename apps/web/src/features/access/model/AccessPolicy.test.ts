import { describe, expect, it } from "vitest";

import {
  canAccessPath,
  canAccessSchool,
  getHomePath,
  getPostLoginPath,
  getRouteAccess,
} from "./AccessPolicy";
import type { AuthUser } from "@/entities/session/model/Session";

const admin: AuthUser = {
  id: "admin-id",
  username: "admin",
  email: "admin@example.com",
  role: "ADMIN",
  school_id: null,
  is_active: true,
};

const schoolUser: AuthUser = {
  id: "school-user-id",
  username: "school.user",
  email: null,
  role: "SCHOOL_USER",
  school_id: "school-a",
  is_active: true,
};

describe("authorization", () => {
  it("requires authentication", () => {
    expect(getRouteAccess(null)).toBe("unauthenticated");
  });

  it("enforces roles", () => {
    expect(getRouteAccess(admin, { allowedRoles: ["ADMIN"] })).toBe("allow");
    expect(
      getRouteAccess(schoolUser, {
        allowedRoles: ["ADMIN"],
      }),
    ).toBe("forbidden-role");
  });

  it("allows an admin to access any school", () => {
    expect(canAccessSchool(admin, "school-b")).toBe(true);
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
    expect(getHomePath(admin)).toBe("/");
    expect(getHomePath(schoolUser)).toBe("/");
  });

  it("keeps admin routes hidden from school users", () => {
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
      path: "/",
      denied: true,
    });
  });
});
