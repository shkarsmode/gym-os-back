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
