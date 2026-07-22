import { z } from 'zod';

import type {
  Weekday,
  WeeklyMenu,
  WeeklyMenuPayload,
} from '@/entities/weekly-menu/model/WeeklyMenu';
import {
  DEFAULT_WEEKDAYS,
  WEEKDAY_ORDER,
  ageGroupSchema,
  mealTypeSchema,
  menuItemKindSchema,
  weekdaySchema,
} from '@/entities/weekly-menu/model/WeeklyMenu';
import { addDaysToLocalIsoDate, toLocalIsoDate } from '@/shared/lib/LocalDate';

const optionalDecimalInput = z
  .string()
  .trim()
  .refine((value) => value === '' || /^-?\d+(\.\d+)?$/.test(value), 'Очікуємо десяткове число');

const optionalDateInput = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value),
    'Використайте формат РРРР-ММ-ДД'
  );

const weeklyMenuPortionFormSchema = z.object({
  age_group: ageGroupSchema,
  yield_amount: z.string().trim().min(1, 'Вкажіть вихід').max(40, 'Значення надто довге'),
  dish_card_portion_variant_id: z.string().min(1).nullable(),
  calculated_from: z
    .object({
      portion_variant_id: z.string().min(1),
      yield_amount: z.string().trim().min(1).max(40),
    })
    .nullable()
    .default(null),
  nutrition: z.object({
    kcal: optionalDecimalInput,
    proteins: optionalDecimalInput,
    fats: optionalDecimalInput,
    carbs: optionalDecimalInput,
  }),
});

const weeklyMenuServingCountFormSchema = z.object({
  school_group_id: z.string().min(1),
  age_group: ageGroupSchema,
  children_count: z.number().int().nonnegative(),
});

const weeklyMenuItemFormSchema = z.object({
  id: z.string().min(1).optional(),
  kind: menuItemKindSchema,
  source_text: z.string().trim().max(255, 'Значення надто довге'),
  recipe_card_number: z.string().trim().max(80, 'Значення надто довге'),
  dish_card_id: z.string().min(1).nullable(),
  dish_card_version_id: z.string().min(1).nullable(),
  product_ingredient_id: z.string().min(1).nullable(),
  product_name_snapshot: z.string().trim().max(255, 'Значення надто довге'),
  name: z
    .string()
    .trim()
    .min(1, 'Вкажіть назву страви або продукту')
    .max(255, 'Значення надто довге'),
  allergen_codes: z.array(z.string()),
  portions: z.array(weeklyMenuPortionFormSchema).min(1),
  servings: z.array(weeklyMenuServingCountFormSchema),
  notes: z.string().trim().max(2000, 'Нотатка надто довга'),
});

const weeklyMenuDayFormSchema = z.object({
  weekday: weekdaySchema,
  date: optionalDateInput,
  items: z.array(weeklyMenuItemFormSchema).min(1, 'Додайте хоча б одну страву'),
  notes: z.string().trim().max(2000, 'Нотатка надто довга'),
});

export const weeklyMenuFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Вкажіть назву меню').max(255, 'Назва надто довга'),
    meal_type: mealTypeSchema,
    cycle_week: z
      .string()
      .trim()
      .refine(
        (value) => value === '' || /^[1-4]$/.test(value),
        'Тиждень циклу має бути від 1 до 4'
      ),
    starts_on: optionalDateInput,
    notes: z.string().trim().max(2000, 'Нотатка надто довга'),
    days: z
      .array(weeklyMenuDayFormSchema)
      .min(1, 'Додайте хоча б один день')
      .max(7, 'У меню може бути не більше 7 днів'),
  })
  .superRefine((value, ctx) => {
    const weekdaySet = new Set(value.days.map((day) => day.weekday));

    if (weekdaySet.size !== value.days.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Кожен день тижня може бути вказаний лише один раз',
        path: ['days'],
      });
    }
  });

export type WeeklyMenuFormValues = z.infer<typeof weeklyMenuFormSchema>;

