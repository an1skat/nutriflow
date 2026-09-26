'use client';

import { useState } from 'react';

import {
  useDailyMenuMonth,
  useDailyMenuSchools,
} from '@/entities/weekly-menu/api/DailyMenuQueries';
import { useConfirm } from '@/shared/ui/ConfirmDialog';
import { LoadingSpinner } from '@/shared/ui/LoadingSpinner';
import { RequestError } from '@/shared/ui/RequestError';
import { DailyMenuSchoolWorkspace } from '@/widgets/daily-menu-school-workspace/ui/DailyMenuSchoolWorkspace';

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
  const allowedSchoolId = schools.data?.some((school) => school.id === schoolId) ? schoolId : '';
  const calendar = useDailyMenuMonth(allowedSchoolId, month);
  const [year, monthNumber] = month.split('-').map(Number);
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const selected = calendar.data?.items.find(
    (item) => item.date === date && item.menu_id === menuId
  );
  return (
    <main className="nf-page nf-page-wide space-y-5">
      <h1 className="nf-title">Денні меню</h1>
      {schools.isError ? (
        <RequestError error={schools.error} onRetry={() => void schools.refetch()} />
      ) : null}
      <div className="flex flex-wrap gap-4">
        <label className="nf-label">
          Школа
          <select
            className="nf-input"
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
        </label>
        <label className="nf-label">
          Місяць
          <input
            className="nf-input"
            type="month"
            min="2000-01"
            max="2100-12"
            value={month}
            onChange={(event) => {
              const value = event.target.value;
              if (value)
                void navigate(() => {
                  setMonth(value);
                  setDate('');
                  setMenuId('');
                });
            }}
          />
        </label>
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
          <div className="grid grid-cols-7 gap-1" aria-label="Календар денних меню">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((label) => (
              <div key={label} className="p-2 text-center font-bold">
                {label}
              </div>
            ))}
            {Array.from({ length: offset }, (_, index) => (
              <div key={`blank-${index}`} />
            ))}
            {Array.from({ length: dayCount }, (_, index) => {
              const dateValue = `${month}-${String(index + 1).padStart(2, '0')}`;
              const items = calendar.data.items.filter((item) => item.date === dateValue);
              return (
                <button
                  key={dateValue}
                  type="button"
                  aria-label={`${dateValue}: ${items.map((item) => `${item.meal_type === 'lunch' ? 'Обід' : 'Сніданок'} · ${item.closed_at ? 'Закрито' : 'Відкрито'}`).join(', ') || 'Немає меню'}`}
                  aria-pressed={date === dateValue}
                  disabled={!items.length}
                  className={`min-h-24 border p-2 text-left ${date === dateValue ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200'} ${!items.length ? 'bg-slate-50 text-slate-400' : ''}`}
                  onClick={() =>
                    void navigate(() => {
                      setDate(dateValue);
                      setMenuId(items[0].menu_id);
                    })
                  }
                >
                  <span className="font-bold">{index + 1}</span>
                  {items.map((item) => (
                    <span
                      key={`${item.menu_id}:${item.weekday}`}
                      className={`block text-xs ${item.closed_at ? 'text-slate-600' : 'text-emerald-800'}`}
                    >
                      {item.meal_type === 'lunch' ? 'Обід' : 'Сніданок'} ·{' '}
                      {item.closed_at ? 'Закрито' : 'Відкрито'}
                    </span>
                  ))}
                  {!items.length ? <span className="block text-xs">Немає меню</span> : null}
                </button>
              );
            })}
          </div>
          {date ? (
            <div className="flex flex-wrap gap-2" aria-label="Меню обраного дня">
              {calendar.data.items
                .filter((item) => item.date === date)
                .map((item) => (
                  <button
                    key={item.menu_id}
                    className="nf-button nf-button-secondary"
                    aria-pressed={menuId === item.menu_id}
                    onClick={() => void navigate(() => setMenuId(item.menu_id))}
                  >
                    {item.meal_type === 'lunch' ? 'Обід' : 'Сніданок'} · {item.menu_title}
                  </button>
                ))}
            </div>
          ) : null}
          {selected ? (
            <DailyMenuSchoolWorkspace
              key={`${schoolId}:${selected.menu_id}:${selected.weekday}`}
              admin={{
                menuId: selected.menu_id,
                weekday: selected.weekday,
                schoolId: allowedSchoolId,
                groups: calendar.data.groups,
                readOnly: month !== calendar.data.today.slice(0, 7),
                requirementStale: selected.requirement_stale,
                requirementRevision: selected.revision,
                onDirtyChange: setDirty,
              }}
            />
          ) : null}
        </>
      ) : null}
    </main>
  );
}
