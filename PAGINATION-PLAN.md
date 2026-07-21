# GymOS Pagination & Scoring Kernel — Implementation Plan

**Status:** executable. Every claim below was re-verified against the working tree today; line numbers are from `d:\Job\gym-os\app.js` (8994 lines) and `d:\Job\gym-os-back\src`.

---

## Spine choice

**Taken as the spine: KERNEL-FIRST, SHARED CODE.** The scoring engine is *relocated*, not reimplemented. `oneRepMax` (app.js:6567-6591) is an average of six formulas with a reps cap, a `reps===1` short-circuit, `Math.max(average, load)` and `round(_,1)`. Transcribing that plus 39 achievement checks into SQL creates a permanent, silent float-drift surface that shifts PR dates → `first-pr`/`pr-25` unlock dates → XP → levels. Identical JS over identical rows is identical by construction.

**Grafted from BFF:** the `ensureView` synchronous-render loader. This is non-negotiable and the other two designs underweighted it — `renderSection()` has **55 call sites** (verified by grep) and every one is synchronous. No fetch may ever originate inside a render function.

**Grafted from BOUNDED WINDOWS:** (a) the two-shape discipline — `Workout` (hydrated) vs `WorkoutSummary` (**no `exercises` key at all**, so unguarded derefs throw loudly instead of rendering plausible zeros); (b) `?shape=windowed` on `/export` read via a **primitive** `@Query("shape")`; (c) `seq` as a window function, no column, no migration; (d) `users[]` and the catalog stay whole.

**Rejected:**
- *BFF's per-tab endpoint surface.* It moves Ukrainian UI copy (`Тренування #N`, the five `xpEvents` labels at :6775-6788) and layout constants ("8 feed rows", "14 volume points") into the backend. Every UI tweak becomes a backend deploy. Ten endpoints, not twenty-plus.
- *Header negotiation (`X-GymOS-Client: 4`).* `?shape=` is bidirectionally safe: an old client omits it and gets v3; a new client hitting an old server has the param silently ignored (`import-export.controller.ts:15` binds no `@Query()`) and falls back to local compute. Headers only give you one of those directions.
- *A stored `Workout.seq` column.* `prisma.service.ts:51-54` documents that `prisma migrate` cannot run through the Neon pooler; every column added since is hand-reconciled in `ensureSchema()`. A column means DDL that will exist in `schema.prisma` and the generated client but not the database. A window function needs none — **and it is more faithful**: today's `workoutNumber` (:7611) sorts by `createdAt || date`, `/export` never emits workout `createdAt`, so numbering already re-flows when a workout is backdated. `ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "date" ASC, "id" ASC)` reproduces that and adds the missing deterministic tie-break.
- *Process-wide `TZ=Europe/Kyiv` as a free config change.* See §0.4 — it is not free, and the prerequisite work is real.

---

## The ordering constraint — confirmed, not disproven

```
renderSection() [55 call sites, :1663]
  → renderShell() [:1451-1457]
      → renderCurrentUserButton() → userLevel(user.id)        [:1623]
      → renderSidebarProfile()   → userStats(user.id)         [:1634]
                                 → userLevel(user.id)         [:1635]
userLevel [:6828] → userXp [:6824] → xpEvents [:6767]
  ├─ workoutsFor(id).filter(completed).sort(asc) → workoutVolume per workout   [:6771-6777]
  ├─ recordsFor(id) → every non-warmup completed set of every workout          [:6394-6408]
  └─ userAchievements → achievementData [:6744] → evaluateAchievements (39)    [:6787]
leaderboard(muscle) [:6447-6453] → the whole chain, per user, 3-4× each
```

`workoutsFor` (:7654) is `state.database.workouts.filter(...)`. **Truncating the array produces fewer XP with no error path.** The failure is silent and plausible. Kernel before pagination: confirmed. I found no code that disproves it.

Two amplifications the brief understated:
- The corpus walk runs on **every render of every screen**, not just Levels.
- `leaderboard` needs **every peer's** lifetime corpus, so the kernel must be a **batch, all-users** endpoint. A `/scoring/me` unblocks nothing.

---

## §0 — Invariants you must not violate

### 0.1 The two shapes

| | `Workout` (hydrated) | `WorkoutSummary` |
|---|---|---|
| `exercises` | present, `[].sets[]` | **key absent** |
| `cardioSessions` | present | **key absent** |
| aggregates | `totalVolume`, `setCount`, `workingSetCount`, `exerciseCount`, `cardioMinutes`, `durationMinutes` | same |
| `seq` | yes | yes |
| `hydrated` | `true` | absent |

**Hydrated workouts also carry the aggregates.** This is the single highest-leverage structural decision in the plan and it comes from the last critique: it lets `workoutHistoryList` (:6111-6121), `activityFeed` (:6091-6109) and `openDaySheet` (:4363-4378) read *only* scalars, so one renderer serves both shapes and never derefs `.exercises`. Without it, repointing `userDetail` (:6039) at a summary endpoint makes `workoutHistoryList` throw for its other four callers (`calendar()` :2735, `profile()` :2826, `stats()` :2768) — a hard page crash.

