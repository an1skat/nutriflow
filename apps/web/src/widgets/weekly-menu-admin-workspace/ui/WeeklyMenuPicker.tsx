'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Archive, ChevronDown, Plus, Search } from 'lucide-react';

import type { WeeklyMenu } from '@/entities/weekly-menu/model/WeeklyMenu';
import { formatDate } from '@/shared/lib/FormatDate';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';
import { RequestError } from '@/shared/ui/RequestError';

type WeeklyMenuPickerProps = {
  menus: WeeklyMenu[];
  selectedMenu: WeeklyMenu | null;
  isCreatingNewMenu: boolean;
  loading: boolean;
  error: unknown;
  archiving: boolean;
  onRetry: () => void;
  onSelect: (menuId: string) => void;
  onCreateNew: () => void;
  onArchiveSelected: () => void;
};

function getMealTypeLabel(menu: WeeklyMenu) {
  return menu.meal_type === 'lunch' ? 'Обід' : 'Сніданок';
}

export function WeeklyMenuPicker({
  menus,
  selectedMenu,
  isCreatingNewMenu,
  loading,
  error,
  archiving,
  onRetry,
  onSelect,
  onCreateNew,
  onArchiveSelected,
}: WeeklyMenuPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filteredMenus = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('uk');

    if (!query) {
      return menus;
    }

    return menus.filter((menu) => {
      const searchableText = [
        menu.title,
        getMealTypeLabel(menu),
        menu.cycle_week ? `цикл ${menu.cycle_week}` : '',
      ]
        .join(' ')
        .toLocaleLowerCase('uk');

      return searchableText.includes(query);
    });
  }, [menus, search]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedTitle = isCreatingNewMenu
    ? 'Нове тижневе меню'
    : (selectedMenu?.title ?? 'Оберіть меню');
  const selectedMeta = isCreatingNewMenu
    ? 'Буде створено окреме меню'
    : selectedMenu
      ? `${getMealTypeLabel(selectedMenu)}${selectedMenu.cycle_week ? ` · цикл ${selectedMenu.cycle_week}` : ''}`
      : 'Відкрийте список, щоб вибрати меню';

  return (
    <section className="nf-panel">
      <div className="nf-panel-body flex flex-col gap-3 lg:flex-row lg:items-end">
        <div ref={rootRef} className="relative min-w-0 flex-1">
          <span className="nf-label">Меню</span>
          <button
            ref={triggerRef}
            type="button"
            className="flex min-h-14 w-full items-center justify-between gap-3 border border-[#8f978c] bg-white px-3 py-2 text-left shadow-[inset_0_1px_2px_rgb(0_0_0/6%)] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--nf-brand)"
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((value) => !value)}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-slate-900">
                {selectedTitle}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-600">{selectedMeta}</span>
            </span>
            <ChevronDown
              aria-hidden
              className={`size-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isOpen ? (
            <div
              role="dialog"
              aria-label="Вибір тижневого меню"
              className="absolute left-0 right-0 z-30 mt-1 border border-(--nf-line-strong) bg-white shadow-lg"
            >
              <div className="border-b border-(--nf-line) p-3">
                <label htmlFor="weekly-menu-search" className="sr-only">
                  Пошук меню
                </label>
                <div className="flex items-center gap-2">
                  <Search aria-hidden className="size-4 shrink-0 text-slate-500" />

                  <input
                    id="weekly-menu-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Пошук за назвою, типом або тижнем циклу"
                    className="nf-input min-w-0 flex-1"
                    autoFocus
                  />
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto p-2">
                {loading ? (
                  <LoadingSpinner className="px-2 py-3" label="Завантажуємо меню…" />
                ) : null}

                {error ? (
                  <div className="p-1">
                    <RequestError error={error} onRetry={onRetry} />
                  </div>
                ) : null}

                {!loading && !error && menus.length === 0 ? (
                  <div className="nf-empty">Меню ще немає.</div>
                ) : null}

                {!loading && !error && menus.length > 0 && filteredMenus.length === 0 ? (
                  <div className="nf-empty">За цим запитом меню не знайдено.</div>
                ) : null}

                <div className="space-y-1">
                  {filteredMenus.map((menu) => {
                    const isActive = !isCreatingNewMenu && selectedMenu?.id === menu.id;

                    return (
                      <button
                        key={menu.id}
                        type="button"
                        onClick={() => {
                          onSelect(menu.id);
                          setIsOpen(false);
                          setSearch('');
                        }}
                        className={`w-full border p-3 text-left ${
                          isActive
                            ? 'border-(--nf-brand-dark) bg-(--nf-panel-head)'
                            : 'border-transparent bg-white hover:border-(--nf-line) hover:bg-slate-50'
                        }`}
                        aria-current={isActive ? 'true' : undefined}
                      >
                        <span className="block font-bold text-slate-900">{menu.title}</span>
                        <span className="mt-1 block text-xs text-slate-600">
                          {getMealTypeLabel(menu)}
                          {menu.cycle_week ? ` · цикл ${menu.cycle_week}` : ''}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          Оновлено: {formatDate(menu.updated_at)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="nf-button nf-button-secondary shrink-0 lg:min-h-14"
          onClick={() => {
            onCreateNew();
            setIsOpen(false);
            setSearch('');
          }}
        >
          <Plus className="size-4" aria-hidden />
          Нове меню
        </button>

        <button
          type="button"
          className="nf-button nf-button-danger shrink-0 lg:min-h-14"
          disabled={!selectedMenu || isCreatingNewMenu || archiving}
          onClick={() => {
            onArchiveSelected();
            setIsOpen(false);
            setSearch('');
          }}
        >
          {archiving ? (
            <LoadingSpinner size="sm" label="Архівуємо…" />
          ) : (
            <>
              <Archive className="size-4" aria-hidden />
              Архівувати
            </>
          )}
        </button>
      </div>
    </section>
  );
}
