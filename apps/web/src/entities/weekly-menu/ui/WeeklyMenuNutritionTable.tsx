import type { CSSProperties, ReactNode } from 'react';

import { AGE_GROUP_LABELS, type AgeGroup, WEEKDAY_LABELS, type Weekday } from '../model/WeeklyMenu';

type TableNutrition = {
  kcal: string | null;
  proteins: string | null;
  fats: string | null;
  carbs: string | null;
};

type TablePortion = {
  age_group: AgeGroup;
  yield_amount: string;
  nutrition: TableNutrition;
};

export type WeeklyMenuTableItem = {
  id?: string | null;
  position: number;
  name: string;
  source_text: string | null;
  recipe_card_number: string | null;
  allergen_codes: string[];
  portions: TablePortion[];
  notes: string | null;
};

export type WeeklyMenuTableDay = {
  weekday: Weekday;
  date: string | null;
  items: WeeklyMenuTableItem[];
  notes: string | null;
};

const DISPLAY_AGE_GROUPS: AgeGroup[] = ['6-11', '11-14', '14-18'];
const MENU_GRID_STYLE = {
  gridTemplateColumns: '48px minmax(320px, 1.55fr) 132px repeat(3, minmax(156px, 1fr))',
} satisfies CSSProperties;

export function WeeklyMenuNutritionTable({
  days,
  maxHeightClass = 'max-h-[58vh]',
}: {
  days: WeeklyMenuTableDay[];
  maxHeightClass?: string;
}) {
  return (
    <div className={`${maxHeightClass} overflow-auto bg-slate-50`}>
      <div
        className="sticky top-0 z-20 grid min-w-270 border-b border-slate-300 bg-slate-100 text-xs font-bold uppercase text-slate-600 shadow-sm"
        style={MENU_GRID_STYLE}
      >
        <TableCell className="py-2">№</TableCell>
        <TableCell className="py-2">Страва</TableCell>
        <TableCell className="py-2">Алергени</TableCell>
        {DISPLAY_AGE_GROUPS.map((ageGroup) => (
          <TableCell key={ageGroup} className="bg-emerald-50 py-2 text-emerald-950">
            {AGE_GROUP_LABELS[ageGroup]}
          </TableCell>
        ))}
      </div>

      <div className="min-w-270 bg-white">
        {days.map((day) => (
          <DaySection key={day.weekday} day={day} />
        ))}
      </div>
    </div>
  );
}

