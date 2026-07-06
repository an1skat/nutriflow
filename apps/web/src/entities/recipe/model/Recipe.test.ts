import { describe, expect, it } from "vitest";

import { nutritionSchema } from "./Recipe";

describe("recipe schemas", () => {
  it("requires nutrition fields as decimal strings", () => {
    expect(
      nutritionSchema.parse({
        kcal: "0",
        proteins: "0",
        fats: "0",
        carbs: "0",
      }),
    ).toEqual({
      kcal: "0",
      proteins: "0",
      fats: "0",
      carbs: "0",
    });
  });

  it("rejects nullable nutrition values", () => {
    expect(
      nutritionSchema.safeParse({
        kcal: null,
        proteins: "0",
        fats: "0",
        carbs: "0",
      }).success,
    ).toBe(false);
  });
});
