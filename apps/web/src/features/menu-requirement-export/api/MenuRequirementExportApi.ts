import type {
  MenuRequirementAmountBasis,
  MenuRequirementReportRequest,
} from '@/entities/menu-requirement/model/MenuRequirement';
import { type DownloadedFile, downloadFile, triggerFileDownload } from '@/shared/api/Download';

export type MenuRequirementExportTarget =
  | {
      kind: 'requirement';
      requirementId: string;
      amountBasis?: MenuRequirementAmountBasis;
    }
  | {
      kind: 'report';
      request: Omit<MenuRequirementReportRequest, 'enabled'>;
      amountBasis?: MenuRequirementAmountBasis;
    };

type DownloadedWorkbook = DownloadedFile;

export async function exportMenuRequirementWorkbook(
  target: MenuRequirementExportTarget
): Promise<DownloadedWorkbook> {
  const url =
    target.kind === 'requirement'
      ? `/menu-requirements/${target.requirementId}/export.xlsx`
      : '/menu-requirements/report/export.xlsx';
  const fallbackFilename = 'menu-requirement.xlsx';

  return downloadFile(url, fallbackFilename, {
    params: {
      ...(target.kind === 'report' ? target.request : {}),
      amount_basis: target.amountBasis ?? 'net',
    },
  });
}

export function triggerMenuRequirementDownload(workbook: DownloadedWorkbook): void {
  triggerFileDownload(workbook);
}
