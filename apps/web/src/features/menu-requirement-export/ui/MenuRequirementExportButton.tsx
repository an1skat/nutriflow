'use client';

import { useEffect, useState } from 'react';

import { FileSpreadsheet, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import type { MenuRequirementAmountBasis } from '@/entities/menu-requirement/model/MenuRequirement';
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
  const [isChoosingAmountBasis, setIsChoosingAmountBasis] = useState(false);

  useEffect(() => {
    if (!isChoosingAmountBasis) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsChoosingAmountBasis(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChoosingAmountBasis]);

  const handleExport = async (amountBasis: MenuRequirementAmountBasis) => {
    setIsPending(true);
    try {
      const workbook = await exportMenuRequirementWorkbook({ ...target, amountBasis });
      triggerMenuRequirementDownload(workbook);
      toast.success('Меню-вимогу експортовано.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Не вдалося експортувати меню-вимогу.'));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="nf-button nf-button-secondary min-h-8 px-2 text-xs"
        disabled={disabled || isPending}
        onClick={() => setIsChoosingAmountBasis(true)}
      >
        {isPending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <FileSpreadsheet className="size-4" aria-hidden />
        )}
        {isPending ? 'Експортуємо…' : label}
      </button>
      {isChoosingAmountBasis ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsChoosingAmountBasis(false);
            }
          }}
        >
          <section
            aria-labelledby="menu-requirement-export-dialog-title"
            aria-modal="true"
            className="w-full max-w-sm border border-slate-300 bg-white p-5 shadow-2xl"
            role="dialog"
          >
            <h2
              id="menu-requirement-export-dialog-title"
              className="text-lg font-bold text-slate-950"
            >
              Оберіть тип ваги для експорту
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              У якому вигляді сформувати меню-вимогу?
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="nf-button nf-button-ghost transition-all hover:-translate-y-px hover:shadow-sm"
                onClick={() => setIsChoosingAmountBasis(false)}
              >
                Скасувати
              </button>
              {(['net', 'gross'] as const).map((amountBasis) => (
                <button
                  key={amountBasis}
                  type="button"
                  className="nf-button nf-button-primary min-w-22 transition-all hover:-translate-y-px hover:shadow-md"
                  onClick={() => {
                    setIsChoosingAmountBasis(false);
                    void handleExport(amountBasis);
                  }}
                >
                  {amountBasis === 'gross' ? 'Брутто' : 'Нетто'}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
