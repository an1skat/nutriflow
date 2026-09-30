'use client';

import { useEffect, useRef, useState } from 'react';

import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

import {
  useDailyMenuMonth,
  useDailyMenuSchools,
} from '@/entities/weekly-menu/api/DailyMenuQueries';
import { useConfirm } from '@/shared/ui/ConfirmDialog';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';
import { RequestError } from '@/shared/ui/RequestError';
import { DailyMenuSchoolWorkspace } from '@/widgets/daily-menu-school-workspace/ui/DailyMenuSchoolWorkspace';

const UKRAINIAN_MONTHS = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
];

const UKRAINIAN_MONTHS_SHORT = [
  'Січ',
  'Лют',
  'Бер',
  'Кві',
  'Тра',
  'Чер',
  'Лип',
  'Сер',
  'Вер',
  'Жов',
  'Лис',
  'Гру',
];

function shiftMonth(monthStr: string, delta: number): string {
  const [year, monthNum] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, monthNum - 1 + delta, 1));
  const newYear = d.getUTCFullYear();
  const newMonth = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${newYear}-${newMonth}`;
}

export function AdminDailyMenus({ initialSchoolId = '' }: { initialSchoolId?: string }) {
  const schools = useDailyMenuSchools();
  const confirm = useConfirm();
  const [dirty, setDirty] = useState(false);
  const navigate = async (change: () => void) => {
    if (
      dirty &&
      !(await confirm({
        title: 'Перейти без збереження?',
        description: 'Незбережені зміни цього дня буде втрачено.',
        confirmLabel: 'Перейти',
      }))
    )
      return;
    setDirty(false);
    change();
  };
  const [schoolId, setSchoolId] = useState(initialSchoolId);
  const [month, setMonth] = useState(() =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Kyiv' }).format(new Date()).slice(0, 7)
  );
  const [date, setDate] = useState('');
  const [menuId, setMenuId] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const [year, monthNumber] = month.split('-').map(Number);
  const [pickerYear, setPickerYear] = useState(year || 2026);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPickerOpen]);

  const allowedSchoolId = schools.data?.some((school) => school.id === schoolId) ? schoolId : '';
  const calendar = useDailyMenuMonth(allowedSchoolId, month);
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const selected = calendar.data?.items.find(
    (item) => item.date === date && item.menu_id === menuId
  );

  const [workspaceMinHeight, setWorkspaceMinHeight] = useState<number | undefined>(undefined);
  const workspaceContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = workspaceContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 100) {
          setWorkspaceMinHeight(entry.contentRect.height);
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <main className="nf-page nf-page-wide space-y-5">
      <h1 className="nf-title">Денні меню</h1>
      {schools.isError ? (
        <RequestError error={schools.error} onRetry={() => void schools.refetch()} />
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5 min-w-[280px]">
          <label className="nf-label" htmlFor="school-select">
            Школа
          </label>
          <select
            id="school-select"
            className="nf-input h-10"
            value={schoolId}
            onChange={(event) => {
              const value = event.target.value;
              void navigate(() => {
                setSchoolId(value);
                setDate('');
                setMenuId('');
              });
            }}
          >
            <option value="">Оберіть школу</option>
            {schools.data?.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="nf-label">Місяць</span>
          <div className="relative flex items-center gap-1.5">
            <button
              type="button"
              className="nf-button nf-button-secondary h-10 w-10 p-0 justify-center"
              aria-label="Попередній місяць"
              onClick={() => {
                const prev = shiftMonth(month, -1);
                void navigate(() => {
                  setMonth(prev);
                  setDate('');
                  setMenuId('');
                });
              }}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>

            <button
              type="button"
              className="nf-button nf-button-secondary h-10 min-w-[170px] justify-between gap-2.5 px-3 font-medium text-slate-800"
              aria-expanded={isPickerOpen}
              aria-label={`Місяць: ${UKRAINIAN_MONTHS[monthNumber - 1]} ${year}`}
              onClick={() => {
                setPickerYear(year);
                setIsPickerOpen((prev) => !prev);
              }}
            >
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-(--nf-brand-dark)" aria-hidden />
                <span>
                  {UKRAINIAN_MONTHS[monthNumber - 1]} {year}
                </span>
              </div>
              <ChevronDown
                className={`size-4 text-slate-400 transition-transform ${isPickerOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>

            <button
              type="button"
              className="nf-button nf-button-secondary h-10 w-10 p-0 justify-center"
              aria-label="Наступний місяць"
              onClick={() => {
                const next = shiftMonth(month, 1);
                void navigate(() => {
                  setMonth(next);
                  setDate('');
                  setMenuId('');
                });
              }}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>

            {isPickerOpen ? (
              <div
                ref={pickerRef}
                className="absolute left-11 top-full z-50 mt-1.5 w-64 border border-(--nf-line-strong) bg-white p-3 shadow-md"
                role="dialog"
                aria-label="Календар вибору місяця"
              >
                <div className="mb-3 flex items-center justify-between border-b border-(--nf-line) pb-2">
                  <button
                    type="button"
                    className="rounded p-1 text-(--nf-text) hover:bg-(--nf-panel-head) transition-colors"
                    aria-label="Попередній рік"
                    onClick={() => setPickerYear((y) => Math.max(2000, y - 1))}
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="font-bold text-(--nf-text) text-sm">{pickerYear}</span>
                  <button
                    type="button"
                    className="rounded p-1 text-(--nf-text) hover:bg-(--nf-panel-head) transition-colors"
                    aria-label="Наступний рік"
                    onClick={() => setPickerYear((y) => Math.min(2100, y + 1))}
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {UKRAINIAN_MONTHS_SHORT.map((shortName, idx) => {
                    const monthVal = String(idx + 1).padStart(2, '0');
                    const candidateMonth = `${pickerYear}-${monthVal}`;
                    const isSelected = candidateMonth === month;
                    return (
                      <button
                        key={shortName}
                        type="button"
                        className={`rounded py-2 text-xs font-medium transition-colors ${
                          isSelected
                            ? 'bg-(--nf-brand) text-white font-bold'
                            : 'text-(--nf-text) hover:bg-(--nf-panel-head) hover:text-(--nf-brand-dark)'
                        }`}
                        onClick={() => {
                          setIsPickerOpen(false);
                          void navigate(() => {
                            setMonth(candidateMonth);
                            setDate('');
                            setMenuId('');
                          });
                        }}
                      >
                        {shortName}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {initialSchoolId && schools.data && !allowedSchoolId && schoolId ? (
        <p>Школа недоступна.</p>
      ) : null}
      {allowedSchoolId && calendar.isPending ? (
        <LoadingSpinner label="Завантажуємо календар…" />
      ) : null}
      {calendar.isError ? (
        <RequestError error={calendar.error} onRetry={() => void calendar.refetch()} />
      ) : null}
      {allowedSchoolId && calendar.data ? (
        <>
          <div className="grid grid-cols-7 gap-1.5" aria-label="Календар денних меню">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((label) => (
              <div
                key={label}
                className="p-2 text-center text-xs font-bold text-slate-500 uppercase tracking-wider"
              >
                {label}
              </div>
            ))}
            {Array.from({ length: offset }, (_, index) => (
              <div
                key={`blank-${index}`}
                className="min-h-24 rounded-lg border border-transparent bg-slate-50/30"
              />
            ))}
            {Array.from({ length: dayCount }, (_, index) => {
              const dateValue = `${month}-${String(index + 1).padStart(2, '0')}`;
              const items = calendar.data.items.filter((item) => item.date === dateValue);
              const hasMenu = items.length > 0;
              const isSelected = date === dateValue;
              return (
                <button
                  key={dateValue}
                  type="button"
                  aria-label={`${dateValue}: ${items.map((item) => `${item.meal_type === 'lunch' ? 'Обід' : 'Сніданок'} · ${item.closed_at ? 'Закрито' : 'Відкрито'}`).join(', ') || 'Немає меню'}`}
                  aria-pressed={isSelected}
                  disabled={!hasMenu}
                  className={`group relative min-h-24 border p-2.5 text-left transition-colors ${
                    isSelected
                      ? 'border-2 border-(--nf-brand-dark) bg-(--nf-panel-head)'
                      : hasMenu
                        ? 'border-(--nf-line) bg-white hover:border-(--nf-brand) hover:bg-[#f7f8f6] cursor-pointer'
                        : 'border-(--nf-line)/50 bg-slate-50/60 text-slate-400 cursor-default'
                  }`}
                  onClick={() =>
                    void navigate(() => {
                      setDate(dateValue);
                      setMenuId(items[0].menu_id);
                    })
                  }
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-sm font-bold transition-colors ${
                        isSelected
                          ? 'text-(--nf-brand-dark)'
                          : hasMenu
                            ? 'text-(--nf-text) group-hover:text-(--nf-brand-dark)'
                            : 'text-slate-400'
                      }`}
                    >
                      {index + 1}
                    </span>
                    {hasMenu ? (
                      <span className="size-1.5 rounded-full bg-(--nf-brand)" />
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <span
                        key={`${item.menu_id}:${item.weekday}`}
                        className={`block truncate px-1.5 py-0.5 text-xs font-medium ${
                          item.closed_at
                            ? 'bg-slate-100 text-slate-600'
                            : 'border border-(--nf-line) bg-[#eef3ef] text-(--nf-brand-dark)'
                        }`}
                      >
                        {item.meal_type === 'lunch' ? 'Обід' : 'Сніданок'} ·{' '}
                        {item.closed_at ? 'Закрито' : 'Відкрито'}
                      </span>
                    ))}
                    {!hasMenu ? (
                      <span className="block text-xs text-slate-400 italic">Немає меню</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
          {date ? (
            <div className="flex flex-wrap gap-2.5" aria-label="Меню обраного дня">
              {calendar.data.items
                .filter((item) => item.date === date)
                .map((item) => {
                  const isSelected = menuId === item.menu_id;
                  return (
                    <button
                      key={item.menu_id}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${item.meal_type === 'lunch' ? 'Обід' : 'Сніданок'}: ${item.menu_title}`}
                      className={`group border px-4 py-2 text-left transition-colors ${
                        isSelected
                          ? 'border-(--nf-brand-dark) bg-(--nf-brand) text-white'
                          : 'border-(--nf-line-strong) bg-[#f5f6f3] text-(--nf-text) hover:bg-(--nf-panel-head) hover:border-(--nf-brand-dark)'
                      }`}
                      onClick={() => {
                        if (menuId === item.menu_id) return;
                        const currentScrollY = window.scrollY;
                        void navigate(() => {
                          setMenuId(item.menu_id);
                          requestAnimationFrame(() => {
                            window.scrollTo({ top: currentScrollY, behavior: 'instant' });
                          });
                        });
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold">
                          {item.meal_type === 'lunch' ? 'Обід' : 'Сніданок'}
                        </span>
                        {isSelected ? (
                          <span
                            className="size-1.5 rounded-full bg-white/80"
                            aria-hidden="true"
                          />
                        ) : null}
                      </div>
                      <span
                        className={`block text-[11px] leading-tight font-normal max-w-[200px] truncate ${
                          isSelected ? 'text-[#d7e2da]' : 'text-(--nf-muted)'
                        }`}
                        title={item.menu_title}
                      >
                        {item.menu_title}
                      </span>
                    </button>
                  );
                })}
            </div>
          ) : null}
          <div
            ref={workspaceContainerRef}
            style={{ minHeight: workspaceMinHeight ? `${workspaceMinHeight}px` : undefined }}
          >
            {selected ? (
              <DailyMenuSchoolWorkspace
                key={`${schoolId}:${selected.menu_id}:${selected.weekday}`}
                admin={{
                  menuId: selected.menu_id,
                  weekday: selected.weekday,
                  schoolId: allowedSchoolId,
                  groups: calendar.data.groups,
                  readOnly: selected.date > calendar.data.today,
                  requirementStale: selected.requirement_stale,
                  requirementRevision: selected.revision,
                  onDirtyChange: setDirty,
                }}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}
