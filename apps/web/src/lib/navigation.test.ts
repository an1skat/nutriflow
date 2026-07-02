import { describe, expect, it } from "vitest";

import { getSafeReturnPath } from "./navigation";

describe("getSafeReturnPath", () => {
  it("accepts an internal path", () => {
    expect(getSafeReturnPath("/admin?tab=users")).toBe("/admin?tab=users");
  });

  it("rejects external URLs", () => {
    expect(getSafeReturnPath("https://example.com")).toBe("/");
    expect(getSafeReturnPath("//example.com")).toBe("/");
    expect(getSafeReturnPath("/\\example.com")).toBe("/");
  });

  it("avoids a login redirect loop", () => {
    expect(getSafeReturnPath("/login?next=/login")).toBe("/");
  });
});
