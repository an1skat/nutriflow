import { describe, expect, it } from "vitest";

import {
  generateMenuRequirementsResponseSchema,
  menuRequirementSchema,
} from "./MenuRequirement";

const requirement = {
  id: "requirement-1",
  school_id: "school-1",
  weekly_menu_id: "menu-1",
  source_menu_id: "source-1",
  menu_title: "Меню на тиждень",
  meal_type: "lunch",
  weekday: "monday",
  service_date: "2026-07-06",
  school_group_id: "group-1",
  school_group_name: "1-А",
  age_group: "6-11",
  dishes: [
    {
      menu_item_id: "item-1",
      position: 1,
      kind: "dish_card",
      name: "Суп",
      recipe_card_number: "12",
      dish_card_id: "dish-1",
      dish_card_version_id: "version-1",
      portion_variant_id: "portion-1",
      product_ingredient_id: null,
      yield_amount: "200",
      children_count: 3,
    },
  ],
  ingredient_rows: [
    {
      key: "ingredient:carrot",
      ingredient_id: "carrot",
      ingredient_name: "Морква",
      cells: [
        {
          menu_item_id: "item-1",
          net_per_person_g: "20.25",
        },
      ],
      per_person_total_g: "20.25",
      issue_total_raw_g: "60.75",
      issue_total_rounded_g: 61,
    },
  ],
  source_day_hash: "a".repeat(64),
  revision: 1,
  generated_by: "user-1",
  generated_at: "2026-07-06T12:00:00Z",
  created_at: "2026-07-06T12:00:00Z",
  updated_at: "2026-07-06T12:00:00Z",
} as const;

describe("menu requirement contract", () => {
  it("parses decimal values as exact strings", () => {
    const parsed = menuRequirementSchema.parse(requirement);

    expect(parsed.ingredient_rows[0].cells[0].net_per_person_g).toBe("20.25");
    expect(parsed.ingredient_rows[0].issue_total_raw_g).toBe("60.75");
    expect(parsed.ingredient_rows[0].issue_total_rounded_g).toBe(61);
  });

  it("requires generated responses to contain at least one group", () => {
    expect(() =>
      generateMenuRequirementsResponseSchema.parse({ items: [] }),
    ).toThrow();
    expect(
      generateMenuRequirementsResponseSchema.parse({ items: [requirement] })
        .items,
    ).toHaveLength(1);
  });
});