export function createBlankPortion(ageGroup: z.infer<typeof ageGroupSchema>) {
  return {
    age_group: ageGroup,
    yield_amount: '',
    dish_card_portion_variant_id: null,
    calculated_from: null,
    nutrition: {
      kcal: '',
      proteins: '',
      fats: '',
      carbs: '',
    },
  };
}

export function createBlankItem() {
  return {
    kind: 'dish_card' as const,
    source_text: '',
    recipe_card_number: '',
    dish_card_id: null,
    dish_card_version_id: null,
    product_ingredient_id: null,
    product_name_snapshot: '',
    name: '',
    allergen_codes: [],
    portions: [
      createBlankPortion('6-11'),
      createBlankPortion('11-14'),
      createBlankPortion('14-18'),
    ],
    servings: [],
    notes: '',
  };
}

export function createBlankDay(weekday: z.infer<typeof weekdaySchema>) {
  return {
    weekday,
    date: '',
    items: [createBlankItem()],
    notes: '',
  };
}

export function createBlankWeeklyMenuFormValues(): WeeklyMenuFormValues {
  const startsOn = getNextMondayLocalIsoDate();

  return {
    title: '',
    meal_type: 'lunch',
    cycle_week: '',
    starts_on: startsOn,
    notes: '',
    days: DEFAULT_WEEKDAYS.map((weekday) => ({
      ...createBlankDay(weekday),
      date: addDaysToLocalIsoDate(startsOn, WEEKDAY_ORDER.indexOf(weekday)),
    })),
  };
}

export function weeklyMenuToFormValues(menu: WeeklyMenu): WeeklyMenuFormValues {
  return {
    title: menu.title,
    meal_type: menu.meal_type,
    cycle_week: menu.cycle_week?.toString() ?? '',
    starts_on: menu.starts_on ?? '',
    notes: menu.notes ?? '',
    days: [...menu.days]
      .sort(
        (left, right) => WEEKDAY_ORDER.indexOf(left.weekday) - WEEKDAY_ORDER.indexOf(right.weekday)
      )
      .map((day) => ({
        weekday: day.weekday,
        date: day.date ?? '',
        notes: day.notes ?? '',
        items: [...day.items]
          .sort((left, right) => left.position - right.position)
          .map((item) => ({
            id: item.id,
            kind: item.kind,
            source_text: item.source_text ?? '',
            recipe_card_number: item.recipe_card_number ?? '',
            dish_card_id: item.dish_card_id,
            dish_card_version_id: item.dish_card_version_id,
            product_ingredient_id: item.product_ingredient_id,
            product_name_snapshot: item.product_name_snapshot ?? '',
            name: item.name,
            allergen_codes: item.allergen_codes,
            portions: item.portions.map((portion) => ({
              age_group: portion.age_group,
              yield_amount: portion.yield_amount,
              dish_card_portion_variant_id: portion.dish_card_portion_variant_id,
              calculated_from: portion.calculated_from,
              nutrition: {
                kcal: portion.nutrition.kcal ?? '',
                proteins: portion.nutrition.proteins ?? '',
                fats: portion.nutrition.fats ?? '',
                carbs: portion.nutrition.carbs ?? '',
              },
            })),
            servings: item.servings,
            notes: item.notes ?? '',
          })),
      })),
  };
}

