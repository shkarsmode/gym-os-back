# GymOS API

NestJS backend для GymOS: PostgreSQL, Prisma, Google OAuth і Vercel-compatible deployment.

## Workspace

- Frontend: `D:\Features\gymos\gym-os-front`
- Backend: `D:\Features\gymos\gym-os-back`

## Локальний запуск frontend

Відкрий `D:\Features\gymos\gym-os-front\index.html` напряму в браузері.

Frontend за замовчуванням стартує в локальному деморежимі. Після запуску API у `Налаштуваннях` можна перемкнути `Режим даних` на `Бекенд API`.

```js
window.FORGE_CONFIG = {
    appName: "GymOS",
    apiBaseUrl: "http://localhost:3000",
    dataMode: "local",
    allowLocalFallback: true
};
```

## Локальний запуск backend

```powershell
cd D:\Features\gymos\gym-os-back
copy env.example .env
npm install
npm run prisma:generate
npm run start:dev
```

Health check:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

## PostgreSQL і Prisma

Створи локальну PostgreSQL базу і заповни `DATABASE_URL` у `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gymos?schema=public"
```

Міграції та seed:

```powershell
npm run prisma:migrate
npm run seed
```

Для Vercel/managed PostgreSQL без migration history можна оновити схему demo-бази напряму:

```powershell
npm run prisma:push
```

Seed створює 3 demo users, базовий каталог вправ, ExRx reference-only каталог, шаблони, completed/planned/active тренування, cardio, PR, achievements і demo strength standards.

## Google OAuth

Створи OAuth credentials у Google Cloud Console:

- Authorized redirect URI: `http://localhost:3000/auth/google/callback`
- Production redirect URI: `https://gym-os-back.vercel.app/auth/google/callback`

Потрібні env variables:

```env
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"
JWT_SECRET="replace-with-a-long-random-secret"
FRONTEND_URL="http://localhost:8080"
ADMIN_EMAILS="you@example.com"
DEMO_OWNER_EMAIL="you@example.com"
ALLOW_FILE_ORIGIN="false"
GYMOS_AUTO_DB_PUSH="false"
NODE_ENV="development"
```

Для Vercel production постав:

```env
GOOGLE_CALLBACK_URL="https://gym-os-back.vercel.app/auth/google/callback"
FRONTEND_URL="https://your-frontend-domain.vercel.app"
NODE_ENV="production"
```

Auth зберігає JWT session у HTTP-only cookie `gymos_session`. У production cookie використовує `SameSite=None; Secure`, тому frontend має працювати з HTTPS origin. Для локального `file://` dev-режиму можна тимчасово поставити `ALLOW_FILE_ORIGIN="true"`, але для Google OAuth краще запускати frontend через HTTP origin або задеплоїти його.

## REST API

Auth:

- `GET /auth/google`
- `GET /auth/google/callback`
- `POST /auth/logout`
- `GET /auth/me`

Users і profile:

- `GET /users`
- `GET /users/:id`
- `PATCH /users/me/profile`

Bodyweight:

- `GET /users/me/bodyweight`
- `POST /users/me/bodyweight`
- `DELETE /users/me/bodyweight/:entryId`

Exercises:

- `GET /exercises`
- `GET /exercises/:id`
- `POST /exercises`
- `PATCH /exercises/:id`
- `DELETE /exercises/:id`

Workouts:

- `GET /workouts`
- `GET /workouts/:id`
- `POST /workouts`
- `PATCH /workouts/:id`
- `DELETE /workouts/:id`
- `POST /workouts/:id/start`
- `POST /workouts/:id/finish`
- `POST /workouts/:id/exercises`
- `PATCH /workouts/:id/exercises/:workoutExerciseId`
- `DELETE /workouts/:id/exercises/:workoutExerciseId`
- `POST /workouts/:id/exercises/:workoutExerciseId/sets`
- `PATCH /workouts/:id/exercises/:workoutExerciseId/sets/:setId`
- `DELETE /workouts/:id/exercises/:workoutExerciseId/sets/:setId`
- `POST /workouts/:id/cardio`
- `PATCH /workouts/:id/cardio/:cardioId`
- `DELETE /workouts/:id/cardio/:cardioId`

Templates, stats і data:

- `GET /workout-templates`
- `POST /workout-templates/:id/create-workout`
- `GET /stats/overview`
- `GET /stats/team`
- `GET /stats/user/:userId`
- `GET /rankings`
- `GET /achievements/me`
- `GET /export`
- `POST /import`
- `POST /import/exercises`

AI (тільки admin):

- `POST /ai/workouts/parse` — розпізнати текст тренування через Gemini і повернути structured preview
- `GET /ai/statistics/summary` — зведення (запити, токени, success rate, latency)
- `GET /ai/statistics/usage` — денні бакети токенів для графіка
- `GET /ai/statistics/requests` — останні запити (з фільтрами `period`, `status`, `model`, `userId`)
- `GET /ai/statistics/limits` — офіційні ліміти моделі + фактичне використання GymOS

## AI-тренування (Gemini)

Admin-only функція: адміністратор описує тренування текстом або голосом (голос розпізнається на frontend через Web Speech API), а backend перетворює transcript у структуроване тренування через Google Gemini.

### Налаштування Gemini

