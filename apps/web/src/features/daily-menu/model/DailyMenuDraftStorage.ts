import { z } from "zod";

import type { SchoolGroup } from "@/entities/school-group/model/SchoolGroup";
import {
  dailyMenuSchema,
  type DailyMenu,
  type DailyMenuItem,
} from "@/entities/weekly-menu/model/WeeklyMenu";

const DAILY_MENU_DRAFT_VERSION = 1;

const dailyMenuDraftSchema = z.object({
  version: z.literal(DAILY_MENU_DRAFT_VERSION),
  baseUpdatedAt: z.string().min(1),
  savedAt: z.string().min(1),
  days: z.array(dailyMenuSchema).min(1),
});

export type DailyMenuDraft = z.infer<typeof dailyMenuDraftSchema>;

export function prepareDailyMenuDays(
  sourceDays: DailyMenu[],
  groups: SchoolGroup[],
): DailyMenu[] {
  const activeGroups = groups.filter((group) => group.is_active);

  return sourceDays.map((day) => ({
    ...day,
    items: day.items.map((item) => ({
      ...item,
      portions: item.portions.map((portion) => ({
        ...portion,
        nutrition: { ...portion.nutrition },
      })),
      allergen_codes: [...item.allergen_codes],
      servings: activeGroups.map((group) => ({
        school_group_id: group.id,
        age_group: group.age_group,
        children_count:
          item.servings.find((serving) => serving.school_group_id === group.id)
            ?.children_count ?? 0,
      })),
    })),
  }));
}

export function replaceDailyMenuDish(
  currentItem: DailyMenuItem,
  selectedDish: DailyMenuItem,
  groups: SchoolGroup[],
): DailyMenuItem {
  const [preparedDay] = prepareDailyMenuDays(
    [
      {
        weekday: "monday",
        date: null,
        notes: null,
        closed_at: null,
        closed_by: null,
        close_reason: null,
        items: [selectedDish],
      },
    ],
    groups,
  );

  return {
    ...preparedDay.items[0],
    id: currentItem.id,
    position: currentItem.position,
  };
}

export function loadDailyMenuDraft(
  menuId: string,
  baseUpdatedAt: string,
): DailyMenuDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(getDailyMenuDraftKey(menuId));

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = dailyMenuDraftSchema.parse(JSON.parse(rawValue));

    if (parsed.baseUpdatedAt !== baseUpdatedAt) {
      window.localStorage.removeItem(getDailyMenuDraftKey(menuId));
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(getDailyMenuDraftKey(menuId));
    return null;
  }
}

export function saveDailyMenuDraft(
  menuId: string,
  baseUpdatedAt: string,
  days: DailyMenu[],
): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const savedAt = new Date().toISOString();
  const payload: DailyMenuDraft = {
    version: DAILY_MENU_DRAFT_VERSION,
    baseUpdatedAt,
    savedAt,
    days,
  };

  window.localStorage.setItem(
    getDailyMenuDraftKey(menuId),
    JSON.stringify(payload),
  );

  return savedAt;
}

export function clearDailyMenuDraft(menuId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getDailyMenuDraftKey(menuId));
}

function getDailyMenuDraftKey(menuId: string): string {
  return `nutriflow:daily-menu:draft:${menuId}`;
}
