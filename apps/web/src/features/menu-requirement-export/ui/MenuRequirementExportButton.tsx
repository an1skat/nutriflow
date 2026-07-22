'use client';

import { useState } from 'react';

import { FileSpreadsheet, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { getApiErrorMessage } from '@/shared/api/HttpClient';

import {
  type MenuRequirementExportTarget,
  exportMenuRequirementWorkbook,
  triggerMenuRequirementDownload,
} from '../api/MenuRequirementExportApi';

export function MenuRequirementExportButton({
  target,
  label = 'Експорт в Excel',
  disabled = false,
}: {
  target: MenuRequirementExportTarget;
  label?: string;
  disabled?: boolean;
}) {
  const [isPending, setIsPending] = useState(false);

  const handleExport = async () => {
    setIsPending(true);
    try {
      const workbook = await exportMenuRequirementWorkbook(target);
      triggerMenuRequirementDownload(workbook);
      toast.success('Меню-вимогу експортовано.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Не вдалося експортувати меню-вимогу.'));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <button
      type="button"
      className="nf-button nf-button-secondary min-h-8 px-2 text-xs"
      disabled={disabled || isPending}
      onClick={() => void handleExport()}
    >
      {isPending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        <FileSpreadsheet className="size-4" aria-hidden />
      )}
      {isPending ? 'Експортуємо…' : label}
    </button>
  );
}
