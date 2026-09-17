import { describe, expect, it } from 'vitest';

import { translateApiDetail } from './ApiMessages';

describe('translateApiDetail', () => {
  it('translates the school menu shape guard', () => {
    expect(translateApiDetail('School users cannot replace or reorder existing dish IDs')).toBe(
      'Школа не може підміняти ідентифікатори або змінювати порядок наявних страв.'
    );
  });

  it('translates unique positions error', () => {
    expect(translateApiDetail('Daily menu item positions must be unique')).toBe(
      'Позиції страв у меню дня мають бути унікальними.'
    );
  });

  it('translates a duplicate dish-card number', () => {
    expect(translateApiDetail('Dish card with this number already exists')).toBe(
      'Техкарта з таким номером уже існує.'
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
