import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/shared/api/HttpClient';

import {
  fetchMenuRequirementCalendar,
  fetchMenuRequirementCommunities,
  fetchMenuRequirementReport,
} from './MenuRequirementApi';

vi.mock('@/shared/api/HttpClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
  getCsrfHeaders: vi.fn(),
}));

const months = Array.from({ length: 12 }, (_item, index) => ({
  month: index + 1,
  date_from: `2026-${String(index + 1).padStart(2, '0')}-01`,
  date_to: `2026-${String(index + 1).padStart(2, '0')}-28`,
  total_days: 28,
  working_days: 0,
  generated_days: 0,
  missing_days: 0,
  stale_days: 0,
  status: 'complete',
  weeks: [],
}));

describe('menu requirement scope API', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it('loads the communities available to the current user', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        {
          community: 'obukhivska',
          community_name: 'Обухівська громада',
          school_count: 2,
        },
      ],
    });

    await expect(fetchMenuRequirementCommunities()).resolves.toHaveLength(1);
    expect(apiClient.get).toHaveBeenCalledWith('/menu-requirements/communities');
  });

  it('uses community endpoints without leaking school-only filters', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        data: {
          community: 'obukhivska',
          community_name: 'Обухівська громада',
          school_count: 2,
          year: 2026,
          months,
        },
      })
      .mockResolvedValueOnce({
        data: {
          community: 'obukhivska',
          community_name: 'Обухівська громада',
          school_count: 2,
          date_from: '2026-07-01',
          date_to: '2026-07-31',
          granularity: 'month',
          meal_type: 'lunch',
          status: 'complete',
          missing_dates: [],
          stale_dates: [],
          groups: [],
        },
      });

    await fetchMenuRequirementCalendar({
      community: 'obukhivska',
      year: 2026,
      meal_type: 'lunch',
    });
    await fetchMenuRequirementReport({
      community: 'obukhivska',
      date_from: '2026-07-01',
      date_to: '2026-07-31',
      granularity: 'month',
      meal_type: 'lunch',
    });

    expect(apiClient.get).toHaveBeenNthCalledWith(
      1,
      '/menu-requirements/communities/obukhivska/calendar',
      { params: { year: 2026, meal_type: 'lunch' } }
    );
    expect(apiClient.get).toHaveBeenNthCalledWith(
      2,
      '/menu-requirements/communities/obukhivska/report',
      {
        params: {
          date_from: '2026-07-01',
          date_to: '2026-07-31',
          granularity: 'month',
          meal_type: 'lunch',
        },
      }
    );
  });

  it('keeps the existing school calendar request contract', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        school_id: 'school-1',
        school_name: 'Ліцей №1',
        year: 2026,
        months,
      },
    });

    await fetchMenuRequirementCalendar({
      school_id: 'school-1',
      school_group_id: 'group-1',
      year: 2026,
      meal_type: 'breakfast',
    });

    expect(apiClient.get).toHaveBeenCalledWith('/menu-requirements/calendar', {
      params: {
        school_id: 'school-1',
        school_group_id: 'group-1',
        year: 2026,
        meal_type: 'breakfast',
      },
    });
  });
});
