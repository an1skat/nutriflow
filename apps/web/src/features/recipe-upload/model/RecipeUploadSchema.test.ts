import { describe, expect, it } from "vitest";

import { orZero } from "./RecipeUploadSchema";

describe("recipe upload schema helpers", () => {
  it("maps empty nutrition input to zero", () => {
    expect(orZero("")).toBe("0");
    expect(orZero("   ")).toBe("0");
    expect(orZero(" 1.25 ")).toBe("1.25");
  });
});
