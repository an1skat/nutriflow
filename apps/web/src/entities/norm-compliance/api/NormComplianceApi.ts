import { apiClient } from "@/shared/api/HttpClient";
import { downloadFile, triggerFileDownload } from "@/shared/api/Download";

import {
  normComplianceReportSchema,
  type NormComplianceReport,
  type NormComplianceReportRequest,
} from "../model/NormCompliance";

export function buildNormComplianceParams(request: NormComplianceReportRequest) {
  return {
    school_id: request.school_id,
    date_from: request.date_from,
    date_to: request.date_to,
    meal_type: request.meal_type || undefined,
    school_group_id: request.school_group_id || undefined,
  };
}

export async function fetchNormComplianceReport(
  request: NormComplianceReportRequest,
): Promise<NormComplianceReport> {
  const response = await apiClient.get<unknown>("/norm-compliance/report", {
    params: buildNormComplianceParams(request),
  });
  return normComplianceReportSchema.parse(response.data);
}

export async function downloadNormComplianceReport(
  request: Omit<NormComplianceReportRequest, "enabled">,
): Promise<void> {
  const file = await downloadFile(
    "/norm-compliance/report/export.xlsx",
    "norm-compliance.xlsx",
    { params: buildNormComplianceParams(request) },
  );
  triggerFileDownload(file);
}
