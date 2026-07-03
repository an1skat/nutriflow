import { describe, expect, it } from "vitest";

import {
  deleteSchoolFormSchema,
  editSchoolFormSchema,
  schoolFormSchema,
} from "./SchoolFormSchema";

describe("school form schemas", () => {
  it("trims school values", () => {
    expect(
      schoolFormSchema.parse({
        name: "  Ліцей №1  ",
        code: "  school-1  ",
      }),
    ).toEqual({
      name: "Ліцей №1",
      code: "school-1",
    });
  });

  it("requires a valid name and code", () => {
    expect(
      schoolFormSchema.safeParse({
        name: "",
        code: "A",
      }).success,
    ).toBe(false);
  });

  it("keeps the active flag in edit mode", () => {
    expect(
      editSchoolFormSchema.parse({
        name: "Ліцей №1",
        code: "SCHOOL-1",
        is_active: false,
      }).is_active,
    ).toBe(false);
  });

  it("requires the admin password before school deletion", () => {
    expect(deleteSchoolFormSchema.safeParse({ password: "" }).success).toBe(
      false,
    );
    expect(deleteSchoolFormSchema.safeParse({ password: "   " }).success).toBe(
      false,
    );
    expect(
      deleteSchoolFormSchema.parse({ password: "admin-password-123" }),
    ).toEqual({
      password: "admin-password-123",
    });
  });
});
