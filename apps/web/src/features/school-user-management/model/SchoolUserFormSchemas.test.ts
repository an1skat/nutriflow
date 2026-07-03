import { describe, expect, it } from "vitest";

import {
  createSchoolUserFormSchema,
  resetSchoolUserPasswordFormSchema,
} from "./SchoolUserFormSchemas";

describe("school user form schemas", () => {
  it("accepts a valid school user", () => {
    expect(
      createSchoolUserFormSchema.safeParse({
        username: "school.user",
        email: "school.user@example.com",
        password: "secure-password-123",
      }).success,
    ).toBe(true);
  });

  it("rejects uppercase and unsupported username characters", () => {
    expect(
      createSchoolUserFormSchema.safeParse({
        username: "School User",
        email: "",
        password: "secure-password-123",
      }).success,
    ).toBe(false);
  });

  it("requires matching reset passwords", () => {
    const result = resetSchoolUserPasswordFormSchema.safeParse({
      password: "secure-password-123",
      passwordConfirmation: "different-password",
    });

    expect(result.success).toBe(false);
  });
});