export function formValuesToWeeklyMenuPayload(values: WeeklyMenuFormValues): WeeklyMenuPayload {
  const effectiveStartDate = resolveEffectiveStartDate(values.starts_on);
  const orderedDays = [...values.days].sort(
    (left, right) => WEEKDAY_ORDER.indexOf(left.weekday) - WEEKDAY_ORDER.indexOf(right.weekday)
  );

  return {
    title: values.title.trim(),
    meal_type: values.meal_type,
    cycle_week: normalizeOptionalNumber(values.cycle_week),
    starts_on: effectiveStartDate,
    notes: normalizeOptionalText(values.notes),
    days: orderedDays.map((day) => ({
      weekday: day.weekday,
      date: resolveEffectiveDayDate(
        effectiveStartDate,
        WEEKDAY_ORDER.indexOf(day.weekday),
        day.date
      ),
      notes: normalizeOptionalText(day.notes),
      items: day.items.map((item, index) => ({
        id: item.id,
        position: index + 1,
        kind: item.kind,
        source_text: normalizeOptionalText(item.source_text),
        recipe_card_number: normalizeOptionalText(item.recipe_card_number),
        dish_card_id: item.dish_card_id,
        dish_card_version_id: item.dish_card_version_id,
        product_ingredient_id: item.product_ingredient_id,
        product_name_snapshot:
          item.kind === 'product'
            ? normalizeOptionalText(item.product_name_snapshot || item.name)
            : normalizeOptionalText(item.product_name_snapshot),
        name: item.name.trim(),
        allergen_codes: normalizeAllergenCodes(item.allergen_codes),
        portions: item.portions.map((portion) => ({
          age_group: portion.age_group,
          yield_amount: portion.yield_amount.trim(),
          dish_card_portion_variant_id: portion.dish_card_portion_variant_id,
          calculated_from: portion.calculated_from,
          nutrition: {
            kcal: normalizeOptionalText(portion.nutrition.kcal),
            proteins: normalizeOptionalText(portion.nutrition.proteins),
            fats: normalizeOptionalText(portion.nutrition.fats),
            carbs: normalizeOptionalText(portion.nutrition.carbs),
          },
        })),
        servings: item.servings,
        notes: normalizeOptionalText(item.notes),
      })),
    })),
  };
}

export function getRemainingWeekdays(days: WeeklyMenuFormValues['days']) {
  const usedWeekdays = new Set(days.map((day) => day.weekday));
  return WEEKDAY_ORDER.filter((weekday) => !usedWeekdays.has(weekday));
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  return normalized.length ? normalized : null;
}

function normalizeOptionalNumber(value: string) {
  const normalized = value.trim();
  return normalized ? Number(normalized) : null;
}

function normalizeAllergenCodes(value: string[]) {
  return [...new Set(value.map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

export function resolveEffectiveStartDate(value: string | null | undefined) {
  return normalizeOptionalText(value) ?? getNextMondayLocalIsoDate();
}

export function resolveEffectiveDayDate(
  startDate: string | null | undefined,
  dayIndex: number,
  manualDate: string | null | undefined
) {
  const candidate =
    normalizeOptionalText(manualDate) ??
    addDaysToLocalIsoDate(resolveEffectiveStartDate(startDate), dayIndex);
  return alignLocalIsoToDayIndex(candidate, dayIndex);
}

export function propagateMondayDate(
  days: WeeklyMenuFormValues['days'],
  mondayDate: string
): WeeklyMenuFormValues['days'] {
  const normalizedMondayDate = normalizeOptionalText(mondayDate);

  return days.map((day) => ({
    ...day,
    date: normalizedMondayDate
      ? addDaysToLocalIsoDate(normalizedMondayDate, WEEKDAY_ORDER.indexOf(day.weekday))
      : '',
  }));
}

export function updateDayDate(
  days: WeeklyMenuFormValues['days'],
  weekday: Weekday,
  date: string
): WeeklyMenuFormValues['days'] {
  if (weekday === 'monday') {
    return propagateMondayDate(days, date);
  }

  return days.map((day) => (day.weekday === weekday ? { ...day, date } : day));
}

export function getNextMondayLocalIsoDate() {
  const now = new Date();
  const daysUntilNextMonday = (8 - now.getDay()) % 7 || 7;
  now.setDate(now.getDate() + daysUntilNextMonday);

  return toLocalIsoDate(now);
}

function alignLocalIsoToDayIndex(value: string, dayIndex: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const expectedJsWeekday = (dayIndex + 1) % 7;
  const daysUntilExpectedWeekday = (expectedJsWeekday - date.getDay() + 7) % 7;
  return addDaysToLocalIsoDate(value, daysUntilExpectedWeekday);
}