1. Відкрий [Google AI Studio](https://aistudio.google.com/apikey) у своєму Google-акаунті.
2. Створи API key для проєкту з назвою `GymOS`.
3. Додай ключ **лише** в environment variables backend (ніколи в код чи git):

```env
GEMINI_API_KEY=""
GEMINI_MODEL=""                 # порожньо = gemini-3.1-flash-lite (free tier)
GEMINI_REQUEST_TIMEOUT_MS="15000"
GEMINI_MAX_INPUT_LENGTH="6000"
```

Використовується офіційний SDK `@google/genai` зі strict structured output (JSON schema). Модель за замовчуванням — `gemini-3.1-flash-lite` (free tier, швидка, low-latency). **`gemini-2.5-flash` вимкнено для нових ключів**, тож обирай модель поточного покоління. Альтернативи: `gemini-2.5-flash-lite` (більша задокументована денна квота) або `gemini-3.5-flash` (потужніша).

### Ліміти free tier

Актуальні офіційні ліміти дивись у [документації](https://ai.google.dev/gemini-api/docs/rate-limits) та в [AI Studio → Rate limits](https://aistudio.google.com/rate-limit) для конкретного проєкту — Google не публікує сталих чисел, тож перевіряй ліміт свого проєкту. Задокументовані орієнтири (free tier, з третіх джерел; для 3.x — дивись AI Studio):

| Модель | RPM | Запитів/день | TPM |
| --- | --- | --- | --- |
| gemini-2.5-flash-lite | 15 | 1000 | 250k |
| gemini-2.5-flash | 10 | 250 | 250k |
| gemini-3.1-flash-lite / gemini-3.5-flash | free (обмеженіше) | дивись AI Studio | — |

GymOS не показує вигаданий «залишок квоти»: сторінка AI-статистики окремо показує офіційний ліміт моделі (якщо задокументований), фактичне використання в GymOS і оцінку відносно ліміту, з посиланням на офіційну сторінку квот. Для моделі без задокументованих чисел показується підказка перевірити AI Studio.

### Обмеження і безпека

- Endpoint доступний тільки admin (JWT + approved + admin guard). Звичайний користувач отримує `403` навіть при прямому HTTP-запиті.
- Серверний rate limit: cooldown між запитами, ліміт на хвилину, заборона паралельних запитів (`AI_RATE_LIMIT` з `retryAfterMs`).
- Вхідний текст обмежений за довжиною; user text ізольований як дані (захист від prompt injection).
- Gemini повертає лише `exerciseId` з переданого каталогу; backend повторно перевіряє id і робить локальний fuzzy-fallback. Неоднозначні вправи повертаються з варіантами і потребують підтвердження.
- Аудит кожного виклику пишеться в `AiUsageLog` (тільки безпечні метадані: токени, статус, код помилки, latency — без промптів, transcript-ів і секретів).

### Схема (`WorkoutSet.durationSeconds`, `AiUsageLog`)

Додано nullable-поле `WorkoutSet.durationSeconds` (секунди для планок/статичних утримань) і модель `AiUsageLog`. Обидва створюються ідемпотентно на cold start (`PrismaService.ensureSchema` для колонки, `AiUsageService.ensureTable` для таблиці), бо Neon pooled connection не виконує DDL через `prisma db push`. Старі записи лишаються з `durationSeconds = null`.

## Vercel deploy

Backend містить:

- `src/vercel.ts` serverless NestJS entrypoint
- `vercel.json`

Деплой виконуй із `D:\Features\gymos\gym-os-back`; усі env variables потрібно додати у Vercel.

Для PostgreSQL на Vercel використовуй pooled connection string із Neon, Supabase, Vercel Postgres або іншого managed PostgreSQL provider. Для довготривалого NestJS API часто простіше мати persistent Node host, але цей backend має Vercel-compatible serverless entrypoint для production demo і помірного трафіку.

### Одноразова ініціалізація production DB на Vercel

Якщо `DATABASE_URL` у Vercel позначений як sensitive і `vercel env pull` не віддає plaintext URL локально, можна ініціалізувати demo DB під час Vercel build:

```env
GYMOS_AUTO_DB_PUSH="true"
```

`GYMOS_AUTO_DB_PUSH` запускає `prisma db push --skip-generate` під час guarded Vercel install/postinstall step. Старий прапорець `GYMOS_AUTO_IMPORT_EXRX` більше не імпортує каталог автоматично, щоб production DB не роздувалася тисячами вправ. Каталог можна вручну імпортувати через `POST /import/exercises`, а curated-набір можна відновити через `POST /exercises/reset-curated` для admin/demo owner. Після першого успішного деплою `GYMOS_AUTO_DB_PUSH` краще повернути у `"false"` і далі керувати схемою через migrations.

Якщо Vercel build падає на `node_modules/.bin/prisma: Permission denied`, переконайся, що задеплоєна версія має scripts із прямим Node entrypoint:

```json
"postinstall": "node ./node_modules/prisma/build/index.js generate"
```

Після цього зроби redeploy. Якщо Vercel продовжить брати старий cache, запусти redeploy з очищенням build cache.

## Quality commands

```powershell
npm run prisma:validate
npm run prisma:generate
npm run prisma:push
npm run build
```

Секрети, які треба додати вручну:

- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `JWT_SECRET`
- `FRONTEND_URL`
- `ADMIN_EMAILS`
- `DEMO_OWNER_EMAIL`
- `GEMINI_API_KEY` (для AI-тренування; не комітити)