Summaries **never** enter `state.database.workouts`. They live in `state.views.*`.

### 0.2 The scoring block, field-by-field, diffed against live consumers

This is where all three designs had defects. The server ships **ids**, the client reads **objects**, and optional chaining turns every miss into `—` instead of a throw.

`userStats` (:6338-6368) returns 20 keys. Ship all 20:

```
userId, totalWorkouts, completedWorkouts, totalSets, workingSets, warmupSets,
totalVolume, averageDurationMinutes, cardioMinutes, cardioDistance, cardioSessions,
weekVolume, weekSets, weekCardioMinutes, trainingStreak, lastWorkoutDate,
mostUsedExerciseId, mostTrainedMuscleGroup, personalRecords, notesCount
```

- `totalWorkouts` is **required**: `stats()` :2770 renders `metric("Усього тренувань", summary.totalWorkouts, …)` and `metric` (:5795) does `escapeHtml(String(value))` → omitting it prints the literal string `undefined`.
- `mostUsedExercise` is an **object** client-side (`topMap(exerciseMap, exerciseById)`, :6364) read as `summary.mostUsedExercise?.name` (:2770). Ship `mostUsedExerciseId`; the ingest shim re-attaches.
- `lastWorkoutDate` (:6363) is required.

`teamStats` (:6371-6391) has **three fields no per-user row can reconstruct** — this was missed by two of the three designs:

```
team: { totalWorkouts, completedWorkouts, totalSets, workingSets, totalVolume,
        averageDurationMinutes, cardioMinutes, cardioDistance,
        cardioDays,          // Set-union of dates across ALL users (:6386)
        teamStreak,          // streak() over ALL users' completed workouts merged (:6387)
        mostActiveUserId,    // (:6388, an object client-side)
        mostUsedExerciseId,  // first non-null in state.database.users ORDER (:6389)
        mostTrainedMuscleGroup }
```

`mostUsedExerciseId` for the team is order-dependent on `state.database.users` — the kernel must iterate users in `/export` order (`orderBy: { createdAt: "asc" }`, import-export.service.ts:18).

`records[]` — `recordsFor` (:6403) inlines the full `exercise` object; five sites read through it: `row.bestLift.exercise.name` (:2801), `record.exercise.name` (:5819), `record.exercise.primaryMuscleGroup` (:6444, the leaderboard muscle filter), :6466, :6779. Ship `exerciseId` only; **the ingest shim re-attaches via `exerciseById`.**

> **Iteration order is load-bearing.** `recordsFor` (:6396) iterates in `/export` order (`orderBy: { date: "desc" }`, import-export.service.ts:30) and compares with strict `>` (:6402), so **on a 1RM tie the latest date wins**. Feeding the kernel rows date-ascending — the natural choice, and what `achievementData` (:6745) uses — flips every tied PR to the earliest date, changing displayed PR dates, `first-pr`, `pr-25`, and ledger dates. **The kernel must feed `recordsFor` rows in `date DESC` order, and the parity fixture must contain a tied-1RM-across-two-dates case.**

`achievements[]` — ship `{id, unlockedAt}` for **all 39**, including `unlockedAt: null`. `levels()` (:2875-2877) renders locked ones and prints `Відкрито N з ${achievements.length}`. Shipping unlocked-only makes the header read "Відкрито 14 з 14".

`xpLedger` — top 14 only. `{date, amount, kind, refId, meta}`. `meta` is **required for two kinds**: `workout` needs `{volume, continues}` (the label at :6775 is `Тренування · ${number(volume)} кг${continues ? " · серія" : ""}` and neither is recoverable from `amount` because of the `Math.floor` and `volumeCap` clamp at levels.js:14-15); `record` needs `{oneRm}` (:6779). `idea`/`exercise`/`achievement` resolve client-side from `featureRequests[]`, the catalog and `ACHIEVEMENTS`. `icon` is per-kind — build a client-side map.

**Ingest shim rule: `throw` on a missing key, never merge-with-default.** A `||`/`??` fallback in the shim reintroduces exactly the silent-plausible-value failure this whole design exists to prevent.

Transitively fixed by the `recordsFor` shim, and easy to miss: `bestResult` (:6656) → `rankingFor` (:6421) → `mainRank` (:6705), which renders a user-visible strength class on the Levels hero (:2853). `ensureStrengthStandards` (:6414) and `rankingFor` stay client-side — they operate on client-fabricated demo data the backend deliberately stopped exporting.

### 0.3 The catalog is a hard boot dependency

`exerciseById` (:7621) falls back to `missingExercise` (:7633-7651) which returns `primaryMuscleGroup: "Не налаштовано"` and **never throws**. With an empty catalog, six achievements silently return `null` — `bench-100` (500) + `bench-140` (1000) + `squat-140` (800) + `deadlift-180` (1000) + `shoulders-50k` (350) + `chest-100k` (400) = **4050 XP vanishes** and the level visibly drops.

