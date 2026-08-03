import type {
  MenuRequirementReportCell,
  MenuRequirementReportDish,
  MenuRequirementReportGroup,
} from '@/entities/menu-requirement/model/MenuRequirement';

export type SelectedRange = {
  dateFrom: string;
  dateTo: string;
  granularity: 'day' | 'week' | 'month' | 'range';
  label: string;
};

export type SelectedWeekRange = Pick<SelectedRange, 'dateFrom' | 'dateTo'>;

export type SelectedReportCell = {
  group: MenuRequirementReportGroup;
  dish: MenuRequirementReportDish;
  ingredientName: string;
  cell: MenuRequirementReportCell;
};
