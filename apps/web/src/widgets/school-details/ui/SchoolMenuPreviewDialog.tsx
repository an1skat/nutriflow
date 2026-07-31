'use client';

import { useEffect } from 'react';

import { X } from 'lucide-react';

import type { WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';
import { WeeklyMenuImportPreviewTable } from '@/features/weekly-menu-excel/ui/WeeklyMenuImportPreviewTable';

type SchoolMenuPreviewDialogProps = {
  menu: WeeklyMenu | null;
  onClose: () => void;
};

export function SchoolMenuPreviewDialog({ menu, onClose }: SchoolMenuPreviewDialogProps) {
  useEffect(() => {
    if (!menu) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu, onClose]);

  if (!menu) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[1px] sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="school-menu-preview-title"
        className="flex max-h-[90vh] w-full max-w-305 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="school-menu-preview-title"
              className="truncate text-base font-bold text-slate-950"
            >
              {menu.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {menu.meal_type === 'lunch' ? 'Обід' : 'Сніданок'}
              {menu.cycle_week ? ` · тиждень ${menu.cycle_week}` : ''}
              {menu.starts_on ? ` · від ${menu.starts_on}` : ''}
              {menu.ends_on ? ` до ${menu.ends_on}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="nf-button nf-button-ghost shrink-0"
            aria-label="Закрити перегляд меню"
            onClick={onClose}
          >
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {menu.notes ? (
            <p className="mb-3 border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {menu.notes}
            </p>
          ) : null}
          <WeeklyMenuImportPreviewTable menu={menu} />
        </div>
      </section>
    </div>
  );
}
