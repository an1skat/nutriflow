import type { ReactNode } from 'react';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  MenuRequirementCalendarMonth,
  MenuRequirementCalendarWeek,
  MenuRequirementReport,
} from '@/entities/menu-requirement/model/MenuRequirement';
import {
  exportMenuRequirementWorkbook,
  triggerMenuRequirementDownload,
} from '@/features/menu-requirement-export/api/MenuRequirementExportApi';

import {
  RequirementPeriodNavigator,
  RequirementReportDialog,
  RequirementReportTable,
  buildNormComplianceHref,
  getCurrentCalendarWeek,
  getCurrentSchoolRequirementPeriod,
} from './MenuRequirementCalendarWorkspace';

vi.mock('next/link', () => ({
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

vi.mock('@/features/menu-requirement-export/api/MenuRequirementExportApi', () => ({
  exportMenuRequirementWorkbook: vi.fn(),
  triggerMenuRequirementDownload: vi.fn(),
}));

const report: MenuRequirementReport = {
  school_id: 'school-1',
  school_name: 'Ліцей №1',
  date_from: '2026-07-01',
  date_to: '2026-07-31',
  granularity: 'month',
  meal_type: 'lunch',
  school_group_id: null,
  status: 'mixed',
  missing_dates: ['2026-07-08'],
  stale_dates: ['2026-07-09'],
  groups: [
    {
      school_group_id: 'group-1',
      school_group_name: '6-11',
      age_group: '6-11',
      dishes: [
        {
          aggregate_key: 'dish:soup',
          name: 'Овочевий суп',
          kind: 'dish_card',
          recipe_card_number: '12',
          yield_amount: '200',
          key_reliability: 'stable',
          children_count_total: 60,
        },
      ],
      ingredient_rows: [
        {
          key: 'ingredient:carrot',
          ingredient_id: 'carrot',
          ingredient_name: 'Морква',
          cells: [
            {
              dish_key: 'dish:soup',
              net_per_person_g: '60.75',
              gross_per_person_g: '75',
              issue_total_raw_g: '1822.5',
              issue_total_rounded_g: 1824,
              gross_issue_total_raw_g: '2250',
              gross_issue_total_rounded_g: 2250,
              breakdown: [
                {
                  requirement_id: 'requirement-1',
                  service_date: '2026-07-06',
                  school_group_id: 'group-1',
                  school_group_name: '6-11',
                  menu_title: 'Меню на тиждень',
                  net_per_person_g: '20.25',
                  gross_per_person_g: '25',
                  children_count: 30,
                  issue_total_raw_g: '607.5',
                  issue_total_rounded_g: 608,
                  gross_issue_total_raw_g: '750',
                  gross_issue_total_rounded_g: 750,
                  status: 'complete',
                },
                {
                  requirement_id: null,
                  service_date: '2026-07-08',
                  school_group_id: 'group-1',
                  school_group_name: '6-11',
                  menu_title: 'Меню на тиждень',
                  net_per_person_g: null,
                  gross_per_person_g: null,
                  children_count: null,
                  issue_total_raw_g: null,
                  issue_total_rounded_g: null,
                  gross_issue_total_raw_g: null,
                  gross_issue_total_rounded_g: null,
                  status: 'missing',
                },
                {
                  requirement_id: 'requirement-2',
                  service_date: '2026-07-09',
                  school_group_id: 'group-1',
                  school_group_name: '6-11',
                  menu_title: 'Меню на тиждень',
                  net_per_person_g: '40.5',
                  gross_per_person_g: '50',
                  children_count: 30,
                  issue_total_raw_g: '1215',
                  issue_total_rounded_g: 1216,
                  gross_issue_total_raw_g: '1500',
                  gross_issue_total_rounded_g: 1500,
                  status: 'stale',
                },
              ],
            },
          ],
          per_person_total_g: '60.75',
          issue_total_raw_g: '1822.5',
          issue_total_rounded_g: 1824,
          gross_per_person_total_g: '75',
          gross_issue_total_raw_g: '2250',
          gross_issue_total_rounded_g: 2250,
        },
      ],
    },
  ],
};

const calendarWeek: MenuRequirementCalendarWeek = {
  week_index: 2,
  date_from: '2026-07-06',
  date_to: '2026-07-10',
  generated_days: 1,
  missing_days: 1,
  stale_days: 0,
  status: 'missing',
  days: [
    ['2026-07-06', 0, 3, 3],
    ['2026-07-07', 0, 3, 3],
    ['2026-07-08', 0, 3, 3],
    ['2026-07-09', 2, 3, 1],
    ['2026-07-10', 0, 0, 0],
  ].map(([serviceDate, generated, expected, missing]) => ({
    service_date: String(serviceDate),
    generated_requirements: Number(generated),
    expected_requirements: Number(expected),
    missing_requirements: Number(missing),
    stale_requirements: 0,
    status: Number(missing) > 0 ? 'missing' : 'complete',
  })),
};

const completeCalendarWeek: MenuRequirementCalendarWeek = {
  ...calendarWeek,
  generated_days: 5,
  missing_days: 0,
  stale_days: 0,
  status: 'complete',
  days: calendarWeek.days.map((day) => ({
    ...day,
    expected_requirements: 3,
    generated_requirements: 3,
    missing_requirements: 0,
    stale_requirements: 0,
    status: 'complete',
  })),
};

const calendarMonth: MenuRequirementCalendarMonth = {
  month: 7,
  date_from: '2026-07-01',
  date_to: '2026-07-31',
  total_days: 31,
  working_days: 5,
  generated_days: 1,
  missing_days: 1,
  stale_days: 0,
  status: 'missing',
  weeks: [calendarWeek],
};

const completeCalendarMonth: MenuRequirementCalendarMonth = {
  ...calendarMonth,
  working_days: 5,
  generated_days: 5,
  missing_days: 0,
  stale_days: 0,
  status: 'complete',
  weeks: [completeCalendarWeek],
};

describe('getCurrentCalendarWeek', () => {
  it.each([
    ['2026-07-27', { dateFrom: '2026-07-27', dateTo: '2026-07-31' }],
    ['2026-08-02', { dateFrom: '2026-07-27', dateTo: '2026-07-31' }],
  ])('uses the same Monday-to-Friday range on %s', (date, expected) => {
    expect(getCurrentCalendarWeek(new Date(`${date}T12:00:00`))).toEqual(expected);
  });
});

describe('getCurrentSchoolRequirementPeriod', () => {
  it.each([
    ['2026-08-01', { year: 2026, monthNumber: 7 }],
    ['2027-01-01', { year: 2026, monthNumber: 12 }],
  ])('uses the month and year of the displayed work week on %s', (date, expected) => {
    const period = getCurrentSchoolRequirementPeriod(new Date(`${date}T12:00:00`));

    expect(period).toMatchObject(expected);
  });
});

describe('RequirementReportTable', () => {
  it('shows one group table at a time', () => {
    const secondGroup = {
      ...report.groups[0],
      school_group_id: 'group-2',
      school_group_name: '12-17',
      age_group: '14-18' as const,
    };

    render(
      <RequirementReportTable
        report={{ ...report, groups: [report.groups[0], secondGroup] }}
        rangeLabel="липень 2026"
        selectedCell={null}
        onSelectCell={() => undefined}
      />
    );

    expect(screen.getByRole('heading', { name: '6-11' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '12-17' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '12-17' }));

    expect(screen.getByRole('heading', { name: '12-17' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '6-11' })).not.toBeInTheDocument();
  });

  it('emits the selected aggregated cell', () => {
    const onSelectCell = vi.fn();

    render(
      <RequirementReportTable
        report={report}
        rangeLabel="липень 2026"
        selectedCell={null}
        onSelectCell={onSelectCell}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /1\s824/ }));

    expect(onSelectCell).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientName: 'Морква',
        cell: expect.objectContaining({ dish_key: 'dish:soup' }),
      })
    );
  });

  it('switches the calendar report to gross values without another request', () => {
    render(
      <RequirementReportTable
        report={report}
        rangeLabel="липень 2026"
        selectedCell={null}
        onSelectCell={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Брутто' }));

    expect(screen.getByRole('button', { name: /2\s250/ })).toHaveTextContent('брутто 75');
    expect(screen.queryByText('1 824')).not.toBeInTheDocument();
  });

  it('renders complete, missing, and stale rows when a cell is selected', () => {
    const selectedCell = {
      group: report.groups[0],
      dish: report.groups[0].dishes[0],
      ingredientName: 'Морква',
      cell: report.groups[0].ingredient_rows[0].cells[0],
    };

    render(
      <RequirementReportTable
        report={report}
        rangeLabel="липень 2026"
        selectedCell={selectedCell}
        onSelectCell={() => undefined}
      />
    );

    const breakdown = screen
      .getByRole('heading', {
        name: /Морква \/ Овочевий суп/,
      })
      .closest('section');
    expect(breakdown).not.toBeNull();
    expect(within(breakdown as HTMLElement).getByText('Готово')).toBeInTheDocument();
    expect(within(breakdown as HTMLElement).getByText('Пропущено')).toBeInTheDocument();
    expect(within(breakdown as HTMLElement).getByText('Застаріло')).toBeInTheDocument();

    const links = within(breakdown as HTMLElement).getAllByRole('link', {
      name: /Відкрити/,
    });
    expect(links[0]).toHaveAttribute('href', '/menu-requirements?requirement_id=requirement-1');
    expect(within(breakdown as HTMLElement).getByText('Немає')).toBeInTheDocument();
  });
});

