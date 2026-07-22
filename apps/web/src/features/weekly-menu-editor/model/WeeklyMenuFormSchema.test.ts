import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createBlankWeeklyMenuFormValues,
  formValuesToWeeklyMenuPayload,
  resolveEffectiveDayDate,
  updateDayDate,
  weeklyMenuFormSchema,
} from './WeeklyMenuFormSchema';

describe('weekly menu form schema', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects duplicate weekdays', () => {
    const values = createBlankWeeklyMenuFormValues();
    values.title = 'Меню на тиждень';
    values.days = [values.days[0], { ...values.days[0] }];
    values.days[0].items[0].name = 'Суп овочевий';
    values.days[0].items[0].portions.forEach((portion) => {
      portion.yield_amount = '250';
    });

    const result = weeklyMenuFormSchema.safeParse(values);

    expect(result.success).toBe(false);
  });

  it('normalizes payload fields for API submission', () => {
    const values = createBlankWeeklyMenuFormValues();
    values.title = ' Меню на тиждень ';
    values.cycle_week = '3';
    values.notes = '  Загальна нотатка  ';
    values.days = values.days.slice(0, 1);
    values.days[0].date = '2026-07-06';
    values.days[0].items[0].name = ' Гречка з овочами ';
    values.days[0].items[0].recipe_card_number = ' 0012 ';
    values.days[0].items[0].allergen_codes = [' a1 ', 'b2', 'a1'];
    values.days[0].items[0].notes = '  Без цукру ';
    values.days[0].items[0].portions[0].yield_amount = '250';
    values.days[0].items[0].portions[0].calculated_from = {
      portion_variant_id: 'source-portion-id',
      yield_amount: '240',
    };
    values.days[0].items[0].portions[0].nutrition.kcal = '120.5';
    values.days[0].items[0].portions[1].yield_amount = '300';
    values.days[0].items[0].portions[2].yield_amount = '350';

    const payload = formValuesToWeeklyMenuPayload(values);

    expect(payload.title).toBe('Меню на тиждень');
    expect(payload.cycle_week).toBe(3);
    expect(payload.notes).toBe('Загальна нотатка');
    expect(payload.days[0].items[0].position).toBe(1);
    expect(payload.days[0].items[0].name).toBe('Гречка з овочами');
    expect(payload.days[0].items[0].recipe_card_number).toBe('0012');
    expect(payload.days[0].items[0].allergen_codes).toEqual(['A1', 'B2']);
    expect(payload.days[0].items[0].notes).toBe('Без цукру');
    expect(payload.days[0].items[0].portions[0].nutrition.kcal).toBe('120.5');
    expect(payload.days[0].items[0].portions[0].calculated_from).toEqual({
      portion_variant_id: 'source-portion-id',
      yield_amount: '240',
    });
  });

  it('uses the next Monday when week start is omitted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T10:00:00+03:00'));

    const values = createBlankWeeklyMenuFormValues();
    values.title = 'Меню на тиждень';
    values.days = values.days.slice(0, 2);
    values.days[0].items[0].name = 'Перша страва';
    values.days[1].items[0].name = 'Друга страва';
    values.days[0].items[0].portions.forEach((portion) => {
      portion.yield_amount = '100';
    });
    values.days[1].items[0].portions.forEach((portion) => {
      portion.yield_amount = '120';
    });

    const payload = formValuesToWeeklyMenuPayload(values);

    expect(payload.starts_on).toBe('2026-07-13');
    expect(payload.days[0].date).toBe('2026-07-13');
    expect(payload.days[1].date).toBe('2026-07-14');
  });

  it('prefills a new menu with the next Monday and its weekdays', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T10:00:00+03:00'));

    const values = createBlankWeeklyMenuFormValues();

    expect(values.starts_on).toBe('2026-07-13');
    expect(values.days.map((day) => day.date)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
    ]);
  });

  it('aligns a legacy day date with the weekday before generation', () => {
    expect(resolveEffectiveDayDate('2026-07-12', 0, '2026-07-12')).toBe('2026-07-13');
    expect(resolveEffectiveDayDate('2026-07-12', 4, '2026-07-16')).toBe('2026-07-17');
  });
  it('propagates a changed Monday date across the remaining weekdays', () => {
    const values = createBlankWeeklyMenuFormValues();
    values.days = values.days.slice(0, 5);

    const updatedDays = updateDayDate(values.days, 'monday', '2026-07-13');

    expect(updatedDays.map((day) => day.date)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
    ]);
  });

  it('changes only the selected non-Monday date', () => {
    const values = createBlankWeeklyMenuFormValues();
    values.days = updateDayDate(values.days.slice(0, 5), 'monday', '2026-07-13');

    const updatedDays = updateDayDate(values.days, 'wednesday', '2026-07-22');

    expect(updatedDays.map((day) => day.date)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-22',
      '2026-07-16',
      '2026-07-17',
    ]);
  });
});