The kernel is immune (the server always loads the full catalog). The **client** is not, on its fallback path and in every PR card. Therefore: the catalog stays in the boot payload, ETag-omitted only when the client already holds it, and `databaseProblem` gains an emptiness check. Do **not** lazy-load it into a race with the first render.

### 0.4 Timezone — do the prerequisite work, then pin

`lib/achievements.js` parses `new Date(\`${date}T00:00:00\`)` at :34, :112, :133, :167 and reads `.getHours()` on `startedAt` (:123) — all runtime-local. On a UTC lambda, `early-bird`/`night-owl` and `week-3` week keys diverge from what a Kyiv user sees. Pinning `TZ=Europe/Kyiv` fixes that *without editing the vendored files*, which is the point of the whole stance.

But `TZ` is process-wide and two other functions read local time:

- `dateInput` (import-export.service.ts:453-455) uses `getFullYear/getMonth/getDate` and produces **every `date` string in the payload**. Those strings are Set keys in `streak()` (:6722) and `teamStats.cardioDays` (:6386), the FullCalendar `start` (:6206), and the `openDaySheet` filter (:4366).
- `startOfWeek` (shared/workout-quota.ts:18-23) uses local `getDay()`/`setHours` and defines the quota window boundary.

`parseDateInput` (shared/parse-date.ts) is `new Date(value)`; a bare `"YYYY-MM-DD"` parses as **UTC midnight**, so under UTC+2/+3 `dateInput` returns the same calendar day and the pin is *probably* harmless. **Do not rely on "probably."** The fix is one line each and is a verified no-op today:

```ts
// serialize.ts — TZ-immune by construction
function dateInput(date: Date) { return date.toISOString().slice(0, 10); }
```
and make `startOfWeek` operate on UTC getters. Both are no-ops while the process runs UTC, and both become immune afterwards. **Ship those first, verify with the query in Phase 0, then set `TZ`.**

Accept and announce: pinning `TZ` legitimately changes `streak-7`. `consecutiveDaysUnlockDate` (achievements.js:112) uses strict `gap === 1` on a local-midnight subtraction; across a DST transition the value is 0.958 or 1.042 and the run resets. Fixing it changes historical unlock dates for some users. That is a bug fix that reads as "the app changed my level."

### 0.5 Route ordering, DTOs, indexes

- `workouts.controller.ts:21` is `@Get(":id")` and is the **only** `@Get` in the controller. Every new `@Get` goes **above line 21**. The precedent is already in the codebase (`exercises.controller.ts:20-32` declares `pending`/`my-reactions` first with a comment saying exactly this).
- `configure-app.ts:74-78` sets `transform: true` with **no** `transformOptions.enableImplicitConversion`. **`@Type(() => Number)` on every numeric query field is mandatory** — a bare `@IsInt() limit?: number` 400s on `?limit=20`. This is the single most likely bug in the migration. Booleans need `@Transform(({value}) => value === "true" || value === true)`; `@Type(() => Boolean)` is wrong because `Boolean("false") === true`.
- `forbidNonWhitelisted` only fires on objects the pipe validates. A primitive `@Query("shape") shape?: string` has a `String` metatype and is skipped. **`/export` never gets a DTO.**
- `INDEX_STATEMENTS` (prisma.service.ts:7-27) has **19** entries; the gate is the const `INDEX_SET_VERSION = 1` (:36). Any index added to `schema.prisma` alone is silently never created on a booted database. Bump the const. While there, add the missing `Exercise_status_idx`.

---

## Phase 0 — Stub-proof the write path, TZ-immunise the serializer

**Effort: S (1 day). Risk: very low. User-visible: none.**

**Files:** `app.js`, `lib/achievements.js`, new `d:\Job\gym-os-back\src\shared\serialize.ts`, `src/modules/import-export/import-export.service.ts`, `src/shared/workout-quota.ts`, `src/modules/workouts/workouts.{controller,service}.ts`.

1. **`workoutPayload` guard — at the TOP of the function (:8627), before the `return`.** There are **two** wipe lines, not one: `exercises` at :8637 and `cardioSessions` at :8652, and both feed the delete-and-recreate at `workouts.service.ts:122-156`.

```js
function workoutPayload(workoutItem) {
    if (!Array.isArray(workoutItem.exercises) || !Array.isArray(workoutItem.cardioSessions)) {
        const error = new Error("refusing to serialise an unhydrated workout");
        error.status = 400;                 // ← permanent, NOT a network error
        throw error;
    }
    ...
}
```

> **The `status = 400` is critical and every prior design got this wrong.** `workoutPayload` is called at :8784 *inside* the offline-queue try block. A bare `Error` has no `.status`, so `isRetriableError` (:8695-8699) hits `if (!status) return true`, the entry is never `shift()`ed, and **every subsequent flush re-throws on the same head entry — the offline queue deadlocks permanently and the offline chip never clears.** Same shape at :8857. Additionally, at :8784 prefer `entry.payload` (the snapshot already captured at :8872) when the live row is unhydrated, so a replay never needs the guard at all.

