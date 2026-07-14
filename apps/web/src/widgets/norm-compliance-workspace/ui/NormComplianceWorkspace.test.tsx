import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useNormComplianceReport } from "@/entities/norm-compliance/api/NormComplianceQueries";
import { downloadNormComplianceReport } from "@/entities/norm-compliance/api/NormComplianceApi";
import { normComplianceReportSchema } from "@/entities/norm-compliance/model/NormCompliance";

import {
  NormComplianceReportView,
  NormComplianceWorkspace,
} from "./NormComplianceWorkspace";

let searchParamsValue =
  "school_id=school-1&date_from=2026-07-06&date_to=2026-07-10&meal_type=lunch&school_group_id=group-1&source=menu-requirements-calendar";

vi.mock("@/entities/norm-compliance/api/NormComplianceQueries", () => ({
  useNormComplianceReport: vi.fn(),
}));
vi.mock("@/entities/norm-compliance/api/NormComplianceApi", () => ({
  downloadNormComplianceReport: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

const report = normComplianceReportSchema.parse({
  school_id: "school-1",
  school_name: "Ліцей №1",
  date_from: "2026-07-06",
  date_to: "2026-07-10",
  status: "mixed",
  groups: [
    {
      school_group_id: "group-1",
      school_group_name: "1-А",
      age_group: "6-11",
      status: "mixed",
      sections: [
        {
          meal_type: "lunch",
          status: "mixed",
          expected_dates: ["2026-07-06", "2026-07-07"],
          missing_dates: ["2026-07-07"],
          stale_dates: ["2026-07-06"],
          rows: [
            {
              normative_group_code: "vegetables",
              normative_group_name: "Овочі",
              characteristic: "Різноманітні та сезонні",
              frequency: "Щодня разом із зеленню",
              source_appendix: "9-1",
              required_portions: "5",
              actual_portions: "3",
              required_amount: "500",
              actual_amount: "300",
              unit: "g",
              percent: "60",
              deviation: "-200",
              status: "mixed",
              tolerance: {
                minimum_percent: "90",
                maximum_percent: "110",
                description: "90–110%",
              },
              breakdown: [
                {
                  requirement_id: "requirement-1",
                  service_date: "2026-07-06",
                  menu_item_id: "item-1",
                  dish_name: "Борщ",
                  source_type: "ingredient",
                  source_id: "ingredient-1",
                  source_name: "Капуста",
                  amount: "100",
                  unit: "g",
                  portion_equivalent: "1",
                },
              ],
              unmapped_items: [
                {
                  requirement_id: "requirement-2",
                  service_date: "2026-07-07",
                  menu_item_id: "item-2",
                  item_name: "Невідома страва",
                  reason: "No normative contribution snapshot is available",
                },
              ],
            },
          ],
          unmapped_items: [
            {
              requirement_id: "requirement-2",
              service_date: "2026-07-07",
              menu_item_id: "item-2",
              item_name: "Невідома страва",
              reason: "No normative contribution snapshot is available",
            },
          ],
        },
      ],
    },
  ],
});

describe("NormComplianceReportView", () => {
  it("renders unmapped, missing, and stale states and explains a selected row", () => {
    const onSelectRow = vi.fn();
    render(
      <NormComplianceReportView
        report={report}
        selectedRow={null}
        onSelectRow={onSelectRow}
        onCloseDetails={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: /Не визначено нормативну групу/ })).toBeInTheDocument();
    expect(screen.getByText("Невідома страва")).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Овочі" }));
    expect(onSelectRow).toHaveBeenCalledWith(
      expect.objectContaining({ row: expect.objectContaining({ normative_group_code: "vegetables" }) }),
    );
  });

  it("opens the contribution explanation when a row is selected", () => {
    const selection = {
      group: report.groups[0],
      section: report.groups[0].sections[0],
      row: report.groups[0].sections[0].rows[0],
    };

    render(
      <NormComplianceReportView
        report={report}
        selectedRow={selection}
        onSelectRow={() => undefined}
        onCloseDetails={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Немає меню-вимоги:", { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText("Застаріла меню-вимога:", { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText("Борщ")).toBeInTheDocument();
    expect(within(dialog).getByText("За інгредієнтом")).toBeInTheDocument();
  });
});

describe("NormComplianceWorkspace", () => {
  beforeEach(() => {
    searchParamsValue =
      "school_id=school-1&date_from=2026-07-06&date_to=2026-07-10&meal_type=lunch&school_group_id=group-1&source=menu-requirements-calendar";
    vi.mocked(downloadNormComplianceReport).mockResolvedValue();
  });

  it("exports the report with the active calendar filters", async () => {
    vi.mocked(useNormComplianceReport).mockReturnValue({
      data: report,
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useNormComplianceReport>);

    render(<NormComplianceWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Експорт в Excel" }));

    await waitFor(() =>
      expect(downloadNormComplianceReport).toHaveBeenCalledWith({
        school_id: "school-1",
        date_from: "2026-07-06",
        date_to: "2026-07-10",
        meal_type: "lunch",
        school_group_id: "group-1",
      }),
    );
  });

  it("uses the concrete week transferred by the calendar without editable filters", () => {
    vi.mocked(useNormComplianceReport).mockReturnValue({
      data: report,
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useNormComplianceReport>);

    render(<NormComplianceWorkspace />);

    expect(
      screen.getAllByRole("heading", { name: /06 лип.*10 лип/ }),
    ).toHaveLength(2);
    expect(screen.getByText("1-А · 6-11 років")).toBeInTheDocument();
    expect(screen.getByText("Оновити звіт")).toBeInTheDocument();
    expect(screen.queryByLabelText("Дата від")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Дата до")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Школа" })).not.toBeInTheDocument();
    expect(useNormComplianceReport).toHaveBeenCalledWith(
      expect.objectContaining({
        school_id: "school-1",
        date_from: "2026-07-06",
        date_to: "2026-07-10",
        meal_type: "lunch",
        school_group_id: "group-1",
        enabled: true,
      }),
    );
  });

  it("blocks direct report access without the menu-requirements calendar source", () => {
    searchParamsValue =
      "school_id=school-1&date_from=2026-07-06&date_to=2026-07-10&meal_type=lunch&school_group_id=group-1";
    vi.mocked(useNormComplianceReport).mockReturnValue({
      data: report,
      isPending: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useNormComplianceReport>);

    render(<NormComplianceWorkspace />);

    expect(
      screen.getByText("Звіт формується тільки з календаря"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Оновити звіт")).not.toBeInTheDocument();
    expect(useNormComplianceReport).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });
});
