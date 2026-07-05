# NutriFlow

CRM-система для організації шкільного харчування. Монорепозиторій: бекенд у `apps/api`, фронтенд у `apps/web`. Інтерфейс українською.

## Суть проєкту (доменна логіка)

- **Єдиний акаунт адміністратора.** Адмін заходить у систему, заповнює меню на тиждень (страви, алергени, грамовки тощо), зберігає або розсилає його — тоді меню зберігається на сервері й підтягується акаунтами шкіл.
- **Окремий акаунт кожної школи.** Школа логіниться логіном/паролем і потрапляє на першу вкладку — **тижневе меню**, де може редагувати майже все, крім кількості страв. Страви мають бути «валідними» (прив'язуються до карток страв, але не надто суворо).
- **Денне меню.** Біля кожної страви вказується, скільки дітей у кожній групі з'їло конкретну страву.
- **Меню-вимога.** За кількістю дітей, що поїли, і техкартами рахується грамовка кожного інгредієнта кожної страви — окрема велика таблиця.
- **Таблиця порівнянь.** Грамовки меню-вимоги порівнюються з нормами; невідповідності підсвічуються.
- **Закриття дня.** День закривається, адміну на пошту приходить сповіщення, що день закрито.

Це базовий функціонал MVP. Наразі реалізовано лише аутентифікацію та адміністративний CRUD шкіл і їхніх користувачів.

## Стек

### Бекенд (`apps/api`)
- Python 3.12, менеджер пакетів **uv** (`uv.lock`).
- **FastAPI** (>= 0.139), entrypoint `app.main:app` (`[tool.fastapi]`).
- **Beanie** 2.1 — ODM над MongoDB; **pymongo** 4.17 (async).
- **MongoDB** 7 (локально через `docker-compose.yml`).
- **PyJWT** (HS256 access-токени), **argon2-cffi** (хешування паролів).
- **pydantic-settings** — конфіг з `.env`.
- **openpyxl** — парсинг `.xlsx` (імпорт карток страв).
- Лінтер **ruff** (`line-length = 100`, правила `E, F, I, UP, B`, target `py312`).
- Тести **pytest** + **pytest-asyncio** (`asyncio_mode = "auto"`) + **httpx2** (TestClient).

### Фронтенд (`apps/web`)
- Менеджер пакетів/рантайм **bun** (`bun.lock`), workspace у кореневому `package.json`.
- **Next.js** 16.2.10 (App Router), **React** 19.2.4, **TypeScript** 5 (strict), аліас `@/*` → `src/*`.
- **TanStack Query** 5 (серверний стан, ключі запитів, інвалідація).
- **react-hook-form** 7 + **@hookform/resolvers** + **zod** 4 (форми й валідація).
- **Tailwind CSS** 4 (`@tailwindcss/postcss`), дизайн-система в `src/app/globals.css` через класи `nf-*`.
- **axios** (HTTP-клієнт), **sonner** (тости), **lucide-react** (іконки), **clsx** + **tailwind-merge**, **zustand** 5.
- Тести **Vitest** 4 + **Testing Library** + **jsdom**.
- Лінтер **ESLint** 9 (`eslint-config-next`).

## Структура монорепозиторію

```
nutriflow/
├─ apps/
│  ├─ api/      # FastAPI бекенд
│  └─ web/      # Next.js фронтенд
├─ docs/        # порожньо (зарезервовано)
├─ infra/       # порожньо (зарезервовано)
├─ package.json # workspace: apps/web, packages/*
└─ bun.lock
```

У кореневому `package.json` оголошено workspaces `apps/web` і `packages/*`, але `packages/` ще не створено.

## Бекенд — структура (`apps/api/app`)

Модульна архітектура: `app/modules/<domain>/` містить `router.py`, `service.py`, `schemas.py`, іноді `security.py` / `dependencies.py`.

```
app/
├─ main.py                 # create_app(), lifespan (connect mongo → init beanie → yield → close)
├─ core/config.py          # Settings (pydantic-settings), get_settings() з lru_cache
├─ db/
│  ├─ mongo.py             # async MongoClient, connect/close/get_database
│  └─ beanie.py            # init_beanie, реєстр Document-моделей
├─ api/
│  ├─ router.py            # api_router, монтаж модульних роутерів
│  └─ deps.py              # загальні залежності (get_app_settings)
├─ modules/
│  ├─ identity/models.py   # Beanie-документи: School, User, RefreshSession (індекси тут)
│  ├─ auth/                # login/refresh/logout/me, JWT, CSRF, ролі, tenant boundary
│  ├─ admin/               # CRUD шкіл і користувачів шкіл (лише ADMIN)
│  ├─ imports/             # імпорт карток страв (XLSX), поки preview-заглушка
│  └─ health/              # health-check
└─ scripts/create_admin.py # CLI створення першого адміна
```

### Документи БД (`modules/identity/models.py`)
- `School`: `name`, `code` (нормалізується у верхній регістр, unique-індекс), `is_active`, `created_at`, `updated_at`.
- `User`: `username` (unique, патерн `^[a-z0-9][a-z0-9._-]*$`, нормалізується lower), `email` (partial unique), `password_hash`, `role` (`ADMIN` | `SCHOOL_USER`), `school_id`, `is_active`, `auth_version`. Валідатори: адмін не має `school_id` й обов'язково має email; school-юзер обов'язково має `school_id`.
- `RefreshSession`: `user_id`, `family_id`, `token_hash` (unique), `expires_at` (TTL-індекс), `revoked_at`, `revoke_reason`, `replaced_by_session_id`.

### Аутентифікація та безпека
- Access-токен — JWT (HS256) у **httpOnly** cookie (`nutriflow_access`, path = API-префікс).
- Refresh-токен — opaque, зберігається хешованим, **ротація** з виявленням повторного використання по `family_id` (при reuse — компрометація всієї сім'ї). httpOnly cookie (`nutriflow_refresh`, path = `/api/v1/auth`).
- **CSRF** — double-submit: cookie `nutriflow_csrf` + заголовок `X-CSRF-Token`, перевірка через `csrf_tokens_match`.
- Залежності: `CurrentUser`, `CsrfProtection`, `require_roles(*roles)`, `require_school_access(school_id)`.
- Деактивація школи/юзера або скидання пароля інкрементують `auth_version` і відкликають активні refresh-сесії.

### API-контракти
- Префікс `/api/v1`. Документація: `/docs`, `/redoc`, OpenAPI — `/api/v1/openapi.json`.
- Помилки повертаються як FastAPI `HTTPException` з `detail` (рядок). Коди: 401 (auth), 403 (CSRF/недостатньо прав/ school access), 404, 409 (конфлікти унікальності).
- Схеми запитів/відповідей — Pydantic v2 у `schemas.py` з `field_validator`/`model_validator` для нормалізації та перевірок (напр. `UpdateSchoolRequest.validate_patch` вимагає хоча б одне поле).

### Тести бекенду
- `tests/conftest.py` сіє адміна, дві школи, school-юзерів; використовує БД `nutriflow_test`, очищає колекції перед/після кожного тесту; `pytest_configure` задає тестові секрети через env.
- Тести: `test_auth.py`, `test_rbac.py`, `test_admin.py`, `test_admin_crud.py`, `test_health.py`.
- Потрібен локальний MongoDB (тести ходять у реальну тестову БД, не in-memory).

## Фронтенд — структура (`apps/web/src`)

Feature-Sliced Design: `app / features / entities / widgets / shared`.

```
src/
├─ app/
│  ├─ layout.tsx, AppProviders.tsx, globals.css
│  ├─ login/page.tsx
│  └─ (protected)/
│     ├─ layout.tsx          # AccessGuard + AppShell
│     ├─ page.tsx            # огляд акаунта
│     └─ admin/
│        ├─ layout.tsx       # AccessGuard allowedRoles=["ADMIN"]
│        ├─ page.tsx         # redirect → /admin/schools
│        └─ schools/         # список, [schoolId]/, [schoolId]/users/[userId]/
├─ features/
│  ├─ access/                # AccessGuard + AccessPolicy (рoute/tenant-рішення)
│  ├─ auth/                  # LoginForm, UseSession (login/logout)
│  ├─ school-management/     # форми школи (create/edit/delete), схеми, мутації
│  └─ school-user-management/# форми юзерів школи
├─ entities/
│  ├─ school/                # model (zod-схема), api, queries
│  ├─ school-user/           # model, api, queries
│  └─ session/               # model (AuthUser, loginSchema), api, queries
├─ widgets/
│  ├─ app-shell/             # бокова навігація, логаут
│  ├─ schools-overview/      # сторінка шкіл
│  └─ school-details/, school-user-details/
└─ shared/
   ├─ api/HttpClient.ts, Pagination.ts
   ├─ ui/RequestError.tsx, StatusBadge.tsx, PaginationControls.tsx
   └─ lib/FormatDate.ts, SafeReturnPath.ts
```

### Конвенції фронтенду
- Серверний стан — TanStack Query. Ключі запитів — у `entities/*/api/*Queries.ts` (напр. `["protected","admin","schools",...]`). Мутації інвалідують/оновлюють відповідні ключі.
- HTTP — єдиний `apiClient` (axios) у `shared/api/HttpClient.ts`:
  - `baseURL = NEXT_PUBLIC_API_BASE_URL` (за замовч. `/api/v1`), `withCredentials: true`.
  - Для мутацій/запитів, що змінюють стан, додаються CSRF-заголовки через `getCsrfHeaders()` (читає cookie `nutriflow_csrf`).
  - Інтерсептор відповідей: на 401 (не на login/refresh/logout) один раз робить refresh через `navigator.locks`, потім ретраїть запит; при невдачі — диспатчить подію `nutriflow:session-expired` → `AppProviders` скидає користувача.
  - `getApiErrorMessage(error)` — нормалізує помилки API; `detailTranslations` перекладає відомі `detail` з бекенду українською.
- Форми — react-hook-form + zod (`zodResolver`), серверні помилки потрапляють у `form.formState.errors.root` через `form.setError("root", ...)`.
- Доступ — `AccessGuard` (завжди) + `AccessPolicy` (`canAccessPath`, `getRouteAccess`, `canAccessSchool`). Роути `/admin/*` — лише `ADMIN`; school-юзер має доступ лише до своєї школи (`school_id`). При відсутності сесії — редирект на `/login?next=...`.
- UI-дизайн-система — класи `nf-*` у `globals.css` (`nf-panel`, `nf-input`, `nf-button`, `nf-table`, `nf-error`, `nf-field-error`, `nf-label` тощо), зелена палітра через CSS-змінні `--nf-*`. Tailwind використовується поряд для утилітарних класів.
- Тости — `sonner` (`Toaster` у `AppProviders`).

### Тести фронтенду
- Vitest (`vitest.config.mts`, jsdom, `restoreMocks: true`, setup `src/test/setup.ts`).
- Покриття: `AccessPolicy.test.ts`, `SchoolFormSchema.test.ts`, `SchoolUserFormSchemas.test.ts`, `School.test.ts`, `SafeReturnPath.test.ts`.

## Зв'язок фронт ↔ бек
- Next.js проксує `/api/v1/*` → `${API_ORIGIN}/api/v1/*` через `rewrites()` у `next.config.ts` (default `http://127.0.0.1:8000`). У проді змінюється `NEXT_PUBLIC_API_BASE_URL` / проксі.
- CORS на бекенді дозволяє `http://localhost:3000` та `http://127.0.0.1:3000` (`backend_cors_origins`).

## Запуск

### Бекенд
```bash
cd apps/api
cp .env.example .env            # заповнити JWT_SECRET_KEY та REFRESH_TOKEN_PEPPER (мін. 32 символи)
docker compose up -d mongo      # MongoDB 7 на :27017
uv sync                         # встановити залежності
uv run fastapi dev              # дев-сервер (або: uv run uvicorn app.main:app --reload)
uv run python -m app.scripts.create_admin --username <user> --email <email>   # перший адмін (пароль уводиться приховано, мін. 12 символів)

я особисто запускаю командою ./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 знаходячись в apps/api, тому якщо не виходить попередніми командами то закривай всі порти і роби ось так
```

### Фронтенд
```bash
cd apps/web
cp .env.example .env            # API_ORIGIN=http://127.0.0.1:8000
bun install
bun run dev                     # http://localhost:3000
```

З кореня монорепо:
```bash
bun run dev:web     # = bun --cwd apps/web run dev
bun run lint:web    # eslint
bun run build:web   # next build
```

## Перевірки якості

### Бекенд
```bash
cd apps/api
uv run ruff check          # лінт
uv run pytest              # тести (потрібен локальний MongoDB)
```

### Фронтенд
```bash
cd apps/web
bun run lint               # eslint
bun run typecheck          # tsc --noEmit
bun run test               # vitest run
bun run test:watch         # vitest
```

## Змінні середовища

### `apps/api/.env` (див. `.env.example`)
- `MONGO_URI`, `MONGO_DB` (за замовч. `mongodb://localhost:27017`, `nutriflow_dev`; compose-варіант з auth: `mongodb://nutriflow:nutriflow_dev_password@localhost:27017/?authSource=admin`).
- `JWT_SECRET_KEY` (мін. 32), `JWT_ALGORITHM=HS256`, `JWT_ISSUER`, `JWT_AUDIENCE`, `ACCESS_TOKEN_TTL_MINUTES` (5–60).
- `REFRESH_TOKEN_PEPPER` (мін. 32), `REFRESH_TOKEN_TTL_DAYS` (1–90), `REFRESH_REUSE_GRACE_SECONDS`.
- `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE` (`lax`/`strict`), `ACCESS_COOKIE_NAME`, `REFRESH_COOKIE_NAME`, `CSRF_COOKIE_NAME`.
- `API_V1_PREFIX`, `BACKEND_CORS_ORIGINS` (JSON-масив), `ENVIRONMENT`, `DEBUG`.

### `apps/web/.env` (див. `.env.example`)
- `API_ORIGIN` (для Next.js rewrites, default `http://127.0.0.1:8000`).
- `NEXT_PUBLIC_API_BASE_URL` (default `/api/v1`).
- `NEXT_PUBLIC_CSRF_COOKIE_NAME` (default `nutriflow_csrf`).

## Git-конвенції
Коміти у стилі `feat(api): ...`, `feat(web): ...` (приклади в `git log`).

## Примітки
- `apps/web/AGENTS.md` містить автоматичне попередження Next.js: ця версія Next.js може мати breaking changes — перед написанням коду варто звірятися з `node_modules/next/dist/docs/`. `apps/web/CLAUDE.md` посилається на нього через `@AGENTS.md`.
- `docs/` та `infra/` порожні, зарезервовані.
Докер не працює. Не намагайся використовувати його
Самому файли не змінювати, тільки з мого прямого дозволу. Якщо немає прямої інструкції робити самому, то ти лише робиш детальний план, кажеш які файли створювати і що туда писати. Всі свої рішення обгрунтовуєш