2. **Server backstop in `saveFull`**: if `dto.exercises.length === 0` and the stored workout has >0 exercises, 409 unless `dto.confirmEmpty === true`. ~5 lines, and it is the only guard that survives a client bug.

3. **Assert, don't silence.** Convert the `|| []` escape hatches to `Array.isArray` asserts: `lib/achievements.js:17, 49, 92, 96, 180` (`:96` is `cardioSessions`, `:180` is `workoutExercise.sets` — both missed by the earlier lists) and `app.js:2591`. **Use `Array.isArray`, not truthiness** — a completed cardio-only workout legitimately has `exercises: []` and must not throw.

4. **Extract `src/shared/serialize.ts`** with `numberValue`, `dateInput` (as the UTC one-liner from §0.4) and `serializeWorkout(row)`. Point `import-export.service.ts` at it. Make `startOfWeek` UTC-based.

5. **`GET /workouts/:id`**: add `@CurrentUser()`, scope to `workout.userId === caller.id || workout.status === "completed"` else 404; route through `serializeWorkout`; drop `exercise: true` from `includeWorkout()` (workouts.service.ts:321). The `user` row is already redacted there — that concern is stale.

6. **Delete dead code** (all definition-only, verified by occurrence count): `insights` (:6456), `weeklyVolumeChart` (:6233), `cardioChart` (:6260), `calendarOverview` (:7742), `todayLabel` (:7765), `todayCaption` (:7770), `usersForExercise` (:6676), `previousPerformance` (:6621), `lastUsed` (:6680, reachable only from `insights`). **Do not sweep `maxTrendChart`, `consistencyChart` or `muscleDistributionChart` — they are live** (:2830, :2775, :2773).

**Verification:**
```sql
-- MUST return 0. If not, dateInput's UTC change would move dates.
SELECT count(*) FROM "Workout" WHERE "date" <> date_trunc('day', "date" AT TIME ZONE 'UTC');
SELECT count(*) FROM "UserBodyweightEntry" WHERE "date" <> date_trunc('day', "date" AT TIME ZONE 'UTC');
```
Then: capture `GET /export` before and after; `diff <(jq -S . before.json) <(jq -S . after.json)` must be **empty**. Separately, in a browser console, force an unhydrated row into the offline queue and confirm the queue drains (entry dropped with an error toast) rather than sticking.

---

## Phase 1 — Extract `lib/scoring.js`, freeze golden vectors

**Effort: L (3-4 days). Risk: medium (large refactor of the most correctness-sensitive code, no existing test suite). User-visible: none.**

**Files:** new `d:\Job\gym-os\lib\scoring.js`, new `d:\Job\gym-os\lib\scoring.fixture.json`, new `d:\Job\gym-os\lib\scoring.parity.test.js`, `app.js`.

**Write the golden fixture FIRST, against current `app.js` behaviour, then refactor until it still passes.** This is the whole safety mechanism.

Move out of the IIFE, taking injected `{exerciseById, userById, workoutsFor, now}` instead of closing over `state`: `oneRepMax` (:6567), `workoutVolume` (:6555), `exerciseVolume` (:6559), `exerciseOneRepMax` (:6563), `autoDuration` (:6596), `duration` (:6604), `streak` (:6721), `muscleSetMap` (:6685), `exerciseUsageMap` (:6694), `topMap` (:6700), `recordsFor` (:6394), `achievementData` (:6744), `userAchievements` (:6763), `xpEvents` (:6767), `userXp` (:6824), `userLevel` (:6828), `userStats` (:6338), `teamStats` (:6371). Export `scoreAll({users, workouts, exercises, featureRequests, now})`.

Two deliberate splits: `xpEvents` emits `{date, amount, kind, refId, meta}` and app.js keeps `labelForXpEvent()`; `recordsFor` emits `exerciseId` and app.js keeps `hydrateRecords()`.

**Delete `filteredWorkouts` (:6537) and the four `state.filters.stats*` keys (:39-42).** Verified: `statsRange`, `statsMuscle`, `statsExerciseId`, `statsWorkoutType` are initialised at :39-42 and read at :6266 and :6539-6551 but **assigned nowhere in 8994 lines**. Only `statsUserId` is live (:3909). `filteredWorkouts` is an identity function; `userStats(id, true)` ≡ `userStats(id, false)`. One catch: `statsExerciseId` has a second reader at :6266 (`progressChart` uses it to choose the charted exercise) — deleting the field means hardcoding the Жим лежачи default there, which is what it already does.

