import { z } from "zod";

import {
  weeklyMenuFormSchema,
  type WeeklyMenuFormValues,
} from "./WeeklyMenuFormSchema";

const WEEKLY_MENU_DRAFT_VERSION = 1;

const weeklyMenuDraftSchema = z.object({
  version: z.literal(WEEKLY_MENU_DRAFT_VERSION),
  baseUpdatedAt: z.string().min(1),
  savedAt: z.string().min(1),
  values: weeklyMenuFormSchema,
});

export type WeeklyMenuDraft = z.infer<typeof weeklyMenuDraftSchema>;

export function loadWeeklyMenuDraft(
  menuId: string,
  baseUpdatedAt: string,
): WeeklyMenuDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(getWeeklyMenuDraftKey(menuId));

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = weeklyMenuDraftSchema.parse(JSON.parse(rawValue));

    if (parsed.baseUpdatedAt !== baseUpdatedAt) {
      clearWeeklyMenuDraft(menuId);
      return null;
    }

    return parsed;
  } catch {
    clearWeeklyMenuDraft(menuId);
    return null;
  }
}

export function saveWeeklyMenuDraft(
  menuId: string,
  baseUpdatedAt: string,
  values: WeeklyMenuFormValues,
) {
  if (typeof window === "undefined") {
    return null;
  }

  const savedAt = new Date().toISOString();
  const payload: WeeklyMenuDraft = {
    version: WEEKLY_MENU_DRAFT_VERSION,
    baseUpdatedAt,
    savedAt,
    values,
  };

  window.localStorage.setItem(
    getWeeklyMenuDraftKey(menuId),
    JSON.stringify(payload),
  );

  return savedAt;
}

export function clearWeeklyMenuDraft(menuId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getWeeklyMenuDraftKey(menuId));
}

function getWeeklyMenuDraftKey(menuId: string) {
  return `nutriflow:weekly-menu:draft:${menuId}`;
}