describe('RequirementPeriodNavigator', () => {
  const defaultProps = {
    months: [calendarMonth],
    year: 2026,
    onSelectMonth: vi.fn(),
    onSelectWeek: vi.fn(),
    onBackToMonths: vi.fn(),
    onBackToWeeks: vi.fn(),
    onOpenReport: vi.fn(),
  };

  it('shows one calendar level at a time', () => {
    const { rerender } = render(
      <RequirementPeriodNavigator {...defaultProps} selectedMonth={null} selectedWeek={null} />
    );

    expect(screen.getByRole('heading', { name: 'Місяці · 2026' })).toBeInTheDocument();
    expect(screen.queryByText('Тиждень 2')).not.toBeInTheDocument();

    rerender(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={calendarMonth}
        selectedWeek={null}
      />
    );

    expect(screen.getByRole('heading', { name: /Тижні/ })).toBeInTheDocument();
    expect(screen.getByText('Тиждень 2')).toBeInTheDocument();
    expect(screen.queryByText('9 липня')).not.toBeInTheDocument();

    rerender(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={calendarMonth}
        selectedWeek={calendarWeek}
      />
    );

    expect(screen.getByRole('heading', { name: 'Робочі дні · тиждень 2' })).toBeInTheDocument();
    expect(screen.getByText('9 липня')).toBeInTheDocument();
    expect(screen.queryByText('Тиждень 2')).not.toBeInTheDocument();
  });

  it('offers norm compliance only for the selected concrete week', () => {
    const href = buildNormComplianceHref({
      schoolId: 'school-1',
      dateFrom: '2026-07-06',
      dateTo: '2026-07-10',
      mealType: 'lunch',
      schoolGroupId: 'group-1',
    });

    const { rerender } = render(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={calendarMonth}
        selectedWeek={null}
      />
    );
    expect(
      screen.queryByRole('link', { name: 'Сформувати дотримання норм' })
    ).not.toBeInTheDocument();

    rerender(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={calendarMonth}
        selectedWeek={calendarWeek}
        normComplianceHref={href}
      />
    );

    expect(
      screen.queryByRole('link', { name: 'Сформувати дотримання норм' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сформувати дотримання норм' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Меню-вимога за тиждень' })).toBeDisabled();
    expect(
      screen.getByText(/сформуйте або оновіть меню-вимоги за всі 5 робочих днів/)
    ).toBeInTheDocument();

    rerender(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={calendarMonth}
        selectedWeek={completeCalendarWeek}
        normComplianceHref={href}
      />
    );

    expect(screen.getByRole('link', { name: 'Сформувати дотримання норм' })).toHaveAttribute(
      'href',
      '/norm-compliance?school_id=school-1&date_from=2026-07-06&date_to=2026-07-10&source=menu-requirements-calendar&meal_type=lunch&school_group_id=group-1'
    );
    expect(screen.getByRole('button', { name: 'Меню-вимога за тиждень' })).toBeEnabled();
  });

  it('blocks an incomplete monthly report until every participating day is ready', () => {
    const onOpenReport = vi.fn();
    const { rerender } = render(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={calendarMonth}
        selectedWeek={null}
        onOpenReport={onOpenReport}
      />
    );

    expect(screen.getByRole('button', { name: 'Меню-вимога за місяць' })).toBeDisabled();
    expect(screen.getByText(/за всі дні, що беруть участь у цьому місяці/)).toBeInTheDocument();

    rerender(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={completeCalendarMonth}
        selectedWeek={null}
        onOpenReport={onOpenReport}
      />
    );

    const monthlyReportButton = screen.getByRole('button', {
      name: 'Меню-вимога за місяць',
    });
    expect(monthlyReportButton).toBeEnabled();
    fireEvent.click(monthlyReportButton);
    expect(onOpenReport).toHaveBeenCalledWith(expect.objectContaining({ granularity: 'month' }));
  });

  it('allows the owner to open incomplete reports and norm compliance', () => {
    const onOpenReport = vi.fn();
    const href = buildNormComplianceHref({
      schoolId: 'school-1',
      dateFrom: calendarWeek.date_from,
      dateTo: calendarWeek.date_to,
    });
    const { rerender } = render(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={calendarMonth}
        selectedWeek={calendarWeek}
        onOpenReport={onOpenReport}
        allowIncompleteReports
        normComplianceHref={href}
      />
    );

    expect(screen.getByRole('link', { name: 'Сформувати дотримання норм' })).toHaveAttribute(
      'href',
      href
    );
    const weeklyReportButton = screen.getByRole('button', {
      name: 'Меню-вимога за тиждень',
    });
    expect(weeklyReportButton).toBeEnabled();
    fireEvent.click(weeklyReportButton);
    expect(onOpenReport).toHaveBeenCalledWith(expect.objectContaining({ granularity: 'week' }));

    rerender(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={calendarMonth}
        selectedWeek={null}
        onOpenReport={onOpenReport}
        allowIncompleteReports
      />
    );
    expect(screen.getByRole('button', { name: 'Меню-вимога за місяць' })).toBeEnabled();
  });

  it('opens a daily report for the chosen day', () => {
    const onOpenReport = vi.fn();

    render(
      <RequirementPeriodNavigator
        {...defaultProps}
        selectedMonth={calendarMonth}
        selectedWeek={calendarWeek}
        onOpenReport={onOpenReport}
      />
    );

    const dayCard = screen.getByText('9 липня').closest('article');
    expect(dayCard).not.toBeNull();
    expect(within(dayCard as HTMLElement).getByText('2')).toBeInTheDocument();
    fireEvent.click(
      within(dayCard as HTMLElement).getByRole('button', {
        name: 'Відкрити меню-вимоги',
      })
    );

    expect(onOpenReport).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: '2026-07-09',
        dateTo: '2026-07-09',
        granularity: 'day',
      })
    );
  });
});