**Fixture must contain, or the parity test proves nothing:**
- a tied-1RM PR across two different dates (§0.2 iteration order)
- a completed cardio-only workout (`exercises: []`)
- a `streak-7` run spanning a DST transition
- workouts started at 04:00, 06:00, 22:00 and 00:30 Kyiv (`early-bird`/`night-owl`)
- all five `tenure-*` boundaries against a frozen `now`
- `idea-done`, `exercise-liked`, `exercises-3`, `exercises-10`
- an `exerciseId` absent from the catalog (`missingExercise` path)
- two workouts on the same date (the `seq` tie-break)

**Verification:** `node --test lib/scoring.parity.test.js` green. Then, in a production browser session before merging, run the old and new implementations side by side over the real corpus and assert deep-equality of `{xp, level, achievements, records, stats}` for all 13 users. Zero diffs, or do not merge.

---

## Phase 2 — Vendor the kernel, ship `/scoring` in SHADOW mode

**Effort: L (3-4 days). Risk: HIGHEST in the plan. User-visible: none (by design).**

**Files:** `d:\Job\gym-os-back\tsconfig.json`, new `src/scoring/vendor/{levels,achievements,scoring}.js` + `.d.ts` + `VENDOR.json`, new `src/scoring/scoring.service.ts`, `src/scoring/{vendor,parity}.spec.ts`, new `src/modules/scoring/scoring.controller.ts`, `src/app.module.ts`, `app.js`.

1. `tsconfig.json`: `"allowJs": true` (leave `checkJs` off). Vendor the three files **byte-identical**, with hand-written `.d.ts` siblings and a `VENDOR.json` carrying sha256 of each.
2. `vendor.spec.ts` hashes the files against `VENDOR.json` — catches someone editing the backend copy. `parity.spec.ts` runs the **identical fixture from Phase 1** against `scoreAll` with a frozen `now` and the same golden output. The repos are separate (`D:/Job/gym-os` and `D:/Job/gym-os-back`), so backend CI cannot diff against the frontend; the shared fixture is what detects semantic drift.
3. **Prove the build before writing anything else.** `@vercel/node` compiles `src/vercel.ts` with its own pipeline, and `allowJs` + extensionless imports of ESM-syntax `.js` under `"module": "commonjs"` is unproven there. Run a local `vercel build` on day one. If it fails, the fallback is `.ts` conversion — which means editing the files and reintroducing exactly the drift this stance exists to prevent. `"noImplicitAny": false` is already set, so only `strictNullChecks` is a real wall.
4. Set `TZ=Europe/Kyiv` in the Vercel project env — **only after Phase 0's UTC serializer shipped and verified.**
5. `GET /scoring` returns the §0.2 block for all users plus `team` plus the caller's `xpLedger`. Cache in a `ScoringCache`-equivalent **created via `ensureSchema()`** (the `ExerciseReaction` precedent is `exercises.service.ts:260-268`) — or, simpler and my recommendation at this size, skip the table entirely and memoize per-lambda keyed on a composite stamp: `(count, max(updatedAt))` across `Workout`, `WorkoutSet`, `WorkoutExercise`, `CardioSession`, `Exercise`, `ExerciseReaction`, `FeatureRequest`, `User`, plus the current Kyiv calendar day. The day component invalidates all five clock-driven `tenure-*` achievements, `streak`, and the Monday `weekVolume` reset with one field and no cron. Emit the stamp in the body (not only as an `ETag` — `applyCorsHeaders` sets no `Access-Control-Expose-Headers`, so a cross-origin client cannot read `ETag`).
6. **Client: shadow only.** Fetch `/scoring`, compute locally as today, `console.warn` + increment a counter on any divergence in `{xp, level, achievements, records, stats, team}`. **Render the local value.**

**XP is a cache, never authoritative.** It moves backwards with no data mutation: `streak` reads `new Date()` (:6727); `weekVolume`/`weekSets` reset Mondays (:6359-6361); un-liking an exercise re-locks `exercise-liked` (−150 XP) and is another user's action; an admin un-setting `idea-done` costs −750 XP (250 achievement + 500 ledger at :6781); reopening a completed workout drops it from the corpus entirely.

**Verification — this is the phase's whole point.** Ship shadow mode and leave it for a full week across all 13 users. The acceptance gate is **zero divergences other than the three you predicted and can name**: `streak-7` DST corrections, `early-bird`/`night-owl` hour re-evaluation, and same-day `workoutNumber` ordering. Log each divergence as `{userId, field, local, server}` and read them individually. Do not proceed on an aggregate count.

---

## Phase 3 — Flip the client onto the kernel

**Effort: M (2 days). Risk: medium — this is where levels become user-visible. First CPU win.**

**Files:** `app.js` only.

Repoint against `state.scoring`: `userStats` (:6338), `teamStats` (:6371), `userLevel` (:6828), `userXp` (:6824), `recordsFor` (:6394), `userAchievements` (:6763), `achievementBadges` (:5783), `leaderboard` (:6447), `xpEvents` (:6767). Keep the local path behind a flag for exactly one release, with a hard removal date.

