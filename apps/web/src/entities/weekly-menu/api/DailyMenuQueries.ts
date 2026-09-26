'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { menuRequirementQueryKeys } from '@/entities/menu-requirement/api/MenuRequirementQueries';
import { normComplianceQueryKeys } from '@/entities/norm-compliance/api/NormComplianceQueries';
import type { SchoolGroup } from '@/entities/school-group/model/SchoolGroup';
import { apiClient, getCsrfHeaders } from '@/shared/api/HttpClient';

import type { MealType, Weekday } from '../model/WeeklyMenu';
import { weeklyMenuQueryKeys } from './WeeklyMenuQueries';

export type MonthDailyMenu = {
  menu_id: string;
  menu_title: string;
  meal_type: MealType;
  weekday: Weekday;
  date: string;
  closed_at: string | null;
  reopened_at: string | null;
  revision: number;
  requirement_stale: boolean;
};
export type DailyMenuMonth = {
  school_id: string;
  year: number;
  month: number;
  today: string;
  groups: SchoolGroup[];
  items: MonthDailyMenu[];
};
export const dailyMenuQueryKeys = { all: ['protected', 'daily-menu-management'] as const };

export function useDailyMenuSchools() {
  return useQuery({
    queryKey: [...dailyMenuQueryKeys.all, 'schools'],
    queryFn: async () =>
      (await apiClient.get<{ id: string; name: string }[]>('/menus/daily/schools')).data,
  });
}
export function useDailyMenuMonth(schoolId: string, month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return useQuery({
    queryKey: [...dailyMenuQueryKeys.all, schoolId, month],
    queryFn: async () =>
      (
        await apiClient.get<DailyMenuMonth>('/menus/daily/month', {
          params: { school_id: schoolId, year, month: monthNumber },
        })
      ).data,
    enabled: Boolean(schoolId && year && monthNumber),
  });
}
export function useRegenerateDailyRequirements() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      schoolId,
      menuId,
      weekday,
      revision,
    }: {
      schoolId: string;
      menuId: string;
      weekday: Weekday;
      revision: number;
    }) =>
      apiClient.post(
        `/menus/daily/${schoolId}/${menuId}/${weekday}/regenerate`,
        { revision },
        { headers: getCsrfHeaders() }
      ),
    onSuccess: async () => {
      await Promise.all(
        [
          dailyMenuQueryKeys.all,
          weeklyMenuQueryKeys.all,
          menuRequirementQueryKeys.all,
          normComplianceQueryKeys.all,
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      );
    },
  });
}
