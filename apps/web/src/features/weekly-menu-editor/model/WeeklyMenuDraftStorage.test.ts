import { beforeEach, describe, expect, it } from 'vitest';

import { createBlankWeeklyMenuFormValues } from './WeeklyMenuFormSchema';
import { loadWeeklyMenuDraft, saveWeeklyMenuDraft } from './WeeklyMenuDraftStorage';

describe('weekly menu draft storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('restores an incomplete editable menu draft', () => {
    const values = createBlankWeeklyMenuFormValues();
    values.title = 'Чернетка';
    values.days[0].items[0].name = '';
    values.days[0].items[0].portions[0].yield_amount = '';

    saveWeeklyMenuDraft('menu-1', 'base-1', values);

    const draft = loadWeeklyMenuDraft('menu-1', 'base-1');
    expect(draft?.values.days[0].items[0].name).toBe('');
    expect(draft?.values.days[0].items[0].portions[0].yield_amount).toBe('');
  });

  it('drops expired weekly menu drafts', () => {
    const values = createBlankWeeklyMenuFormValues();
    window.localStorage.setItem(
      'nutriflow:weekly-menu:draft:menu-1',
      JSON.stringify({
        version: 1,
        baseUpdatedAt: 'base-1',
        savedAt: '2026-07-20T10:00:00.000Z',
        expiresAt: '2026-07-20T11:00:00.000Z',
        values,
      })
    );

    expect(loadWeeklyMenuDraft('menu-1', 'base-1')).toBeNull();
    expect(window.localStorage.getItem('nutriflow:weekly-menu:draft:menu-1')).toBeNull();
  });
});