Ingest shim, running once per `/scoring` response:
- `hydrateRecords()` re-attaches `exercise` via `exerciseById` — **five** sites read `record.exercise.*`.
- `stats.mostUsedExercise = exerciseById(row.stats.mostUsedExerciseId)`; `team.mostActiveUser = userById(...)`, `team.mostUsedExercise = exerciseById(...)`.
- `muscleSetMap` / `exerciseUsageMap` arrive as JSON objects but `topMap` (:6701) does `[...map.entries()]` — wrap in `new Map(Object.entries(...))`.
- `achievements` = `ACHIEVEMENTS.map(a => ({...a, unlockedAt: serverMap[a.id] ?? null}))`, **not** the server array (Levels renders all 39 and counts `achievements.length`).
- **Throw on any missing key.**

**Two mandatory guards:**

1. **`checkAchievementUnlocks` (:6795-6822) must early-return when `state.scoring` is unresolved.** It reads `userAchievements` at :6800 and **unconditionally writes the result to `ach-seen-${user.id}` at :6821**. One run against an unloaded scoring view persists an empty set to durable storage; the next correct run diffs 39 − 0 and fires **39 toasts at 900 ms spacing** (:6819) — a 35-second toast storm. No prior design mentioned this function.
2. **Bump the storage key to `ach-seen-v2-${user.id}`.** The first run then seeds silently (the `raw === null` branch at :6803), which absorbs the legitimate DST/hour corrections instead of toasting every changed achievement to every user.

**No fetch may originate inside a render function.** `renderShell()` runs on all 55 `renderSection()` paths; a fetch there is 13 requests per tab switch. `/scoring` refetches only on: workout **finish or delete** (not `save` — the coalescing saver at :8663 fires dozens of times per session against a 200/60s throttle), exercise create/approve/reject/delete/react, feedback status change, and visibility-regain after >5 min.

**Verification (the one that catches a silent level change):** before deploying, snapshot `{userId, xp, level, sorted achievement ids, sorted record (exerciseId,date,estimatedOneRepMax) triples}` for all 13 users from a production browser session on the current build. After deploying, snapshot again. **Diff must be empty except for named, pre-approved DST/hour corrections.** Commit both snapshots to the repo as `scoring-baseline-{pre,post}.json`. Any unexplained delta is a rollback.

---

## Phase 4 — Windowed boot payload (`?shape=windowed`) + peer endpoints

**Effort: L (4-5 days). Risk: highest blast radius. FIRST NETWORK WIN.**

**Files:** `import-export.{controller,service}.ts`, `workouts.controller.ts`, `workouts.service.ts`, new `src/modules/stats/`, new `src/shared/dto/page-query.dto.ts`, `app.js`.

`GET /export?shape=windowed&ownLimit=30`, read as a primitive `@Query("shape")`. No DTO, ever.

```jsonc
{ "version": 4, "shape": "windowed", "currentUserId": "u1",
  "users": [ /* all 13, unchanged */ ],
  "exercises": [ /* full catalog, OMITTED when If-None-Match matches catalogEtag */ ],
  "catalogEtag": "W/\"cat-51-<max(updatedAt)>-<reactionWatermark>-<userId>\"",
  "bodyweightEntries": [...], "featureRequests": [...],
  "workouts": [ /* OWN only, HYDRATED, newest-first, <= ownLimit,
                   PLUS the active workout even if outside the window,
                   each with seq + totalVolume + setCount + workingSetCount
                   + exerciseCount + cardioMinutes + durationMinutes + hydrated:true */ ],
  "workoutsCursor": "eyJkIjoiMjAyNi0wNS0xMVQwMDowMDowMC4wMDBaIiwiaSI6ImNreDAxIn0",
  "scoring": { "users": {...}, "team": {...} },
  "xpLedger": [ /* top 14, with meta */ ] }
```

`seq` = `ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "date" ASC, "id" ASC)`. `workoutNumber` (:7610) collapses to `return workoutItem.seq`.

**Cursor: base64url of `{"d": row.date.toISOString(), "i": row.id}` — the raw `DateTime`, not the day string.** `Workout.date` is `DateTime`, not `@db.Date`, and `parseDateInput` does a bare `new Date(value)` with no truncation. A day-string cursor coerces to `T00:00:00Z`; any row whose stored instant differs fails `{date: cur.d, id: {lt: cur.i}}` and is re-matched by `{date: {lt: cur.d}}` → **a duplicate row across the page boundary**, the exact bug the composite cursor exists to prevent.

```sql
WHERE "userId" = $1 AND ("date", "id") < ($2, $3) ORDER BY "date" DESC, "id" DESC LIMIT $4
```

New endpoints, **all `@Get` declared above `workouts.controller.ts:21`**:

