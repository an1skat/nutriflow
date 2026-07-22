import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  exportMenuRequirementWorkbook,
  triggerMenuRequirementDownload,
} from '../api/MenuRequirementExportApi';
import { MenuRequirementExportButton } from './MenuRequirementExportButton';

vi.mock('../api/MenuRequirementExportApi', () => ({
  exportMenuRequirementWorkbook: vi.fn(),
  triggerMenuRequirementDownload: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('MenuRequirementExportButton', () => {
  it('downloads the calendar report with its active filters', async () => {
    const workbook = {
      blob: new Blob(['xlsx']),
      filename: 'menu-requirement.xlsx',
    };
    vi.mocked(exportMenuRequirementWorkbook).mockResolvedValue(workbook);

    render(
      <MenuRequirementExportButton
        target={{
          kind: 'report',
          request: {
            school_id: 'school-1',
            date_from: '2026-07-01',
            date_to: '2026-07-31',
            granularity: 'month',
            meal_type: 'lunch',
            school_group_id: 'group-1',
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Експорт в Excel' }));

    await waitFor(() =>
      expect(exportMenuRequirementWorkbook).toHaveBeenCalledWith({
        kind: 'report',
        request: {
          school_id: 'school-1',
          date_from: '2026-07-01',
          date_to: '2026-07-31',
          granularity: 'month',
          meal_type: 'lunch',
          school_group_id: 'group-1',
        },
      })
    );
    expect(triggerMenuRequirementDownload).toHaveBeenCalledWith(workbook);
  });
});
