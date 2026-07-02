import { describe, expect, it } from "vitest";

import {
  canAccessSchool,
  getRouteAccess,
} from "./authorization";
import type { AuthUser } from "./model";

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
});
