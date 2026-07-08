import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";

const apiBasePath = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
const csrfCookieName =
  process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? "nutriflow_csrf";
const SESSION_EXPIRED_EVENT = "nutriflow:session-expired";
const REFRESH_LOCK_NAME = "nutriflow:refresh";

const axiosOptions = {
  baseURL: apiBasePath,
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
};

export const apiClient = axios.create(axiosOptions);
const rawApiClient = axios.create(axiosOptions);

type RetryableRequest = InternalAxiosRequestConfig & {
  _authRetry?: boolean;
};

class MissingCsrfTokenError extends Error {}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${name}=`;
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

export function getCsrfHeaders(): Record<string, string> {
  const token = readCookie(csrfCookieName);
  return token ? { "X-CSRF-Token": token } : {};
}

export function isHttpStatus(error: unknown, status: number): boolean {
  return axios.isAxiosError(error) && error.response?.status === status;
}

function notifySessionExpired(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
}

export function subscribeToSessionExpired(
  listener: () => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener(SESSION_EXPIRED_EVENT, listener);

  return () => {
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  };
}

function isNonRefreshableAuthEndpoint(url: string | undefined): boolean {
  const path = (url ?? "").split("?")[0];

  return ["/auth/login", "/auth/refresh", "/auth/logout"].some((endpoint) =>
    path.endsWith(endpoint),
  );
}

async function accessCookieIsUsable(): Promise<boolean> {
  try {
    await rawApiClient.get("/auth/me");
    return true;
  } catch (error) {
    if (isHttpStatus(error, 401)) {
      return false;
    }

    throw error;
  }
}

async function performRefresh(): Promise<void> {
  if (!readCookie(csrfCookieName)) {
    throw new MissingCsrfTokenError();
  }

  if (await accessCookieIsUsable()) {
    return;
  }

  const token = readCookie(csrfCookieName);

  if (!token) {
    throw new MissingCsrfTokenError();
  }

  try {
    await rawApiClient.post("/auth/refresh", undefined, {
      headers: {
        "X-CSRF-Token": token,
      },
    });
  } catch (error) {
    if (
      (isHttpStatus(error, 401) || isHttpStatus(error, 403)) &&
      (await accessCookieIsUsable())
    ) {
      return;
    }

    throw error;
  }
}

async function withRefreshLock(task: () => Promise<void>): Promise<void> {
  if (typeof navigator === "undefined" || !("locks" in navigator)) {
    await task();
    return;
  }

  await navigator.locks.request(REFRESH_LOCK_NAME, async () => {
    await task();
  });
}

let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = withRefreshLock(performRefresh).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

function isExpectedRefreshFailure(error: unknown): boolean {
  return (
    error instanceof MissingCsrfTokenError ||
    isHttpStatus(error, 401) ||
    isHttpStatus(error, 403)
  );
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetryableRequest | undefined;

    if (
      error.response?.status !== 401 ||
      !request ||
      isNonRefreshableAuthEndpoint(request.url)
    ) {
      throw error;
    }

    if (request._authRetry) {
      notifySessionExpired();
      throw error;
    }

    request._authRetry = true;

    try {
      await refreshSession();
    } catch (refreshError) {
      if (isExpectedRefreshFailure(refreshError)) {
        notifySessionExpired();
        throw error;
      }

      throw refreshError;
    }

    return apiClient.request(request);
  },
);

const detailTranslations: Record<string, string> = {
  "Invalid credentials": "Неправильний логін або пароль.",
  "Invalid refresh token": "Сесію завершено. Увійдіть знову.",
  "Invalid or expired access token": "Термін дії сесії минув. Увійдіть знову.",
  "CSRF validation failed":
    "Не вдалося підтвердити безпечність запиту. Оновіть сторінку.",
  "Insufficient permissions": "Недостатньо прав для виконання операції.",
  "School access denied": "Немає доступу до даних цієї школи.",
  "A school with this code already exists":
    "Школа з таким кодом уже існує.",
  "School not found": "Школу не знайдено.",
  "Admin password confirmation required":
    "Потрібно підтвердити пароль адміністратора.",
  "Invalid admin password": "Неправильний пароль адміністратора.",
  "Cannot create users for an inactive school":
    "Не можна створювати користувачів для неактивної школи.",
  "A user with this username or email already exists":
    "Користувач із таким логіном або email уже існує.",
  "School user not found": "Користувача школи не знайдено.",
  "School group not found": "Групу школи не знайдено.",
  "Weekly menu not found": "Тижневе меню не знайдено.",
  "Menu access denied": "Немає доступу до цього меню.",
  "Weekly menu end date cannot be before start date":
    "Дата завершення меню не може бути раніше дати початку.",
  "School users cannot change the number of dishes in a day":
    "Користувач школи не може змінювати кількість страв у межах дня.",
  "Only template weekly menus can be published":
    "Розсилати можна лише збережені тижневі меню.",
  "Only archived weekly menus can be deleted":
    "Повністю видалити можна лише меню з архіву.",
  "Only template weekly menus can be archived":
    "Архівувати можна лише шаблони тижневих меню.",
  "Only school menu copies can be revoked":
    "Відкликати можна лише меню, розіслане школі.",
  "Only schools can archive their own menus locally":
    "Локально архівувати меню може лише школа.",
  "Only schools can restore their own archived menus":
    "Повернути меню з архіву може лише школа.",
  "School archived weekly menus cannot be hard-deleted":
    "Меню школи не можна видалити остаточно.",
  "Weekly menu is revoked": "Це меню відкликано адміністратором.",
  "School is inactive": "Школа неактивна.",
  "Dish card not found": "Техкарту не знайдено.",
  "Dish card version does not belong to menu item dish card":
    "Версія техкарти не відповідає вибраній техкарті.",
  "Product ingredient not found": "Інгредієнт продукту не знайдено.",
  "File name is required": "Не вдалося визначити назву файлу.",
  "Only .xlsx files are supported": "Підтримуються лише файли формату .xlsx.",
  "Workbook is empty": "Excel-файл порожній.",
  "File is not a valid .xlsx workbook": "Файл не є коректною книгою .xlsx.",
  "Could not read the .xlsx workbook": "Не вдалося прочитати Excel-файл.",
  "Workbook does not contain menu worksheets":
    "У файлі не знайдено аркушів із меню.",
  "Workbook does not contain importable menu sheets":
    "У файлі не знайдено меню, які можна імпортувати.",
  "Import preview not found": "Попередній перегляд імпорту не знайдено.",
  "Import preview has expired; upload the workbook again":
    "Термін дії попереднього перегляду минув. Завантажте файл ще раз.",
  "Import preview was already committed": "Цей файл уже було імпортовано.",
  "Import preview is already being committed":
    "Імпорт цього файлу вже виконується.",
  "Import preview is already being committed or was committed":
    "Імпорт цього файлу вже виконується або був завершений.",
  "Import preview contains errors and cannot be committed":
    "У файлі є критичні помилки, тому його не можна імпортувати.",
};

export function getApiErrorMessage(
  error: unknown,
  fallback = "Не вдалося виконати запит.",
): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback;
  }

  if (!error.response) {
    return "API недоступний. Перевірте з’єднання та повторіть спробу.";
  }

  const data = error.response.data as
    | {
        detail?: string | Array<{ msg?: string }>;
      }
    | undefined;

  if (typeof data?.detail === "string") {
    return detailTranslations[data.detail] ?? data.detail;
  }

  if (Array.isArray(data?.detail)) {
    const message = data.detail.find(
      (issue) => typeof issue.msg === "string",
    )?.msg;

    if (message) {
      return message;
    }
  }

  if (error.response.status === 403) {
    return "Операцію заборонено.";
  }

  if (error.response.status >= 500) {
    return "Помилка сервера. Повторіть спробу пізніше.";
  }

  return fallback;
}
