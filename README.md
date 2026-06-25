# GymOS API

NestJS backend for GymOS, prepared for PostgreSQL, Prisma, Google OAuth and Vercel-compatible deployment.

## Workspaces

- Frontend: `D:\Features\gymos\gym-os-front`
- Backend: `D:\Features\gymos\gym-os-back`

## Frontend Local Run

Open `D:\Features\gymos\gym-os-front\index.html` directly in a browser.

The frontend starts in local demo mode by default. In `Налаштування`, switch `Режим даних` to `Backend API` after the API is running.

Default frontend API config:

```js
window.FORGE_CONFIG = {
    appName: "GymOS",
    apiBaseUrl: "http://localhost:3000",
    dataMode: "local",
    allowLocalFallback: true
};
```

## Backend Local Run

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

## PostgreSQL And Prisma

Create a local PostgreSQL database and set `DATABASE_URL` in `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gymos?schema=public"
```

Run migrations and seed:

```powershell
npm run prisma:migrate
npm run seed
```

The seed creates 3 demo users, exercise catalog, workout templates, completed/planned/active workouts, cardio, PR, achievements and demo strength standards.

## Google OAuth

Create OAuth credentials in Google Cloud Console:

- Authorized redirect URI: `http://localhost:3000/auth/google/callback`
- Production redirect URI: `https://your-api-domain.vercel.app/auth/google/callback`

Required env variables:

```env
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL="http://localhost:3000/auth/google/callback"
JWT_SECRET="replace-with-a-long-random-secret"
FRONTEND_URL="http://localhost:8080"
NODE_ENV="development"
```

Auth endpoints:

- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /auth/me`
- `POST /auth/logout`

The API stores a `gymos_session` HTTP-only cookie with a JWT session.

## REST API Surface

Auth:

- `GET /auth/google`
- `GET /auth/google/callback`
- `POST /auth/logout`
- `GET /auth/me`

Users and profile:

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

Templates, stats and data:

- `GET /workout-templates`
- `POST /workout-templates/:id/create-workout`
- `GET /stats/overview`
- `GET /stats/team`
- `GET /stats/user/:userId`
- `GET /rankings`
- `GET /achievements/me`
- `GET /export`
- `POST /import`

## Vercel Deploy

The backend includes:

- `src/vercel.ts` serverless NestJS entrypoint
- `vercel.json`

Deploy from `D:\Features\gymos\gym-os-back` and configure all env variables in Vercel.

For PostgreSQL on Vercel, use a pooled connection string from Neon, Supabase, Vercel Postgres or another managed PostgreSQL provider. Long-running NestJS APIs can be simpler on a persistent Node host, but this project includes a Vercel-compatible serverless entrypoint for production demos and moderate traffic.

## Quality Commands

```powershell
npm run prisma:validate
npm run prisma:generate
npm run build
```

Manual secrets still required:

- `DATABASE_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `JWT_SECRET`
