import { beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadFile } from '@/shared/api/Download';

import { exportMenuRequirementWorkbook } from './MenuRequirementExportApi';

vi.mock('@/shared/api/Download', () => ({
  downloadFile: vi.fn(),
  triggerFileDownload: vi.fn(),
}));

describe('exportMenuRequirementWorkbook', () => {
  beforeEach(() => {
    vi.mocked(downloadFile).mockReset();
    vi.mocked(downloadFile).mockResolvedValue({
      blob: new Blob(['xlsx']),
      filename: 'menu-requirement.xlsx',
    });
  });

  it('exports a community report through the community endpoint', async () => {
    await exportMenuRequirementWorkbook({
      kind: 'report',
      request: {
        community: 'obukhivska',
        date_from: '2026-07-01',
        date_to: '2026-07-31',
        granularity: 'month',
        meal_type: 'lunch',
      },
      amountBasis: 'gross',
    });

    expect(downloadFile).toHaveBeenCalledWith(
      '/menu-requirements/communities/obukhivska/report/export.xlsx',
      'menu-requirement.xlsx',
      {
        params: {
          date_from: '2026-07-01',
          date_to: '2026-07-31',
          granularity: 'month',
          meal_type: 'lunch',
          amount_basis: 'gross',
        },
      }
    );
  });

  it('keeps school filters on the existing export endpoint', async () => {
    await exportMenuRequirementWorkbook({
      kind: 'report',
      request: {
        school_id: 'school-1',
        school_group_id: 'group-1',
        date_from: '2026-07-06',
        date_to: '2026-07-10',
        granularity: 'week',
      },
    });

    expect(downloadFile).toHaveBeenCalledWith(
      '/menu-requirements/report/export.xlsx',
      'menu-requirement.xlsx',
      {
        params: {
          school_id: 'school-1',
          school_group_id: 'group-1',
          date_from: '2026-07-06',
          date_to: '2026-07-10',
          granularity: 'week',
          meal_type: undefined,
          amount_basis: 'net',
        },
      }
    );
  });
});
