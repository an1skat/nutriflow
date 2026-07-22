'use client';

import { type DragEvent, type KeyboardEvent, useMemo, useRef, useState } from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  LoaderCircle,
  UploadCloud,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import type { MealType, WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';
import { getApiErrorMessage } from '@/shared/api/HttpClient';

import { triggerWorkbookDownload } from '../api/WeeklyMenuExcelApi';
import {
  useWeeklyMenuExport,
  useWeeklyMenuImportCommit,
  useWeeklyMenuImportPreview,
  useWeeklyMenuTemplateDownload,
} from '../model/UseWeeklyMenuExcel';
import {
  WEEKLY_MENU_XLSX_MAX_BYTES,
  type WeeklyMenuImportPreview,
  formatFileSize,
  getImportPreviewSummary,
  isXlsxFile,
} from '../model/WeeklyMenuExcel';
import { WeeklyMenuImportPreviewDialog } from './WeeklyMenuImportPreviewDialog';

function validateFile(file: File): string | null {
  if (!isXlsxFile(file)) {
    return 'Оберіть файл у форматі .xlsx.';
  }

  if (file.size > WEEKLY_MENU_XLSX_MAX_BYTES) {
    return `Файл завеликий. Максимальний розмір — ${formatFileSize(WEEKLY_MENU_XLSX_MAX_BYTES)}.`;
  }

  return null;
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

export function WeeklyMenuExcelTools({
  selectedMenuId,
  onImported,
}: {
  selectedMenuId: string | null;
  onImported: (menus: WeeklyMenu[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [preview, setPreview] = useState<WeeklyMenuImportPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState(0);

  const previewMutation = useWeeklyMenuImportPreview();
  const commitMutation = useWeeklyMenuImportCommit();
  const templateDownload = useWeeklyMenuTemplateDownload();
  const menuExport = useWeeklyMenuExport();

  const previewSummary = useMemo(
    () => (preview ? getImportPreviewSummary(preview) : null),
    [preview]
  );
  const diagnostics = preview?.diagnostics ?? [];
  const errors = diagnostics.filter((diagnostic) => diagnostic.level === 'error');
  const warnings = diagnostics.filter((diagnostic) => diagnostic.level === 'warning');
  const safeActiveSheet = activeSheet < (preview?.menus.length ?? 0) ? activeSheet : 0;
  const previewExpired = preview ? isExpired(preview.expires_at) : false;

  const selectFile = (nextFile: File | undefined) => {
    if (!nextFile) {
      return;
    }

    const validationError = validateFile(nextFile);
    if (validationError) {
      setFile(null);
      setPreview(null);
      setPreviewOpen(false);
      setFileError(validationError);
      return;
    }

    setFile(nextFile);
    setPreview(null);
    setPreviewOpen(false);
    setActiveSheet(0);
    setFileError(null);
    previewMutation.reset();
    commitMutation.reset();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files[0]);
  };

  const handleDropzoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handlePreview = async () => {
    if (!file) {
      setFileError('Спочатку оберіть Excel-файл.');
      return;
    }

    try {
      const result = await previewMutation.mutateAsync({ file, mealType });
      setPreview(result);
      setActiveSheet(0);
      setPreviewOpen(true);

      if (result.commit_ready) {
        toast.success('Excel перевірено. Можна імпортувати меню.');
      } else {
        toast.warning('Excel перевірено, але знайдено помилки.');
      }
    } catch (error) {
      setPreview(null);
      toast.error(getApiErrorMessage(error, 'Не вдалося перевірити Excel-файл.'));
    }
  };

  const handleCommit = async () => {
    if (!preview) {
      return;
    }

    if (isExpired(preview.expires_at)) {
      toast.error('Термін дії попереднього перегляду минув. Завантажте файл ще раз.');
      return;
    }

    try {
      const result = await commitMutation.mutateAsync({
        previewId: preview.preview_id,
      });
      onImported(result.menus);
      toast.success(`Імпорт завершено. Створено тижневих меню: ${result.created_menu_ids.length}.`);
      setFile(null);
      setPreview(null);
      setPreviewOpen(false);
      setActiveSheet(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Не вдалося імпортувати меню.'));
    }
  };

  const handleTemplateDownload = async () => {
    try {
      triggerWorkbookDownload(await templateDownload.mutateAsync());
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Не вдалося завантажити шаблон.'));
    }
  };

  const handleExport = async () => {
    if (!selectedMenuId) {
      return;
    }

    try {
      triggerWorkbookDownload(await menuExport.mutateAsync(selectedMenuId));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Не вдалося експортувати меню.'));
    }
  };

  const clearSelection = () => {
    setFile(null);
    setFileError(null);
    setPreview(null);
    setPreviewOpen(false);
    setActiveSheet(0);
    previewMutation.reset();
    commitMutation.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const busy =
    previewMutation.isPending ||
    commitMutation.isPending ||
    templateDownload.isPending ||
    menuExport.isPending;

  return (
    <>
      <section className="nf-panel mb-5">
        <div className="nf-panel-header">
          <div>
            <h2 className="nf-panel-title">Excel: імпорт та експорт меню</h2>
            <p className="mt-1 text-xs text-slate-600">
              Завантажте готовий файл, перевірте його у таблиці та підтвердьте імпорт.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="nf-button nf-button-secondary"
              disabled={templateDownload.isPending}
              onClick={() => void handleTemplateDownload()}
            >
              {templateDownload.isPending ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Download size={15} />
              )}
              Порожній шаблон
            </button>
            <button
              type="button"
              className="nf-button nf-button-secondary"
              disabled={!selectedMenuId || menuExport.isPending}
              onClick={() => void handleExport()}
            >
              {menuExport.isPending ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={15} />
              )}
              Експорт обраного меню
            </button>
          </div>
        </div>

        <div className="nf-panel-body space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div
              role="button"
              tabIndex={0}
              aria-label="Оберіть або перетягніть Excel-файл"
              className={`flex min-h-36 cursor-pointer items-center justify-center border-2 border-dashed px-5 py-6 text-center transition ${
                dragActive
                  ? 'border-emerald-700 bg-emerald-50'
                  : file
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-slate-300 bg-slate-50 hover:border-emerald-600 hover:bg-emerald-50/40'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={handleDropzoneKeyDown}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget === event.target) {
                  setDragActive(false);
                }
              }}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(event) => selectFile(event.target.files?.[0])}
              />

              {file ? (
                <div className="flex max-w-full items-center gap-3 text-left">
                  <FileSpreadsheet size={30} className="shrink-0 text-emerald-700" />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{file.name}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {formatFileSize(file.size)} · натисніть або перетягніть інший файл для заміни
                    </p>
                  </div>
                  <button
                    type="button"
                    className="nf-button nf-button-ghost shrink-0"
                    aria-label="Прибрати файл"
                    onClick={(event) => {
                      event.stopPropagation();
                      clearSelection();
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div>
                  <UploadCloud size={34} className="mx-auto text-emerald-700" />
                  <p className="mt-3 font-bold text-slate-900">Перетягніть сюди файл .xlsx</p>
                  <p className="mt-1 text-xs text-slate-600">
                    або натисніть, щоб обрати файл · до {formatFileSize(WEEKLY_MENU_XLSX_MAX_BYTES)}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between gap-3 border border-slate-200 bg-slate-50 p-3">
              <label>
                <span className="nf-label">Тип меню у файлі</span>
                <select
                  className="nf-input"
                  value={mealType}
                  disabled={previewMutation.isPending}
                  onChange={(event) => {
                    setMealType(event.target.value as MealType);
                    setPreview(null);
                    setPreviewOpen(false);
                  }}
                >
                  <option value="lunch">Обід</option>
                  <option value="breakfast">Сніданок</option>
                </select>
              </label>

              <button
                type="button"
                className="nf-button nf-button-primary w-full"
                disabled={!file || previewMutation.isPending}
                onClick={() => void handlePreview()}
              >
                {previewMutation.isPending ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={15} />
                )}
                Перевірити файл
              </button>
            </div>
          </div>

          {fileError ? <div className="nf-error">{fileError}</div> : null}

          {preview ? (
            <div className="space-y-4 border-t border-slate-300 pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {preview.commit_ready && !previewExpired ? (
                      <CheckCircle2 size={18} className="text-emerald-700" />
                    ) : (
                      <AlertTriangle size={18} className="text-amber-700" />
                    )}
                    <h3 className="font-bold text-slate-900">
                      Попередній перегляд: {preview.filename}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {previewSummary?.menus ?? 0} тиж. · {previewSummary?.days ?? 0} дн. ·{' '}
                    {previewSummary?.items ?? 0} позицій · помилок: {errors.length} · попереджень:{' '}
                    {warnings.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Перегляд чинний до {new Date(preview.expires_at).toLocaleString('uk-UA')}.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="nf-button nf-button-secondary"
                    onClick={() => setPreviewOpen(true)}
                  >
                    <Eye size={15} />
                    Відкрити preview
                  </button>
                  <button
                    type="button"
                    className="nf-button nf-button-primary"
                    disabled={
                      !preview.commit_ready ||
                      previewExpired ||
                      commitMutation.isPending ||
                      (busy && !commitMutation.isPending)
                    }
                    onClick={() => void handleCommit()}
                  >
                    {commitMutation.isPending ? (
                      <LoaderCircle size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    Імпортувати {previewSummary?.menus ?? 0} тиж.
                  </button>
                </div>
              </div>

              {previewExpired ? (
                <div className="nf-error">
                  Термін дії цього preview минув. Натисніть «Перевірити файл» ще раз.
                </div>
              ) : null}

              {diagnostics.length ? (
                <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Є зауваження до файлу: помилок {errors.length}, попереджень {warnings.length}.
                  Деталі доступні у preview.
                </div>
              ) : preview.menus.length ? (
                <div className="border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  Формат файлу коректний. Відкрийте preview, щоб переглянути меню перед імпортом.
                </div>
              ) : (
                <div className="nf-empty">
                  У файлі не знайдено жодного тижневого меню для перегляду.
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <WeeklyMenuImportPreviewDialog
        open={previewOpen}
        preview={preview}
        activeSheet={safeActiveSheet}
        previewExpired={previewExpired}
        commitPending={commitMutation.isPending}
        commitDisabled={
          !preview?.commit_ready ||
          previewExpired ||
          commitMutation.isPending ||
          (busy && !commitMutation.isPending)
        }
        onActiveSheetChange={setActiveSheet}
        onClose={() => setPreviewOpen(false)}
        onCommit={() => void handleCommit()}
      />
    </>
  );
}
