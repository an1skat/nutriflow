import type { MenuRequirementReportRequest } from "@/entities/menu-requirement/model/MenuRequirement";
import {
  downloadFile,
  triggerFileDownload,
  type DownloadedFile,
} from "@/shared/api/Download";

export type MenuRequirementExportTarget =
  | {
      kind: "requirement";
      requirementId: string;
    }
  | {
      kind: "report";
      request: Omit<MenuRequirementReportRequest, "enabled">;
    };

type DownloadedWorkbook = DownloadedFile;

export async function exportMenuRequirementWorkbook(
  target: MenuRequirementExportTarget,
): Promise<DownloadedWorkbook> {
  const url =
    target.kind === "requirement"
      ? `/menu-requirements/${target.requirementId}/export.xlsx`
      : "/menu-requirements/report/export.xlsx";
  const fallbackFilename = "menu-requirement.xlsx";

  return downloadFile(url, fallbackFilename, {
    params: target.kind === "report" ? target.request : undefined,
  });
}

export function triggerMenuRequirementDownload(
  workbook: DownloadedWorkbook,
): void {
  triggerFileDownload(workbook);
}