| Endpoint | Returns | Serves |
|---|---|---|
| `GET /scoring` | the block standalone | post-write refresh |
| `GET /workouts/mine?limit&cursor` | `{workouts: Workout[], nextCursor}` hydrated | own load-more |
| `GET /users/:id/workouts?limit&cursor` | `{workouts: WorkoutSummary[], nextCursor}` | `userDetail` :6039 |
| `GET /stats?userId=\|scope=team` | `{stats, volumeSeries[14], consistencySeries[10], muscleSetMap, progressSeries, history[8]}` | `stats()` :2764, `maxTrendChart` :6271 |
| `GET /exercises/:id/analytics` | `{myInstances, myProgressSeries, lastSets, teamBest:{userId,displayName,estimatedOneRepMax,date}, related}` | `openExercise` :5440, `teamBestResult` :6659, `suggestedSets` :6472 |
| `GET /feed?limit=8&cursor&scope` | `{items: WorkoutSummary + owner fields + seq, nextCursor}` | `activityFeed` :6091 |

`UsersController` has **no class-level guard** (guards are per-route at :16, :22, unlike `WorkoutsController` :12) — a `@Get(":id/workouts")` copied from the workouts controller will be **unauthenticated**. Add the guards explicitly.

Client:
- `state.views` + `ensureView(name, loader, ttl)` — synchronous return of cached-or-null, async load, `renderSection()` on settle. Migrate `stats()`, `userDetail()`, `openExercise()` to skeleton-then-patch. **Budget the skeleton work**: `exerciseAnalytics` is interpolated inline at :5441 inside `openDrawer(\`…\`)`, `activityFeed` inside the dashboard string. "Repoint" is not a one-liner at these sites.
- `mergeWorkouts(rows)` upserts by id and **never lets a summary overwrite a hydrated row**.
- **Assert inside `workoutsFor` (:7654)**: when `shape === "windowed"`, `userId !== currentUser().id` throws. This is the one place absence does *not* fail loudly — a peer filter over a truncated array returns `[]`, not an error. The assert converts 23 call sites' worth of silent-empty into loud failures. Grep all 23 after.
- `databaseProblem` (:1092-1103) gains two clauses: windowed payload must have `scoring.users`; `database.exercises.length` must be > 0 (§0.3).
- `createEmptyDatabase` (:1117) bumps to `version: 4`.

**Verification:** with `?shape=windowed`, re-run the Phase 3 snapshot diff — `{xp, level, achievements, records}` must be **byte-identical to the v3 baseline**, proving the truncated corpus is no longer feeding scoring. Then walk every tab and every drawer with `state.database.workouts` artificially truncated to 5 rows in the console; **any screen that renders a number instead of throwing or showing a skeleton is a bug**. Confirm `workoutsCursor` paging over the full own history yields exactly 27 distinct ids with no duplicate and no gap.

---

## Phase 5 — Month-scoped calendar + on-demand workout detail

**Effort: M (2-3 days). Risk: medium. Structural — you will not feel it at 27 workouts.**

**Files:** `workouts.controller.ts`, `workouts.service.ts`, `schema.prisma`, `src/prisma/prisma.service.ts`, `app.js`.

- `GET /workouts/calendar?year&month&scope=all|mine` → `{year, month, events: WorkoutSummary[] + owner avatar fields}`. `CalendarQueryDto` with `@Type(() => Number)`. **Build the month predicate from explicit UTC boundaries**, not from local-midnight `Date` objects, or the 1st and last of each month land in the wrong month once `TZ` is pinned.
- `GET /workouts/day?date=YYYY-MM-DD` → `openDaySheet` (:4366).
- `openWorkout` (:5451) fetches `GET /workouts/:id` into `state.views.workouts[id]`. Pre-warm the most recent own workout so the common case stays instant.
- **`renderCalendar` needs structural work, not a repoint.** It builds `events:` as a **static array at construction** (:6200-6218); FullCalendar's prev/next (:6192) does not re-run it and there is no `datesSet` or function-form event source anywhere in :6186-6229. Convert `events` to a function event-source + `datesSet`. Without this, navigating off the boot month shows an **empty calendar with no error**. Prefetch ±1 month, or month navigation becomes worse than today (it is currently in-memory and instant).
- Indexes: add `@@index([userId, date, id])` and `@@index([userId, status, date])` to `schema.prisma` **and** to `INDEX_STATEMENTS`, **and bump `INDEX_SET_VERSION` 1 → 2**. Add the missing `Exercise_status_idx` in the same pass.

**Verification:** with `?shape=windowed` active, open the calendar on a month containing peer workouts and confirm every event that `/export` v3 showed is present, with identical `#N` labels. Then click prev/next across 12 months and confirm no empty month and no duplicate event. Compare `#N` for every workout against a v3 snapshot — **the only permitted differences are same-day pairs**, and those are the bug fix.

---

## Phase 6 — Catalog ETag

**Effort: S (1 day). Risk: low. Second network win — and it is orthogonal, so pull it forward if you need an early result.**

66 KB is the largest remaining slice. Omit `exercises` from the `/export` body when `If-None-Match` matches `catalogEtag`; the client keeps `state.database.exercises`.

