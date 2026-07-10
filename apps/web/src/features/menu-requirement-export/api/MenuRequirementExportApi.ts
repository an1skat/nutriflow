import axios from "axios";

import type { MenuRequirementReportRequest } from "@/entities/menu-requirement/model/MenuRequirement";
import { apiClient } from "@/shared/api/HttpClient";

export type MenuRequirementExportTarget =
  | {
      kind: "requirement";
      requirementId: string;
    }
  | {
      kind: "report";
      request: Omit<MenuRequirementReportRequest, "enabled">;
    };

type DownloadedWorkbook = {
  blob: Blob;
  filename: string;
};

export async function exportMenuRequirementWorkbook(
  target: MenuRequirementExportTarget,
): Promise<DownloadedWorkbook> {
  const url =
    target.kind === "requirement"
      ? `/menu-requirements/${target.requirementId}/export.xlsx`
      : "/menu-requirements/report/export.xlsx";
  const fallbackFilename = "menu-requirement.xlsx";

  try {
    const response = await apiClient.get<Blob>(url, {
      params: target.kind === "report" ? target.request : undefined,
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
}

export function triggerMenuRequirementDownload(
  workbook: DownloadedWorkbook,
): void {
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

function extractDownloadFilename(
  contentDisposition: string | undefined,
  fallback: string,
): string {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1]?.trim() || fallback;
}
