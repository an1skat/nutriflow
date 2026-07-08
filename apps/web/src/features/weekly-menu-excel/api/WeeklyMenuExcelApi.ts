import axios, { type AxiosError } from "axios";

import type { MealType } from "@/entities/weekly-menu/model/WeeklyMenu";
import { apiClient, getCsrfHeaders } from "@/shared/api/HttpClient";

import {
  extractDownloadFilename,
  weeklyMenuImportCommitSchema,
  weeklyMenuImportPreviewSchema,
  type WeeklyMenuImportCommit,
  type WeeklyMenuImportPreview,
} from "../model/WeeklyMenuExcel";

export type DownloadedWorkbook = {
  blob: Blob;
  filename: string;
};

async function normalizeBlobApiError(error: unknown): Promise<never> {
  if (
    axios.isAxiosError(error) &&
    error.response?.data instanceof Blob &&
    error.response.data.size > 0
  ) {
    const text = await error.response.data.text();

    try {
      error.response.data = JSON.parse(text) as unknown;
    } catch {
      error.response.data = { detail: text };
    }
  }

  throw error;
}

export async function previewWeeklyMenuWorkbook(input: {
  file: File;
  mealType: MealType;
}): Promise<WeeklyMenuImportPreview> {
  const formData = new FormData();
  formData.append("file", input.file);

  const response = await apiClient.post<unknown>(
    "/menus/weekly/import-preview",
    formData,
    {
      params: { meal_type: input.mealType },
      headers: getCsrfHeaders(),
    },
  );

  return weeklyMenuImportPreviewSchema.parse(response.data);
}

export async function commitWeeklyMenuWorkbook(input: {
  previewId: string;
  schoolId?: string | null;
}): Promise<WeeklyMenuImportCommit> {
  const response = await apiClient.post<unknown>(
    "/menus/weekly/import-commit",
    {
      preview_id: input.previewId,
      school_id: input.schoolId ?? null,
    },
    { headers: getCsrfHeaders() },
  );

  return weeklyMenuImportCommitSchema.parse(response.data);
}

async function downloadWorkbook(
  url: string,
  fallbackFilename: string,
): Promise<DownloadedWorkbook> {
  try {
    const response = await apiClient.get<Blob>(url, {
      responseType: "blob",
    });

    return {
      blob: response.data,
      filename: extractDownloadFilename(
        response.headers["content-disposition"],
        fallbackFilename,
      ),
    };
  } catch (error) {
    return normalizeBlobApiError(error);
  }
}

export function downloadWeeklyMenuTemplate(): Promise<DownloadedWorkbook> {
  return downloadWorkbook(
    "/menus/weekly/template.xlsx",
    "weekly-menu-template.xlsx",
  );
}

export function exportWeeklyMenuWorkbook(
  menuId: string,
): Promise<DownloadedWorkbook> {
  return downloadWorkbook(
    `/menus/weekly/${menuId}/export.xlsx`,
    "weekly-menu.xlsx",
  );
}

export function triggerWorkbookDownload(workbook: DownloadedWorkbook): void {
  const url = URL.createObjectURL(workbook.blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = workbook.filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function isBlobAxiosError(error: unknown): error is AxiosError<Blob> {
  return axios.isAxiosError(error) && error.response?.data instanceof Blob;
}
