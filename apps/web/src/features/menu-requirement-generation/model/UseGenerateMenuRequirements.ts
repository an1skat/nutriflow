'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { generateMenuRequirements } from '@/entities/menu-requirement/api/MenuRequirementApi';
import { menuRequirementQueryKeys } from '@/entities/menu-requirement/api/MenuRequirementQueries';
import type { GenerateMenuRequirementsPayload } from '@/entities/menu-requirement/model/MenuRequirement';
import { normComplianceQueryKeys } from '@/entities/norm-compliance/api/NormComplianceQueries';
import { dailyMenuQueryKeys } from '@/entities/weekly-menu/api/DailyMenuQueries';
import { weeklyMenuQueryKeys } from '@/entities/weekly-menu/api/WeeklyMenuQueries';

export function useGenerateMenuRequirements() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: GenerateMenuRequirementsPayload) => generateMenuRequirements(payload),
    onSuccess: async (response) => {
      for (const requirement of response.items) {
        queryClient.setQueryData(menuRequirementQueryKeys.detail(requirement.id), requirement);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: weeklyMenuQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: dailyMenuQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: normComplianceQueryKeys.all }),
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