**The ETag formula matters.** `/export`'s `exercises[]` carries per-user `myReaction` (import-export.service.ts:122). A reaction write inserts into `ExerciseReaction` and touches **no** `Exercise` row, so `max(Exercise.updatedAt) + count` is unchanged → the 304 serves a stale `myReaction` and the like button renders wrong indefinitely, or worse, one user sees another's state. **Fold `userId` and an `ExerciseReaction` watermark into the ETag.**

Also remove `ensureCuratedCatalogAvailable()` / `ensureExtraExercises()` from the `GET /exercises` request path (exercises.service.ts:276-278) — a catalog reconcile on every request. Note that endpoint currently has **zero client callers**, so this is hygiene, not a boot win.

**Verification:** react to an exercise, reload, confirm the heart state is correct (this is the exact bug the naive ETag causes). Confirm a cold boot serves the catalog and the immediately-following boot returns a body without `exercises` while the UI is unchanged.

---

## Compatibility & version story

The service-worker risk is **overstated in every prior analysis**. `public/sw.js:44-46` returns early on cross-origin, so **no API response is ever SW-cached**. `/assets/` is cache-first (:50-61) but Vite content-hashes those filenames, and `index.html` is in the network-first branch (:64+). A deploy is picked up on the next online navigation. Old clients persist only in an already-open tab or fully offline — **not indefinitely**.

The real compatibility mechanism is `?shape=`:

| Client | Server | Result |
|---|---|---|
| old (no param) | new | v3 full payload, byte-identical |
| new (`shape=windowed`) | old | param ignored (no `@Query()` binding today) → v3 payload → client sees `shape !== "windowed"` and uses the local-compute fallback |
| new | new | v4 windowed |

Consequence: **client and server phases can deploy in either order**, and rollback is dropping the param. `databaseProblem` (:1099) accepts `version >= 3`, so `4` passes unchanged. Retire the v3 branch two releases after Phase 4.

---

## What the owner will actually feel

**Phase 4 is the one.** 234 KB → ~90 KB at boot (≈15 KB once Phase 6's catalog 304 lands). On a gym-basement connection under the 20 s `AbortController` (app.js:160-161) that is the difference between a multi-second boot overlay and an instant one. This is the phase to demo.

**Phase 3 is marginally perceptible, in exactly one place.** The rankings tab today performs roughly 50 full-corpus traversals (13 users × `recordsFor` + `userStats` + `userLevel`, each of which re-walks). Removing that is visible in a profiler and borderline visible on a mid-range phone. Everywhere else — the sidebar on all 55 render paths — the win is real in principle and **below the perception threshold at 404 sets**. It becomes dominant around 10⁴.

**Phase 6 is a genuine, cheap win** and is orthogonal to everything else. Ship it early if you need a visible result before the kernel lands.

**Phases 0, 1, 2, 5 are structural, defensive, or prerequisite. They will not be felt.** Phase 0 closes a data-loss path. Phase 1 is a refactor. Phase 2 is unread by design. Phase 5's cursors and indexes buy nothing measurable until ~10⁴ rows — the owner has already accepted this framing, and it is the honest one.

**Honest total: three releases with zero user-visible benefit before Phase 4.** That is the cost of doing this without silently corrupting everyone's level.

---

## The first commit

```
fix(workouts): refuse to serialise an unhydrated workout

workoutPayload() built `exercises` and `cardioSessions` with `|| []`, and
POST /workouts/:id/save is a destructive full replace (deleteMany sets ->
deleteMany exercises -> deleteMany cardio -> recreate, workouts.service.ts).
Any future list-shaped workout row reaching this function permanently deletes
that workout's sets from Postgres, atomically, with no error surfaced.

Guard at the top of the function, before the return, so both the exercises
and cardioSessions paths are covered. The thrown error carries status 400:
without it, isRetriableError() treats a bare Error as network loss, the
offline queue head is never shifted, and the queue deadlocks permanently.

Also converts the |lib/achievements.js| `|| []` escape hatches to Array.isArray
asserts (an empty array is a valid cardio-only workout; a missing key is a bug),
and adds the server-side backstop: 409 on an empty-exercises replace of a
non-empty workout unless confirmEmpty is set.

No behaviour change today — every workout is currently hydrated.
```

This is correct and worth shipping even if the entire rest of the plan is abandoned.

---

## The one measurement that proves it worked

**Not payload size. Not TTFB.**

> **A diff of `{userId, xp, level, sorted achievement ids, sorted (exerciseId, date, estimatedOneRepMax) record triples}` for all 13 real users, captured from production before Phase 3 and again after Phase 4, is empty except for a pre-approved, individually-named list of DST and start-hour corrections.**

Payload size is trivially verifiable and will be right. The thing that can go wrong — quietly, permanently, and in a way no user will report as a bug because the number still looks plausible — is that somebody's level changed. Commit both snapshots to the repo as `scoring-baseline-pre.json` / `scoring-baseline-post.json` and make the diff a release gate.

If that diff is empty, the pagination is safe by construction, because the only thing pagination could have broken is the corpus that produces those numbers.