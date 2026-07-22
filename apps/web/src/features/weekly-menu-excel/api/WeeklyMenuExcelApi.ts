import axios, { type AxiosError } from 'axios';

import type { MealType } from '@/entities/weekly-menu/model/WeeklyMenu';
import { type DownloadedFile, downloadFile, triggerFileDownload } from '@/shared/api/Download';
import { apiClient, getCsrfHeaders } from '@/shared/api/HttpClient';

import {
  type WeeklyMenuImportCommit,
  type WeeklyMenuImportPreview,
  weeklyMenuImportCommitSchema,
  weeklyMenuImportPreviewSchema,
} from '../model/WeeklyMenuExcel';

export type DownloadedWorkbook = DownloadedFile;

export async function previewWeeklyMenuWorkbook(input: {
  file: File;
  mealType: MealType;
}): Promise<WeeklyMenuImportPreview> {
  const formData = new FormData();
  formData.append('file', input.file);

  const response = await apiClient.post<unknown>('/menus/weekly/import-preview', formData, {
    params: { meal_type: input.mealType },
    headers: getCsrfHeaders(),
  });

  return weeklyMenuImportPreviewSchema.parse(response.data);
}

export async function commitWeeklyMenuWorkbook(input: {
  previewId: string;
  schoolId?: string | null;
}): Promise<WeeklyMenuImportCommit> {
  const response = await apiClient.post<unknown>(
    '/menus/weekly/import-commit',
    {
      preview_id: input.previewId,
      school_id: input.schoolId ?? null,
    },
    { headers: getCsrfHeaders() }
  );

  return weeklyMenuImportCommitSchema.parse(response.data);
}

async function downloadWorkbook(
  url: string,
  fallbackFilename: string
): Promise<DownloadedWorkbook> {
  return downloadFile(url, fallbackFilename);
}

export function downloadWeeklyMenuTemplate(): Promise<DownloadedWorkbook> {
  return downloadWorkbook('/menus/weekly/template.xlsx', 'weekly-menu-template.xlsx');
}

export function exportWeeklyMenuWorkbook(menuId: string): Promise<DownloadedWorkbook> {
  return downloadWorkbook(`/menus/weekly/${menuId}/export.xlsx`, 'weekly-menu.xlsx');
}

export function triggerWorkbookDownload(workbook: DownloadedWorkbook): void {
  triggerFileDownload(workbook);
}

export function isBlobAxiosError(error: unknown): error is AxiosError<Blob> {
  return axios.isAxiosError(error) && error.response?.data instanceof Blob;
}