function DaySection({ day }: { day: WeeklyMenuTableDay }) {
  const sortedItems = [...day.items].sort((left, right) => left.position - right.position);

  return (
    <section className="border-b border-slate-200 last:border-b-0">
      <div className="bg-emerald-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-emerald-950">
            {WEEKDAY_LABELS[day.weekday]}
            {day.date ? ` · ${day.date}` : ''}
          </h3>
          <span className="text-xs font-bold text-emerald-800">{sortedItems.length} позицій</span>
        </div>
        {day.notes ? <p className="mt-1 text-xs text-emerald-900/80">{day.notes}</p> : null}
      </div>

      <div className="divide-y divide-slate-100 bg-white">
        {sortedItems.map((item) => (
          <div
            key={item.id ?? `${day.weekday}-${item.position}-${item.name}`}
            className="grid items-stretch text-sm transition-colors hover:bg-slate-50"
            style={MENU_GRID_STYLE}
          >
            <TableCell className="bg-slate-50 text-center font-bold tabular-nums text-slate-500">
              {item.position}
            </TableCell>
            <TableCell>
              <div className="font-bold leading-snug text-slate-950">{item.name}</div>
              <div className="mt-1 text-xs text-slate-500">
                Джерело: {displayValue(item.source_text ?? item.recipe_card_number)}
              </div>
              {item.notes ? (
                <div className="mt-2 border-l-2 border-slate-300 pl-2 text-xs text-slate-600">
                  {item.notes}
                </div>
              ) : null}
            </TableCell>
            <TableCell>
              <AllergenList item={item} />
            </TableCell>
            {DISPLAY_AGE_GROUPS.map((ageGroup) => (
              <NutritionBlock
                key={`${item.position}-${ageGroup}`}
                item={item}
                ageGroup={ageGroup}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="grid border-t border-amber-200 text-sm" style={MENU_GRID_STYLE}>
        <TableCell className="bg-amber-50" />
        <TableCell className="bg-amber-50 font-bold text-amber-950">Підсумок за день</TableCell>
        <TableCell className="bg-amber-50 text-xs font-bold text-amber-800">
          {sortedItems.length} страв
        </TableCell>
        {DISPLAY_AGE_GROUPS.map((ageGroup) => (
          <TotalNutritionBlock
            key={`${day.weekday}-${ageGroup}-total`}
            items={day.items}
            ageGroup={ageGroup}
          />
        ))}
      </div>
    </section>
  );
}

function NutritionBlock({ item, ageGroup }: { item: WeeklyMenuTableItem; ageGroup: AgeGroup }) {
  const portion = getPortionForAgeGroup(item, ageGroup);
  return (
    <TableCell className="bg-white/70">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase text-slate-500">Вихід</span>
        <span className="font-bold tabular-nums text-slate-950">
          {displayValue(portion?.yield_amount)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
        <Metric label="Ккал" value={displayValue(portion?.nutrition.kcal)} />
        <Metric label="Б" value={displayValue(portion?.nutrition.proteins)} />
        <Metric label="Ж" value={displayValue(portion?.nutrition.fats)} />
        <Metric label="В" value={displayValue(portion?.nutrition.carbs)} />
      </div>
    </TableCell>
  );
}

function TotalNutritionBlock({
  items,
  ageGroup,
}: {
  items: WeeklyMenuTableItem[];
  ageGroup: AgeGroup;
}) {
  return (
    <TableCell className="bg-amber-50">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase text-amber-700">Всього</span>
        <span className="font-bold tabular-nums text-amber-950">{sumYield(items, ageGroup)}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-amber-900">
        <Metric label="Ккал" value={formatDecimal(sumNutrition(items, ageGroup, 'kcal'))} />
        <Metric label="Б" value={formatDecimal(sumNutrition(items, ageGroup, 'proteins'))} />
        <Metric label="Ж" value={formatDecimal(sumNutrition(items, ageGroup, 'fats'))} />
        <Metric label="В" value={formatDecimal(sumNutrition(items, ageGroup, 'carbs'))} />
      </div>
    </TableCell>
  );
}

function AllergenList({ item }: { item: WeeklyMenuTableItem }) {
  if (!item.allergen_codes.length) {
    return <span className="text-slate-400">-</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {item.allergen_codes.map((code) => (
        <span
          key={`${item.id ?? item.position}-${code}`}
          className="border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-900"
        >
          {code}
        </span>
      ))}
    </div>
  );
}

function TableCell({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <div className={`border-r border-slate-200 px-3 py-3 last:border-r-0 ${className}`}>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-medium">{label}</span>
      <span className="font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

function getPortionForAgeGroup(item: WeeklyMenuTableItem, ageGroup: AgeGroup) {
  return item.portions.find((portion) => portion.age_group === ageGroup);
}

function sumNutrition(
  items: WeeklyMenuTableItem[],
  ageGroup: AgeGroup,
  field: keyof TableNutrition
): number | null {
  const values = items
    .map((item) => getPortionForAgeGroup(item, ageGroup)?.nutrition[field])
    .map(parseDecimal)
    .filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function sumYield(items: WeeklyMenuTableItem[], ageGroup: AgeGroup): string {
  const rawValues = items
    .map((item) => getPortionForAgeGroup(item, ageGroup)?.yield_amount)
    .filter((value): value is string => Boolean(value?.trim()));
  const numbers = rawValues.map(parseDecimal);
  if (!rawValues.length || numbers.some((value) => value === null)) {
    return '—';
  }
  return formatDecimal(numbers.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() || '—';
}

function parseDecimal(value: string | null | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDecimal(value: number | null): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(value);
}
