'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { menuRequirementQueryKeys } from '@/entities/menu-requirement/api/MenuRequirementQueries';
import { reopenWeeklyMenuDay } from '@/entities/weekly-menu/api/WeeklyMenuApi';
import { weeklyMenuQueryKeys } from '@/entities/weekly-menu/api/WeeklyMenuQueries';
import type { Weekday } from '@/entities/weekly-menu/model/WeeklyMenu';

type ReopenDayVariables = {
  menuId: string;
  weekday: Weekday;
};

export function useReopenWeeklyMenuDay(schoolId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ menuId, weekday }: ReopenDayVariables) => reopenWeeklyMenuDay(menuId, weekday),

    onSuccess: async (menu) => {
      queryClient.setQueryData(weeklyMenuQueryKeys.detail(menu.id), menu);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: weeklyMenuQueryKeys.currentWeekClosedDays(schoolId),
        }),
        queryClient.invalidateQueries({
          queryKey: weeklyMenuQueryKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: menuRequirementQueryKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: menuRequirementQueryKeys.calendars(),
        }),
        queryClient.invalidateQueries({
          queryKey: menuRequirementQueryKeys.reports(),
        }),
      ]);
    },
  });
}
