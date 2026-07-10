import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { MenuRequirement } from "@/entities/menu-requirement/model/MenuRequirement";
import type { AuthUser } from "@/entities/session/model/Session";
import { ConfirmDialogProvider } from "@/shared/ui/ConfirmDialog";

import {
  filterRequirementsForUser,
  MenuRequirementTable,
  RequirementNavigator,
} from "./MenuRequirementSchoolWorkspace";

const requirement: MenuRequirement = {
  id: "requirement-1",
  school_id: "school-1",
  school_name: "Ліцей №1",
  school_admin_owner_id: "admin-1",
  school_admin_owner_username: "admin.one",
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

const otherRequirement: MenuRequirement = {
  ...requirement,
  id: "requirement-2",
  school_id: "school-2",
  school_name: "Гімназія №2",
  school_admin_owner_id: "admin-2",
  school_admin_owner_username: "admin.two",
  school_group_id: "group-2",
  school_group_name: "2-Б",
};

const schoolUser: AuthUser = {
  id: "school-user-1",
  username: "school.one",
  email: null,
  role: "SCHOOL_USER",
  school_id: "school-1",
  permissions: [],
  is_active: true,
};

const adminUser: AuthUser = {
  id: "admin-1",
  username: "admin.one",
  email: "admin.one@example.com",
  role: "ADMIN",
  school_id: null,
  permissions: [],
  is_active: true,
};

function renderWithConfirm(ui: ReactElement) {
  return render(<ConfirmDialogProvider>{ui}</ConfirmDialogProvider>);
}

describe("MenuRequirementTable", () => {
  it("renders dish cells, totals, and missing ingredient markers", () => {
    renderWithConfirm(<MenuRequirementTable requirement={requirement} />);

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
    expect(
      screen.getByRole("button", { name: "Експорт меню-вимоги" }),
    ).toBeInTheDocument();
  });

  it("hides school and administrator hierarchy for a school user", () => {
    renderWithConfirm(
      <MenuRequirementTable
        requirement={requirement}
        showSchoolName={false}
      />,
    );

    expect(screen.queryByText("Ліцей №1")).not.toBeInTheDocument();
    expect(screen.queryByText(/Адміністратор:/)).not.toBeInTheDocument();
    expect(screen.getByText("1-А")).toBeInTheDocument();
  });

  it("confirms and calls delete for users with delete access", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);

    renderWithConfirm(
      <MenuRequirementTable
        requirement={requirement}
        deletable
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Видалити/ }));

    const dialog = screen.getByRole("dialog", {
      name: "Видалити меню-вимогу?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Видалити" }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
});

describe("RequirementNavigator", () => {
  it("shows a flat requirement list without schools or administrators to a school user", () => {
    render(
      <RequirementNavigator
        requirements={[requirement]}
        viewerRole="SCHOOL_USER"
        selectedId={requirement.id}
        onSelect={() => undefined}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Меню-вимоги" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ліцей №1")).not.toBeInTheDocument();
    expect(screen.queryByText(/Адміністратор:/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Оберіть школу, день і групу."),
    ).not.toBeInTheDocument();
  });

  it("groups schools without showing administrator hierarchy to an admin", () => {
    render(
      <RequirementNavigator
        requirements={[requirement]}
        viewerRole="ADMIN"
        selectedId={requirement.id}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText("Ліцей №1")).toBeInTheDocument();
    expect(screen.queryByText(/Адміністратор:/)).not.toBeInTheDocument();
    expect(screen.queryByText("admin.one")).not.toBeInTheDocument();
  });
});

describe("filterRequirementsForUser", () => {
  it("keeps only the current school requirements for a school user", () => {
    expect(
      filterRequirementsForUser(
        [requirement, otherRequirement],
        schoolUser,
      ).map((item) => item.id),
    ).toEqual(["requirement-1"]);
  });

  it("keeps only the assigned administrator requirements for an admin", () => {
    expect(
      filterRequirementsForUser(
        [requirement, otherRequirement],
        adminUser,
      ).map((item) => item.id),
    ).toEqual(["requirement-1"]);
  });
});
