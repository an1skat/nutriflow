export const detailTranslations: Record<string, string> = {
  'Invalid credentials': 'Неправильний логін або пароль.',
  'Invalid refresh token': 'Сесію завершено. Увійдіть знову.',
  'Invalid or expired access token': 'Термін дії сесії минув. Увійдіть знову.',
  'CSRF validation failed': 'Не вдалося підтвердити безпечність запиту. Оновіть сторінку.',
  'Insufficient permissions': 'Недостатньо прав для виконання операції.',
  'School access denied': 'Немає доступу до даних цієї школи.',
  'School not found': 'Школу не знайдено.',
  'Admin password confirmation required': 'Потрібно підтвердити пароль адміністратора.',
  'Invalid admin password': 'Неправильний пароль адміністратора.',
  'Cannot create users for an inactive school':
    'Не можна створювати користувачів для неактивної школи.',
  'A user with this username or email already exists':
    'Користувач із таким логіном або email уже існує.',
  'School user not found': 'Користувача школи не знайдено.',
  'School group not found': 'Групу школи не знайдено.',
  'Weekly menu not found': 'Тижневе меню не знайдено.',
  'Weekly menu was changed by another user':
    'Меню вже змінив інший користувач. Оновіть меню та перенесіть свої зміни.',
  'Menu access denied': 'Немає доступу до цього меню.',
  'Weekly menu end date cannot be before start date':
    'Дата завершення меню не може бути раніше дати початку.',
  'School users cannot change the number of dishes in a day':
    'Користувач школи не може змінювати кількість страв у межах дня.',
  'Only template weekly menus can be published': 'Розсилати можна лише збережені тижневі меню.',
  'Only archived weekly menus can be deleted': 'Повністю видалити можна лише меню з архіву.',
  'Only template weekly menus can be archived': 'Архівувати можна лише шаблони тижневих меню.',
  'Only school menu copies can be revoked': 'Відкликати можна лише меню, розіслане школі.',
  'Only schools can archive their own menus locally': 'Локально архівувати меню може лише школа.',
  'Only schools can restore their own archived menus': 'Повернути меню з архіву може лише школа.',
  'School archived weekly menus cannot be hard-deleted': 'Меню школи не можна видалити остаточно.',
  'Weekly menu is revoked': 'Це меню відкликано адміністратором.',
  'School is inactive': 'Школа неактивна.',
  'Dish card not found': 'Техкарту не знайдено.',
  'Dish card version does not belong to menu item dish card':
    'Версія техкарти не відповідає вибраній техкарті.',
  'Product ingredient not found': 'Інгредієнт продукту не знайдено.',
  'Menu requirement not found': 'Меню-вимогу не знайдено.',
  'Daily menu not found': 'Денне меню не знайдено.',
  'Only school users can access menu requirements': 'Меню-вимоги доступні лише користувачам школи.',
  'Menu requirements can only be generated from a published menu':
    'Меню-вимогу можна сформувати лише з опублікованого меню.',
  'At least one dish must have a children count greater than zero':
    'Вкажіть кількість дітей більше нуля хоча б для однієї страви.',
  'Daily menu date is required to generate a menu requirement':
    'Для формування меню-вимоги потрібно вказати дату дня.',
  'Dev-only endpoint is disabled': 'Ця тестова дія доступна тільки в dev-середовищі.',
  'Norm compliance requires menu requirements for all five weekdays':
    'Щоб сформувати дотримання норм, спочатку сформуйте меню-вимоги за всі 5 робочих днів тижня.',
  'Weekly menu requirement report requires complete menu requirements for all five weekdays':
    'Щоб сформувати тижневу меню-вимогу, спочатку сформуйте або оновіть меню-вимоги за всі 5 робочих днів.',
  'Monthly menu requirement report requires complete menu requirements for every participating day':
    'Щоб сформувати місячну меню-вимогу, спочатку сформуйте або оновіть меню-вимоги за всі дні, що беруть участь у цьому місяці.',
  'School is inactive or missing': 'Школа неактивна або її не знайдено.',
  'School group age group does not match': 'Вікова категорія групи не відповідає даним меню.',
  'File name is required': 'Не вдалося визначити назву файлу.',
  'Only .xlsx files are supported': 'Підтримуються лише файли формату .xlsx.',
  'Workbook is empty': 'Excel-файл порожній.',
  'File is not a valid .xlsx workbook': 'Файл не є коректною книгою .xlsx.',
  'Could not read the .xlsx workbook': 'Не вдалося прочитати Excel-файл.',
  'Workbook does not contain menu worksheets': 'У файлі не знайдено аркушів із меню.',
  'Workbook does not contain importable menu sheets':
    'У файлі не знайдено меню, які можна імпортувати.',
  'Import preview not found': 'Попередній перегляд імпорту не знайдено.',
  'Import preview has expired; upload the workbook again':
    'Термін дії попереднього перегляду минув. Завантажте файл ще раз.',
  'Import preview was already committed': 'Цей файл уже було імпортовано.',
  'Import preview is already being committed': 'Імпорт цього файлу вже виконується.',
  'Import preview is already being committed or was committed':
    'Імпорт цього файлу вже виконується або був завершений.',
  'Import preview contains errors and cannot be committed':
    'У файлі є критичні помилки, тому його не можна імпортувати.',
};
