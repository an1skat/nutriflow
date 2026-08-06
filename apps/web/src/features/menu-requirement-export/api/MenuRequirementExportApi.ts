import type {
  MenuRequirementAmountBasis,
  MenuRequirementReportRequest,
} from '@/entities/menu-requirement/model/MenuRequirement';
import { type DownloadedFile, downloadFile, triggerFileDownload } from '@/shared/api/Download';

type WithoutEnabled<T> = T extends unknown ? Omit<T, 'enabled'> : never;

export type MenuRequirementExportTarget =
  | {
      kind: 'requirement';
      requirementId: string;
      amountBasis?: MenuRequirementAmountBasis;
    }
  | {
      kind: 'report';
      request: WithoutEnabled<MenuRequirementReportRequest>;
      amountBasis?: MenuRequirementAmountBasis;
    };

type DownloadedWorkbook = DownloadedFile;

export async function exportMenuRequirementWorkbook(
  target: MenuRequirementExportTarget
): Promise<DownloadedWorkbook> {
  const fallbackFilename = 'menu-requirement.xlsx';

  if (target.kind === 'requirement') {
    return downloadFile(
      `/menu-requirements/${target.requirementId}/export.xlsx`,
      fallbackFilename,
      { params: { amount_basis: target.amountBasis ?? 'net' } }
    );
  }

  const { request } = target;
  const isCommunity = 'community' in request;
  const url = isCommunity
    ? `/menu-requirements/communities/${encodeURIComponent(request.community)}/report/export.xlsx`
    : '/menu-requirements/report/export.xlsx';

  return downloadFile(url, fallbackFilename, {
    params: {
      ...(!isCommunity
        ? {
            school_id: request.school_id,
            school_group_id: request.school_group_id,
          }
        : {}),
      date_from: request.date_from,
      date_to: request.date_to,
      granularity: request.granularity,
      meal_type: request.meal_type,
      amount_basis: target.amountBasis ?? 'net',
    },
  });
}

export function triggerMenuRequirementDownload(workbook: DownloadedWorkbook): void {
  triggerFileDownload(workbook);
}
