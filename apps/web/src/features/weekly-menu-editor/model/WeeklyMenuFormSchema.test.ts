import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBlankWeeklyMenuFormValues,
  formValuesToWeeklyMenuPayload,
  weeklyMenuFormSchema,
} from "./WeeklyMenuFormSchema";

describe("weekly menu form schema", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects duplicate weekdays", () => {
    const values = createBlankWeeklyMenuFormValues();
    values.title = "Меню на тиждень";
    values.days = [values.days[0], { ...values.days[0] }];
    values.days[0].items[0].name = "Суп овочевий";
    values.days[0].items[0].portions.forEach((portion) => {
      portion.yield_amount = "250";
    });

    const result = weeklyMenuFormSchema.safeParse(values);

    expect(result.success).toBe(false);
  });

  it("normalizes payload fields for API submission", () => {
    const values = createBlankWeeklyMenuFormValues();
    values.title = " Меню на тиждень ";
    values.cycle_week = "3";
    values.notes = "  Загальна нотатка  ";
    values.days = values.days.slice(0, 1);
    values.days[0].date = "2026-07-06";
    values.days[0].items[0].name = " Гречка з овочами ";
    values.days[0].items[0].recipe_card_number = " 0012 ";
    values.days[0].items[0].allergen_codes = [" a1 ", "b2", "a1"];
    values.days[0].items[0].notes = "  Без цукру ";
    values.days[0].items[0].portions[0].yield_amount = "250";
    values.days[0].items[0].portions[0].nutrition.kcal = "120.5";
    values.days[0].items[0].portions[1].yield_amount = "300";
    values.days[0].items[0].portions[2].yield_amount = "350";

    const payload = formValuesToWeeklyMenuPayload(values);

    expect(payload.title).toBe("Меню на тиждень");
    expect(payload.cycle_week).toBe(3);
    expect(payload.notes).toBe("Загальна нотатка");
    expect(payload.days[0].items[0].position).toBe(1);
    expect(payload.days[0].items[0].name).toBe("Гречка з овочами");
    expect(payload.days[0].items[0].recipe_card_number).toBe("0012");
    expect(payload.days[0].items[0].allergen_codes).toEqual(["A1", "B2"]);
    expect(payload.days[0].items[0].notes).toBe("Без цукру");
    expect(payload.days[0].items[0].portions[0].nutrition.kcal).toBe("120.5");
  });

  it("uses device date when week start is omitted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T10:00:00+03:00"));

    const values = createBlankWeeklyMenuFormValues();
    values.title = "Меню на тиждень";
    values.days = values.days.slice(0, 2);
    values.days[0].items[0].name = "Перша страва";
    values.days[1].items[0].name = "Друга страва";
    values.days[0].items[0].portions.forEach((portion) => {
      portion.yield_amount = "100";
    });
    values.days[1].items[0].portions.forEach((portion) => {
      portion.yield_amount = "120";
    });

    const payload = formValuesToWeeklyMenuPayload(values);

    expect(payload.starts_on).toBe("2026-07-06");
    expect(payload.days[0].date).toBe("2026-07-06");
    expect(payload.days[1].date).toBe("2026-07-07");
  });
});