describe('RequirementReportDialog', () => {
  it('keeps the report table inside a closable modal', () => {
    const onClose = vi.fn();

    render(
      <RequirementReportDialog
        range={{
          dateFrom: '2026-07-01',
          dateTo: '2026-07-31',
          granularity: 'month',
          label: 'липень 2026 р.',
        }}
        report={report}
        isPending={false}
        isError={false}
        error={null}
        selectedCell={null}
        onSelectCell={() => undefined}
        onRetry={() => undefined}
        onClose={onClose}
      />
    );

    const dialog = screen.getByRole('dialog', {
      name: 'липень 2026 р.',
    });
    expect(within(dialog).getByRole('table')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Експорт в Excel' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('exports calendar reports without the active group filter', async () => {
    vi.mocked(exportMenuRequirementWorkbook).mockResolvedValue({
      blob: new Blob(['xlsx']),
      filename: 'menu-requirement.xlsx',
    });

    render(
      <RequirementReportDialog
        range={{
          dateFrom: '2026-07-01',
          dateTo: '2026-07-31',
          granularity: 'month',
          label: 'липень 2026 р.',
        }}
        report={{ ...report, school_group_id: 'group-1' }}
        isPending={false}
        isError={false}
        error={null}
        selectedCell={null}
        onSelectCell={() => undefined}
        onRetry={() => undefined}
        onClose={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Брутто' }));
    fireEvent.click(screen.getByRole('button', { name: 'Експорт в Excel' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Оберіть тип ваги для експорту' })).getByRole(
        'button',
        { name: 'Брутто' }
      )
    );

    await waitFor(() =>
      expect(exportMenuRequirementWorkbook).toHaveBeenCalledWith({
        kind: 'report',
        request: {
          school_id: 'school-1',
          date_from: '2026-07-01',
          date_to: '2026-07-31',
          granularity: 'month',
          meal_type: 'lunch',
        },
        amountBasis: 'gross',
      })
    );
    expect(triggerMenuRequirementDownload).toHaveBeenCalled();
  });
});
