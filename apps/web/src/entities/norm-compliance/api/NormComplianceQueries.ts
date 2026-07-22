'use client';

import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';

import type { NormComplianceReportRequest } from '../model/NormCompliance';
import { fetchNormComplianceReport } from './NormComplianceApi';

export const normComplianceQueryKeys = {
  all: ['protected', 'norm-compliance'] as const,
  reports: () => [...normComplianceQueryKeys.all, 'report'] as const,
  report: (request: NormComplianceReportRequest) =>
    [...normComplianceQueryKeys.reports(), request] as const,
};

export function normComplianceReportQueryOptions(request: NormComplianceReportRequest) {
  return queryOptions({
    queryKey: normComplianceQueryKeys.report(request),
    queryFn: () => fetchNormComplianceReport(request),
    enabled:
      (request.enabled ?? true) &&
      request.school_id.length > 0 &&
      request.date_from.length > 0 &&
      request.date_to.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useNormComplianceReport(request: NormComplianceReportRequest) {
  return useQuery(normComplianceReportQueryOptions(request));
}
