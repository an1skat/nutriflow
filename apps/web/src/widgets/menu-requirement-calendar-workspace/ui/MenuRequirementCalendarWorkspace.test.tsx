import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  MenuRequirementCalendarMonth,
  MenuRequirementCalendarWeek,
  MenuRequirementReport,
} from "@/entities/menu-requirement/model/MenuRequirement";
import {
  exportMenuRequirementWorkbook,
  triggerMenuRequirementDownload,
} from "@/features/menu-requirement-export/api/MenuRequirementExportApi";

import {
  RequirementPeriodNavigator,
  RequirementReportDialog,
  RequirementReportTable,
} from "./MenuRequirementCalendarWorkspace";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/menu-requirement-export/api/MenuRequirementExportApi", () => ({
  exportMenuRequirementWorkbook: vi.fn(),
  triggerMenuRequirementDownload: vi.fn(),
}));

const report: MenuRequirementReport = {
  school_id: "school-1",
  school_name: "Ліцей №1",
  date_from: "2026-07-01",
  date_to: "2026-07-31",
  granularity: "month",
  meal_type: "lunch",
  school_group_id: null,
  status: "mixed",
  missing_dates: ["2026-07-08"],
  stale_dates: ["2026-07-09"],
  groups: [
    {
      school_group_id: "group-1",
      school_group_name: "6-11",
      age_group: "6-11",
      dishes: [
        {
          aggregate_key: "dish:soup",
          name: "Овочевий суп",
          kind: "dish_card",
          recipe_card_number: "12",
          yield_amount: "200",
          key_reliability: "stable",
          children_count_total: 60,
        },
      ],
      ingredient_rows: [
        {
          key: "ingredient:carrot",
          ingredient_id: "carrot",
          ingredient_name: "Морква",
          cells: [
            {
              dish_key: "dish:soup",
              net_per_person_g: "60.75",
              issue_total_raw_g: "1822.5",
              issue_total_rounded_g: 1824,
              breakdown: [
                {
                  requirement_id: "requirement-1",
                  service_date: "2026-07-06",
                  school_group_id: "group-1",
                  school_group_name: "6-11",
                  menu_title: "Меню на тиждень",
                  net_per_person_g: "20.25",
                  children_count: 30,
                  issue_total_raw_g: "607.5",
                  issue_total_rounded_g: 608,
                  status: "complete",
                },
                {
                  requirement_id: null,
                  service_date: "2026-07-08",
                  school_group_id: "group-1",
                  school_group_name: "6-11",
                  menu_title: "Меню на тиждень",
                  net_per_person_g: null,
                  children_count: null,
                  issue_total_raw_g: null,
                  issue_total_rounded_g: null,
                  status: "missing",
                },
                {
                  requirement_id: "requirement-2",
                  service_date: "2026-07-09",
                  school_group_id: "group-1",
                  school_group_name: "6-11",
                  menu_title: "Меню на тиждень",
                  net_per_person_g: "40.5",
                  children_count: 30,
                  issue_total_raw_g: "1215",
                  issue_total_rounded_g: 1216,
                  status: "stale",
                },
              ],
            },
          ],
          per_person_total_g: "60.75",
          issue_total_raw_g: "1822.5",
          issue_total_rounded_g: 1824,
        },
      ],
    },
  ],
};

const calendarWeek: MenuRequirementCalendarWeek = {
  week_index: 2,
  date_from: "2026-07-06",
  date_to: "2026-07-10",
  generated_days: 1,
  missing_days: 1,
  stale_days: 0,
  status: "missing",
  days: [
    ["2026-07-06", 0, 3, 3],
    ["2026-07-07", 0, 3, 3],
    ["2026-07-08", 0, 3, 3],
    ["2026-07-09", 2, 3, 1],
    ["2026-07-10", 0, 0, 0],
  ].map(([serviceDate, generated, expected, missing]) => ({
    service_date: String(serviceDate),
    generated_requirements: Number(generated),
    expected_requirements: Number(expected),
    missing_requirements: Number(missing),
    stale_requirements: 0,
    status: Number(missing) > 0 ? "missing" : "complete",
  })),
};

const calendarMonth: MenuRequirementCalendarMonth = {
  month: 7,
  date_from: "2026-07-01",
  date_to: "2026-07-31",
  total_days: 31,
  working_days: 5,
  generated_days: 1,
  missing_days: 1,
  stale_days: 0,
  status: "missing",
  weeks: [calendarWeek],
};

