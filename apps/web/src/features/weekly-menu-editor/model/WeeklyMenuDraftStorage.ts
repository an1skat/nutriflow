import { z } from 'zod';

import type { WeeklyMenuFormValues } from './WeeklyMenuFormSchema';

const WEEKLY_MENU_DRAFT_VERSION = 1;
const WEEKLY_MENU_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const WEEKLY_MENU_DRAFT_KEY_PREFIX = 'nutriflow:weekly-menu:draft:';

const weeklyMenuDraftValuesSchema = z.custom<WeeklyMenuFormValues>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { days?: unknown }).days),
  'Чернетка меню пошкоджена'
);

const weeklyMenuDraftSchema = z.object({
  version: z.literal(WEEKLY_MENU_DRAFT_VERSION),
  baseUpdatedAt: z.string().min(1),
  savedAt: z.string().min(1),
  expiresAt: z.string().min(1).optional(),
  values: weeklyMenuDraftValuesSchema,
});

export type WeeklyMenuDraft = z.infer<typeof weeklyMenuDraftSchema>;

export function loadWeeklyMenuDraft(menuId: string, baseUpdatedAt: string): WeeklyMenuDraft | null {
  if (typeof window === 'undefined') {
    return null;
  }

  clearExpiredWeeklyMenuDrafts();

  const rawValue = window.localStorage.getItem(getWeeklyMenuDraftKey(menuId));

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = weeklyMenuDraftSchema.parse(JSON.parse(rawValue));

    if (parsed.baseUpdatedAt !== baseUpdatedAt || isExpiredDraft(parsed)) {
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
  values: WeeklyMenuFormValues
) {
  if (typeof window === 'undefined') {
    return null;
  }

  clearExpiredWeeklyMenuDrafts();

  const savedAt = new Date().toISOString();
  const payload: WeeklyMenuDraft = {
    version: WEEKLY_MENU_DRAFT_VERSION,
    baseUpdatedAt,
    savedAt,
    expiresAt: new Date(Date.now() + WEEKLY_MENU_DRAFT_TTL_MS).toISOString(),
    values,
  };

  window.localStorage.setItem(getWeeklyMenuDraftKey(menuId), JSON.stringify(payload));

  return savedAt;
}

export function clearWeeklyMenuDraft(menuId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(getWeeklyMenuDraftKey(menuId));
}

function getWeeklyMenuDraftKey(menuId: string) {
  return `${WEEKLY_MENU_DRAFT_KEY_PREFIX}${menuId}`;
}

function clearExpiredWeeklyMenuDrafts() {
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(WEEKLY_MENU_DRAFT_KEY_PREFIX)) {
      continue;
    }

    try {
      const rawValue = window.localStorage.getItem(key);
      const parsed = weeklyMenuDraftSchema.parse(rawValue ? JSON.parse(rawValue) : null);
      if (isExpiredDraft(parsed)) {
        window.localStorage.removeItem(key);
      }
    } catch {
      window.localStorage.removeItem(key);
    }
  }
}

function isExpiredDraft(draft: WeeklyMenuDraft) {
  const expiresAt = draft.expiresAt
    ? Date.parse(draft.expiresAt)
    : Date.parse(draft.savedAt) + WEEKLY_MENU_DRAFT_TTL_MS;

  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}
