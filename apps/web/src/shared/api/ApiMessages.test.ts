import { describe, expect, it } from 'vitest';

import { translateApiDetail } from './ApiMessages';

describe('translateApiDetail', () => {
  it('translates the school menu shape guard', () => {
    expect(
      translateApiDetail('School users cannot remove, replace, or reorder existing dishes')
    ).toBe('Користувач школи не може видаляти, замінювати або переставляти наявні позиції.');
  });

  it('translates unique positions error', () => {
    expect(translateApiDetail('Daily menu item positions must be unique')).toBe(
      'Позиції страв у меню дня мають бути унікальними.'
    );
  });

  it('translates exact missing and stale dates for a custom report range', () => {
    expect(
      translateApiDetail(
        'Menu requirement report cannot be generated; missing dates: 2026-07-07, 2026-07-08; stale dates: 2026-07-09'
      )
    ).toBe(
      'Неможливо сформувати меню-вимогу за вибраний період. Немає меню-вимоги за дати: 2026-07-07, 2026-07-08. Потрібно оновити меню-вимогу за дати: 2026-07-09.'
    );
  });

  it('keeps unknown API details unchanged', () => {
    expect(translateApiDetail('Unknown API detail')).toBe('Unknown API detail');
  });
});