describe("RequirementReportTable", () => {
  it("emits the selected aggregated cell", () => {
    const onSelectCell = vi.fn();

    render(
      <RequirementReportTable
        report={report}
        rangeLabel="липень 2026"
        selectedCell={null}
        onSelectCell={onSelectCell}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /1\s824/ }));

    expect(onSelectCell).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientName: "Морква",
        cell: expect.objectContaining({ dish_key: "dish:soup" }),
      }),
    );
  });

  it("renders complete, missing, and stale rows when a cell is selected", () => {
    const selectedCell = {
      group: report.groups[0],
      dish: report.groups[0].dishes[0],
      ingredientName: "Морква",
      cell: report.groups[0].ingredient_rows[0].cells[0],
    };

    render(
      <RequirementReportTable
        report={report}
        rangeLabel="липень 2026"
        selectedCell={selectedCell}
        onSelectCell={() => undefined}
      />,
    );

    const breakdown = screen.getByRole("heading", {
      name: /Морква \/ Овочевий суп/,
    }).closest("section");
    expect(breakdown).not.toBeNull();
    expect(within(breakdown as HTMLElement).getByText("Готово")).toBeInTheDocument();
    expect(
      within(breakdown as HTMLElement).getByText("Пропущено"),
    ).toBeInTheDocument();
    expect(
      within(breakdown as HTMLElement).getByText("Застаріло"),
    ).toBeInTheDocument();

    const links = within(breakdown as HTMLElement).getAllByRole("link", {
      name: /Відкрити/,
    });
    expect(links[0]).toHaveAttribute(
      "href",
      "/menu-requirements?requirement_id=requirement-1",
    );
    expect(within(breakdown as HTMLElement).getByText("Немає")).toBeInTheDocument();
  });
});

describe("RequirementPeriodNavigator", () => {
  const defaultProps = {
    months: [calendarMonth],
    year: 2026,
    onSelectMonth: vi.fn(),
    onSelectWeek: vi.fn(),
    onBackToMonths: vi.fn(),
    onBackToWeeks: vi.fn(),
    onOpenReport: vi.fn(),
  };

  it("shows one calendar level at a time", () => {
    const { rerender } = render(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={null}
        selectedWeek={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "Місяці · 2026" })).toBeInTheDocument();
    expect(screen.queryByText("Тиждень 2")).not.toBeInTheDocument();

    rerender(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={calendarMonth}
        selectedWeek={null}
      />,
    );

    expect(screen.getByRole("heading", { name: /Тижні/ })).toBeInTheDocument();
    expect(screen.getByText("Тиждень 2")).toBeInTheDocument();
    expect(screen.queryByText("9 липня")).not.toBeInTheDocument();

    rerender(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={calendarMonth}
        selectedWeek={calendarWeek}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Робочі дні · тиждень 2" }),
    ).toBeInTheDocument();
    expect(screen.getByText("9 липня")).toBeInTheDocument();
    expect(screen.queryByText("Тиждень 2")).not.toBeInTheDocument();
  });

  it("opens a daily report for the chosen day", () => {
    const onOpenReport = vi.fn();

    render(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={calendarMonth}
        selectedWeek={calendarWeek}
        onOpenReport={onOpenReport}
      />,
    );

    const dayCard = screen.getByText("9 липня").closest("article");
    expect(dayCard).not.toBeNull();
    expect(within(dayCard as HTMLElement).getByText("2")).toBeInTheDocument();
    fireEvent.click(
      within(dayCard as HTMLElement).getByRole("button", {
        name: "Відкрити меню-вимоги",
      }),
    );

    expect(onOpenReport).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: "2026-07-09",
        dateTo: "2026-07-09",
        granularity: "day",
      }),
    );
  });
});

describe("RequirementReportDialog", () => {
  it("keeps the report table inside a closable modal", () => {
    const onClose = vi.fn();

    render(
      <RequirementReportDialog
        range={{
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          granularity: "month",
          label: "липень 2026 р.",
        }}
        report={report}
        isPending={false}
        isError={false}
        error={null}
        selectedCell={null}
        onSelectCell={() => undefined}
        onRetry={() => undefined}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "липень 2026 р.",
    });
    expect(within(dialog).getByRole("table")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Експорт в Excel" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("exports calendar reports without the active group filter", async () => {
    vi.mocked(exportMenuRequirementWorkbook).mockResolvedValue({
      blob: new Blob(["xlsx"]),
      filename: "menu-requirement.xlsx",
    });

    render(
      <RequirementReportDialog
        range={{
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          granularity: "month",
          label: "липень 2026 р.",
        }}
        report={{ ...report, school_group_id: "group-1" }}
        isPending={false}
        isError={false}
        error={null}
        selectedCell={null}
        onSelectCell={() => undefined}
        onRetry={() => undefined}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Експорт в Excel" }));

    await waitFor(() =>
      expect(exportMenuRequirementWorkbook).toHaveBeenCalledWith({
        kind: "report",
        request: {
          school_id: "school-1",
          date_from: "2026-07-01",
          date_to: "2026-07-31",
          granularity: "month",
          meal_type: "lunch",
        },
      }),
    );
    expect(triggerMenuRequirementDownload).toHaveBeenCalled();
  });
});
