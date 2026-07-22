'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { weeklyMenuQueryKeys } from '@/entities/weekly-menu/api/WeeklyMenuQueries';

import {
  commitWeeklyMenuWorkbook,
  downloadWeeklyMenuTemplate,
  exportWeeklyMenuWorkbook,
  previewWeeklyMenuWorkbook,
} from '../api/WeeklyMenuExcelApi';

export function useWeeklyMenuImportPreview() {
  return useMutation({ mutationFn: previewWeeklyMenuWorkbook });
}

export function useWeeklyMenuImportCommit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: commitWeeklyMenuWorkbook,
    onSuccess: async (result) => {
      for (const menu of result.menus) {
        queryClient.setQueryData(weeklyMenuQueryKeys.detail(menu.id), menu);
      }

      await queryClient.invalidateQueries({
        queryKey: weeklyMenuQueryKeys.lists(),
      });
    },
  });
}

export function useWeeklyMenuTemplateDownload() {
  return useMutation({ mutationFn: downloadWeeklyMenuTemplate });
}

export function useWeeklyMenuExport() {
  return useMutation({ mutationFn: exportWeeklyMenuWorkbook });
}
