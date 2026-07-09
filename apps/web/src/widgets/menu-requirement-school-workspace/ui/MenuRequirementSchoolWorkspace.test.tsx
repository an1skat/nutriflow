import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MenuRequirement } from "@/entities/menu-requirement/model/MenuRequirement";

import { MenuRequirementTable } from "./MenuRequirementSchoolWorkspace";

const requirement: MenuRequirement = {
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
    {
      menu_item_id: "item-2",
      position: 2,
      kind: "dish_card",
      name: "Каша",
      recipe_card_number: "13",
      dish_card_id: "dish-2",
      dish_card_version_id: "version-2",
      portion_variant_id: "portion-2",
      product_ingredient_id: null,
      yield_amount: "120",
      children_count: 2,
    },
  ],
  ingredient_rows: [
    {
      key: "ingredient:salt",
      ingredient_id: "salt",
      ingredient_name: "Сіль",
      cells: [
        { menu_item_id: "item-1", net_per_person_g: "3.2" },
        { menu_item_id: "item-2", net_per_person_g: "5.1" },
      ],
      per_person_total_g: "8.3",
      issue_total_raw_g: "19.8",
      issue_total_rounded_g: 20,
    },
    {
      key: "ingredient:sugar",
      ingredient_id: "sugar",
      ingredient_name: "Цукор",
      cells: [],
      per_person_total_g: "0",
      issue_total_raw_g: "0",
      issue_total_rounded_g: 0,
    },
  ],
  source_day_hash: "a".repeat(64),
  revision: 1,
  generated_by: "user-1",
  generated_at: "2026-07-06T12:00:00Z",
  created_at: "2026-07-06T12:00:00Z",
  updated_at: "2026-07-06T12:00:00Z",
};

describe("MenuRequirementTable", () => {
  it("renders dish cells, totals, and missing ingredient markers", () => {
    render(<MenuRequirementTable requirement={requirement} />);

    expect(screen.getByRole("columnheader", { name: /Суп/ })).toHaveTextContent(
      "Дітей: 3",
    );
    expect(
      screen.getByRole("columnheader", { name: /Каша/ }),
    ).toHaveTextContent("Вихід: 120 г");

    const saltRow = screen.getByRole("row", { name: /Сіль/ });
    expect(within(saltRow).getByText("3,2")).toBeInTheDocument();
    expect(within(saltRow).getByText("5,1")).toBeInTheDocument();
    expect(within(saltRow).getByText("8,3")).toBeInTheDocument();
    expect(within(saltRow).getByText("20")).toBeInTheDocument();

    const sugarRow = screen.getByRole("row", { name: /Цукор/ });
    expect(within(sugarRow).getAllByText("—")).toHaveLength(2);
  });
});
