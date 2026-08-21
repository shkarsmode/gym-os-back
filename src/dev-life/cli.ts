/**
 * dev-life — keeps the DEVELOPMENT environment populated and moving.
 *
 * On the server (the compiled form that ships inside the API image):
 *   docker exec gymos-api-dev node dist/dev-life/cli.js populate
 *   docker exec gymos-api-dev node dist/dev-life/cli.js tick
 *   docker exec gymos-api-dev node dist/dev-life/cli.js stats
 *   docker exec gymos-api-dev node dist/dev-life/cli.js prune
 *   docker exec gymos-api-dev node dist/dev-life/cli.js wipe --yes
 *
 * Locally, against a dev database: npm run dev-life -- <command>
 *
 * WHY THIS EXISTS
 * An empty dev environment cannot answer the questions a dev environment is for: does the
 * feed paginate, does a private profile actually hide anything, does the calendar look
 * right with a real spread of sessions, is the day sheet readable when six people trained.
 * A one-shot seed answers those once and then rots — a week later every date is stale and
 * nothing has happened since. So this runs on a timer and keeps the place inhabited.
 *
 * SAFETY, WHICH IS THE PART THAT MATTERS
 * This writes to a database. It therefore refuses to run unless BOTH hold:
 *   1. DATABASE_URL points at a host whose name contains `-dev`, and
 *   2. DEV_LIFE=1 is set explicitly.
 * And independently of those, every row it creates carries a `dev-` id prefix, and every
 * delete it performs is scoped to that prefix. So even a generator pointed at the wrong
 * database by a future mistake cannot touch a real person's data — the guards decide
 * whether it runs, the prefix decides what it can reach.
 */

import * as fs from "fs";
import * as os from "os";
import { PrismaClient, Prisma, WorkoutStatus, WorkoutSetType } from "@prisma/client";
import {
    buildPersonas, trainsOn, sessionKind, workingWeight, weeksTrained, bodyweightOn,
    isDeloadWeek, makeRng, hashSeed, pick, pickWeighted, clamp, roundToPlate,
    SESSION_MUSCLES, Persona
} from "./personas";
import {
    bytesPerWorkout, capacityReport, formatBytes, HostStat, TableStat, GIB, MIB
} from "./capacity";
import {
    GIVEN_NAMES_MALE, GIVEN_NAMES_FEMALE, FAMILY_NAMES, HANDLE_SUFFIXES, TRAINING_GOALS,
    EXPERIENCE_LABELS, COMMENTS_WORKOUT, COMMENTS_RECORD,
    REPLY_PHRASES, WORKOUT_NOTES, SESSION_TITLES, CARDIO_TYPES, FEATURE_REQUEST_IDEAS
} from "./content";

const DAY_MS = 86_400_000;
/** Sessions are scheduled in Kyiv hours; the rows themselves are UTC like everything else. */
const KYIV_OFFSET_MS = 3 * 60 * 60 * 1000;

const DEFAULTS = {
    users: 80,
    backfillDays: 120,
    retentionDays: 150,
    /** How many rows go in one createMany. Keeps peak memory flat on a 4 GB box. */
    chunk: 500
};

const MUSCLE_GROUPS = ["Груди", "Спина", "Ноги", "Плечі", "Біцепс", "Трицепс", "Прес", "Сідниці"];

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------------------

function assertDevDatabase(): void {
    const url = process.env.DATABASE_URL || "";
    if (!url) {
        fail("DATABASE_URL is not set.");
    }
    let host = "";
    try {
        host = new URL(url).hostname;
    } catch {
        fail("DATABASE_URL is not a parseable URL.");
    }
    // Production and development share the database NAME (`gymos`); only the host differs.
    // So the host is the only thing worth checking, and it is checked strictly.
    if (!/-dev(\b|$)/.test(host)) {
        fail(
            `Refusing to run: DATABASE_URL host is "${host}", which is not a development host.\n`
            + "  This tool only ever runs against a host whose name ends in -dev."
        );
    }
    if (process.env.DEV_LIFE !== "1") {
        fail("Refusing to run: set DEV_LIFE=1 to confirm this is the development environment.");
    }
}

function fail(message: string): never {
    process.stderr.write(`\ndev-life: ${message}\n\n`);
    process.exit(2);
}

// ---------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------

const dayIndexOf = (when: Date): number => Math.floor((when.getTime() + KYIV_OFFSET_MS) / DAY_MS);
const dateOfDayIndex = (dayIndex: number): Date => new Date(dayIndex * DAY_MS - KYIV_OFFSET_MS);

function arg(name: string, fallback: number): number {
    const raw = process.argv.find((item) => item.startsWith(`--${name}=`));
    const value = raw ? Number(raw.split("=")[1]) : NaN;
    return Number.isFinite(value) ? value : fallback;
}

function hasFlag(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

async function chunked<T>(rows: T[], size: number, run: (batch: T[]) => Promise<unknown>): Promise<void> {
    for (let index = 0; index < rows.length; index += size) {
        await run(rows.slice(index, index + size));
    }
}

function personas(count: number): Persona[] {
    return buildPersonas(count, {
        givenMale: GIVEN_NAMES_MALE,
        givenFemale: GIVEN_NAMES_FEMALE,
        family: FAMILY_NAMES,
        handleSuffixes: HANDLE_SUFFIXES,
        goals: TRAINING_GOALS,
        experience: EXPERIENCE_LABELS,
        muscleGroups: MUSCLE_GROUPS
    });
}

// ---------------------------------------------------------------------------------------
// Exercise catalogue
// ---------------------------------------------------------------------------------------

interface CatalogueEntry {
    id: string;
    name: string;
    primaryMuscleGroup: string;
    equipment: string;
    isTimed: boolean;
    /** What a strong lifter of average bodyweight could do, used as the progression ceiling. */
    ceiling: number;
}

/**
 * Read the catalogue and give every exercise a plausible strength ceiling.
 *
 * Derived from equipment and muscle group rather than stored, because the catalogue is
 * copied verbatim from production and must not be modified to suit the generator.
 */
async function loadCatalogue(): Promise<Map<string, CatalogueEntry[]>> {
    const rows = await prisma.exercise.findMany({
        where: { status: "approved" },
        select: { id: true, name: true, primaryMuscleGroup: true, equipment: true, isTimed: true }
    });
    if (!rows.length) {
        fail(
            "The exercise catalogue is empty.\n"
            + "  Copy it from production first (see scripts/dev-life-bootstrap.sh (catalogue copy))."
        );
    }
    const byMuscle = new Map<string, CatalogueEntry[]>();
    for (const row of rows) {
        const entry: CatalogueEntry = { ...row, ceiling: ceilingFor(row) };
        const list = byMuscle.get(row.primaryMuscleGroup) ?? [];
        list.push(entry);
        byMuscle.set(row.primaryMuscleGroup, list);
    }
    // Stable order so exercise choice is reproducible regardless of how Postgres returns rows.
    for (const list of byMuscle.values()) {
        list.sort((left, right) => left.id.localeCompare(right.id));
    }
    return byMuscle;
}

function ceilingFor(row: { primaryMuscleGroup: string; equipment: string; isTimed: boolean }): number {
    if (row.isTimed) {
        return 0; // held, not loaded
    }
    const byMuscle: Record<string, number> = {
        "Ноги": 150, "Спина": 110, "Груди": 100, "Сідниці": 120,
        "Плечі": 60, "Трицепс": 45, "Біцепс": 40, "Прес": 30, "Передпліччя": 35
    };
    const byEquipment: Record<string, number> = {
        "Штанга": 1.0, "Гантелі": 0.45, "Тренажер": 0.9, "Блок": 0.7,
        "Власна вага": 0.25, "Вага тіла": 0.25, "Гиря": 0.35, "Резинка": 0.15
    };
    const base = byMuscle[row.primaryMuscleGroup] ?? 60;
    return Math.max(8, base * (byEquipment[row.equipment] ?? 0.8));
}

// ---------------------------------------------------------------------------------------
// Session composition — pure enough to reason about, impure only in what it reads
// ---------------------------------------------------------------------------------------

interface PlannedSet {
    id: string;
    type: WorkoutSetType;
    weight: number;
    repetitions: number;
    durationSeconds: number | null;
    restSeconds: number;
    isCompleted: boolean;
}

interface PlannedExercise {
    id: string;
    exerciseId: string;
    order: number;
    supersetGroupId: string | null;
    sets: PlannedSet[];
}

interface PlannedWorkout {
    id: string;
    userId: string;
    date: Date;
    title: string;
    workoutType: string;
    notes: string | null;
    startAt: Date;
    exercises: PlannedExercise[];
    supersetGroupIds: { id: string; restSeconds: number }[];
    cardio: { type: string; durationMinutes: number; distance: number | null; calories: number } | null;
}

/**
 * Build one session for one person on one day.
 *
 * Deterministic from (persona, day): the same call always returns the same session, which
 * is what lets `populate` and `tick` write the same rows without coordinating.
 */
function planWorkout(
    persona: Persona,
    dayIndex: number,
    todayIndex: number,
    catalogue: Map<string, CatalogueEntry[]>
): PlannedWorkout | null {
    const kind = sessionKind(persona, dayIndex);
    const rng = makeRng(hashSeed(persona.id, "session", dayIndex));
    const weeks = weeksTrained(persona, dayIndex, todayIndex);
    const deload = isDeloadWeek(persona, dayIndex);

    const muscles = SESSION_MUSCLES[kind];
    const pool: CatalogueEntry[] = [];
    for (const muscle of muscles) {
        pool.push(...(catalogue.get(muscle) ?? []));
    }
    if (!pool.length) {
        return null;
    }

    // Between 3 and 6 exercises; cardio days are shorter and carry a run instead.
    const wanted = kind === "cardio" ? 2 : 3 + Math.floor(rng() * 4);
    const chosen: CatalogueEntry[] = [];
    const seen = new Set<string>();
    for (let slot = 0; slot < wanted * 3 && chosen.length < wanted; slot += 1) {
        const candidate = pool[Math.floor(makeRng(hashSeed(persona.id, dayIndex, "ex", slot))() * pool.length)];
        if (candidate && !seen.has(candidate.id)) {
            seen.add(candidate.id);
            chosen.push(candidate);
        }
    }
    if (!chosen.length) {
        return null;
    }

    const startHour = persona.preferredHour + (rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0);
    const startAt = new Date(
        dateOfDayIndex(dayIndex).getTime()
        + clamp(startHour, 5, 22) * 3_600_000
        + Math.floor(rng() * 55) * 60_000
    );

    // PRO members sometimes pair two exercises. Free accounts cannot create a superset, so
    // generating one for them would produce data the app itself would refuse to make.
    const supersetGroupIds: { id: string; restSeconds: number }[] = [];
    let supersetMembers: string[] = [];
    if (persona.role === "pro" && chosen.length >= 4 && rng() < 0.35) {
        const groupId = `dev-ss-${persona.index}-${dayIndex}`;
        supersetGroupIds.push({ id: groupId, restSeconds: pick(rng, [90, 120, 150, 180]) });
        supersetMembers = [chosen[1].id, chosen[2].id];
    }

    const exercises: PlannedExercise[] = chosen.map((entry, order) => {
        const setCount = deload ? 2 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * 2);
        const ceiling = entry.ceiling;
        const base = ceiling ? workingWeight(persona, ceiling, weeks, entry.id) : 0;
        const working = deload ? roundToPlate(base * 0.75) : base;
        const inSuperset = supersetMembers.includes(entry.id);
        const sets: PlannedSet[] = [];
        for (let index = 0; index < setCount; index += 1) {
            const setRng = makeRng(hashSeed(persona.id, dayIndex, entry.id, index));
            const warmup = index === 0 && !entry.isTimed && setRng() < 0.35;
            const reps = entry.isTimed ? 0 : clamp(Math.round(8 + (setRng() - 0.5) * 5 - index * 0.6), 3, 15);
            sets.push({
                id: `dev-s-${persona.index}-${dayIndex}-${order}-${index}`,
                type: warmup ? WorkoutSetType.warmup : setRng() < 0.06 ? WorkoutSetType.drop : WorkoutSetType.working,
                weight: entry.isTimed ? 0 : warmup ? roundToPlate(working * 0.5) : working,
                repetitions: reps,
                durationSeconds: entry.isTimed ? pick(setRng, [30, 40, 45, 60, 75, 90]) : null,
                restSeconds: inSuperset ? 0 : pick(setRng, [60, 75, 90, 120, 150]),
                isCompleted: true
            });
        }
        return {
            id: `dev-we-${persona.index}-${dayIndex}-${order}`,
            exerciseId: entry.id,
            order,
            supersetGroupId: inSuperset ? supersetGroupIds[0]?.id ?? null : null,
            sets
        };
    });

    const wantsCardio = kind === "cardio" || rng() < 0.18;
    const minutes = 18 + Math.floor(rng() * 30);

    return {
        id: `dev-w-${persona.index}-${dayIndex}`,
        userId: persona.id,
        date: dateOfDayIndex(dayIndex),
        title: pick(rng, SESSION_TITLES[kind] ?? SESSION_TITLES.full_body),
        workoutType: kind,
        notes: pick(rng, WORKOUT_NOTES) || null,
        startAt,
        exercises,
        supersetGroupIds,
        cardio: wantsCardio
            ? {
                type: pick(rng, CARDIO_TYPES),
                durationMinutes: minutes,
                distance: rng() < 0.7 ? Math.round(minutes * (0.13 + rng() * 0.06) * 100) / 100 : null,
                calories: Math.round(minutes * (7 + rng() * 4))
            }
            : null
    };
}

/** Epley, the same estimator the app uses, so generated records agree with computed ones. */
function oneRepMax(weight: number, reps: number): number {
    if (weight <= 0 || reps <= 0) {
        return 0;
    }
    return Math.round(weight * (1 + reps / 30) * 100) / 100;
}

// ---------------------------------------------------------------------------------------
// populate
// ---------------------------------------------------------------------------------------

async function populate(): Promise<void> {
    const userCount = arg("users", DEFAULTS.users);
    const backfillDays = arg("days", DEFAULTS.backfillDays);
    const chunk = arg("chunk", DEFAULTS.chunk);
    const people = personas(userCount);
    const todayIndex = dayIndexOf(new Date());
    const catalogue = await loadCatalogue();

    process.stdout.write(`dev-life: ${people.length} people, ${backfillDays} days of history\n`);

    // --- people -------------------------------------------------------------------------
    for (const persona of people) {
        const joined = new Date(Date.now() - persona.joinedDaysAgo * DAY_MS);
        await prisma.user.upsert({
            where: { id: persona.id },
            create: {
                id: persona.id,
                email: persona.email,
                displayName: persona.displayName,
                approved: true,
                role: persona.role,
                hideWorkoutDetails: persona.hideWorkoutDetails,
                privacyChoiceAt: joined,
                createdAt: joined,
                avatarUrl: null
            },
            update: {
                displayName: persona.displayName,
                role: persona.role,
                hideWorkoutDetails: persona.hideWorkoutDetails,
                approved: true
            }
        });
        await prisma.userProfile.upsert({
            where: { userId: persona.id },
            create: {
                id: `dev-p-${persona.index}`,
                userId: persona.id,
                name: persona.name,
                displayName: persona.displayName,
                height: persona.height,
                bodyweight: new Prisma.Decimal(persona.startBodyweight),
                birthYear: persona.birthYear,
                birthDate: `${persona.birthYear}-0${1 + (persona.index % 9)}-1${persona.index % 9}`,
                gender: persona.gender,
                trainingGoal: persona.goal,
                trainingExperience: persona.experience,
                favoriteMuscleGroup: persona.favoriteMuscleGroup
            },
            update: { bodyweight: new Prisma.Decimal(bodyweightOn(persona, persona.joinedDaysAgo / 7)) }
        });
    }
    process.stdout.write("  people ✓\n");

    // --- bodyweight history --------------------------------------------------------------
    const bodyweightRows: Prisma.UserBodyweightEntryCreateManyInput[] = [];
    for (const persona of people) {
        const span = Math.min(backfillDays, persona.joinedDaysAgo);
        for (let back = span; back >= 0; back -= 7) {
            const dayIndex = todayIndex - back;
            bodyweightRows.push({
                id: `dev-bw-${persona.index}-${dayIndex}`,
                userId: persona.id,
                date: dateOfDayIndex(dayIndex),
                bodyweight: new Prisma.Decimal(bodyweightOn(persona, weeksTrained(persona, dayIndex, todayIndex)))
            });
        }
    }
    await chunked(bodyweightRows, chunk, (batch) =>
        prisma.userBodyweightEntry.createMany({ data: batch, skipDuplicates: true }));
    process.stdout.write(`  bodyweight ✓ (${bodyweightRows.length})\n`);

    // --- training history ----------------------------------------------------------------
    // Written day by day rather than all at once: 80 people x 120 days is ~70 000 sets, and
    // holding all of it in memory at once on a 4 GB box shared with production is exactly
    // the kind of thing this tool must not do.
    let workoutTotal = 0;
    let setTotal = 0;
    const bestByUserExercise = new Map<string, number>();
    const recordRows: Prisma.PersonalRecordCreateManyInput[] = [];

    for (let back = backfillDays; back >= 1; back -= 1) {
        const dayIndex = todayIndex - back;
        const workouts: Prisma.WorkoutCreateManyInput[] = [];
        const groups: Prisma.SupersetGroupCreateManyInput[] = [];
        const workoutExercises: Prisma.WorkoutExerciseCreateManyInput[] = [];
        const sets: Prisma.WorkoutSetCreateManyInput[] = [];
        const cardio: Prisma.CardioSessionCreateManyInput[] = [];

        for (const persona of people) {
            if (back > persona.joinedDaysAgo || !trainsOn(persona, dayIndex)) {
                continue;
            }
            const plan = planWorkout(persona, dayIndex, todayIndex, catalogue);
            if (!plan) {
                continue;
            }
            const totalSets = plan.exercises.reduce((sum, item) => sum + item.sets.length, 0);
            const spanMinutes = Math.round(totalSets * 3.2 + (plan.cardio?.durationMinutes ?? 0));
            const lastSetAt = new Date(plan.startAt.getTime() + spanMinutes * 60_000);

            workouts.push({
                id: plan.id,
                userId: plan.userId,
                date: plan.date,
                title: plan.title,
                status: WorkoutStatus.completed,
                workoutType: plan.workoutType,
                startedAt: plan.startAt,
                finishedAt: lastSetAt,
                firstSetAt: plan.startAt,
                lastSetAt,
                notes: plan.notes,
                createdAt: plan.startAt,
                updatedAt: lastSetAt
            });
            for (const group of plan.supersetGroupIds) {
                groups.push({ id: group.id, workoutId: plan.id, restSeconds: group.restSeconds });
            }
            for (const exercise of plan.exercises) {
                workoutExercises.push({
                    id: exercise.id,
                    workoutId: plan.id,
                    exerciseId: exercise.exerciseId,
                    order: exercise.order,
                    supersetGroupId: exercise.supersetGroupId
                });
                for (const set of exercise.sets) {
                    sets.push({
                        id: set.id,
                        workoutExerciseId: exercise.id,
                        type: set.type,
                        weight: new Prisma.Decimal(set.weight),
                        repetitions: set.repetitions,
                        durationSeconds: set.durationSeconds,
                        restSeconds: set.restSeconds,
                        isCompleted: true
                    });
                    // A personal record is only a record if it beats what came before it,
                    // so this walks forward in time and keeps the running best.
                    const key = `${persona.id}:${exercise.exerciseId}`;
                    const estimate = oneRepMax(set.weight, set.repetitions);
                    if (estimate > 0 && estimate > (bestByUserExercise.get(key) ?? 0) * 1.005) {
                        bestByUserExercise.set(key, estimate);
                        if (recordRows.length < 4000) {
                            recordRows.push({
                                id: `dev-pr-${persona.index}-${dayIndex}-${exercise.order}`,
                                userId: persona.id,
                                exerciseId: exercise.exerciseId,
                                workoutId: plan.id,
                                type: "one_rep_max",
                                value: new Prisma.Decimal(estimate),
                                estimatedOneRepMax: new Prisma.Decimal(estimate),
                                weight: new Prisma.Decimal(set.weight),
                                repetitions: set.repetitions,
                                isEstimated: true,
                                recordedAt: lastSetAt
                            });
                        }
                    }
                }
            }
            if (plan.cardio) {
                cardio.push({
                    id: `dev-c-${persona.index}-${dayIndex}`,
                    workoutId: plan.id,
                    type: plan.cardio.type,
                    durationMinutes: plan.cardio.durationMinutes,
                    distance: plan.cardio.distance === null ? null : new Prisma.Decimal(plan.cardio.distance),
                    calories: plan.cardio.calories,
                    intensity: pick(makeRng(hashSeed(plan.id, "int")), ["low", "medium", "high"])
                });
            }
        }

        // Order matters: parents before children, or the foreign keys reject the batch.
        await prisma.workout.createMany({ data: workouts, skipDuplicates: true });
        await prisma.supersetGroup.createMany({ data: groups, skipDuplicates: true });
        await chunked(workoutExercises, chunk, (batch) =>
            prisma.workoutExercise.createMany({ data: batch, skipDuplicates: true }));
        await chunked(sets, chunk, (batch) =>
            prisma.workoutSet.createMany({ data: batch, skipDuplicates: true }));
        await prisma.cardioSession.createMany({ data: cardio, skipDuplicates: true });

        workoutTotal += workouts.length;
        setTotal += sets.length;
        if (back % 20 === 0) {
            process.stdout.write(`  history … ${backfillDays - back}/${backfillDays} days, ${workoutTotal} sessions\n`);
        }
    }
    await chunked(recordRows, chunk, (batch) =>
        prisma.personalRecord.createMany({ data: batch, skipDuplicates: true }));
    process.stdout.write(`  history ✓ (${workoutTotal} sessions, ${setTotal} sets, ${recordRows.length} records)\n`);

    await seedSocial(people, chunk);
    await seedIdeas(people);
    process.stdout.write("dev-life: populate done\n");
}

// ---------------------------------------------------------------------------------------
// Social layer
// ---------------------------------------------------------------------------------------

/**
 * Reactions, comments and the notifications they generate.
 *
 * Targets are drawn from RECENT sessions only. Nobody comments on a workout from four
 * months ago, and a feed whose interactions are spread evenly across all of history looks
 * like what it is.
 */
async function seedSocial(people: Persona[], chunk: number): Promise<void> {
    const recent = await prisma.workout.findMany({
        where: { id: { startsWith: "dev-w-" }, status: WorkoutStatus.completed },
        orderBy: { date: "desc" },
        take: 900,
        select: { id: true, userId: true, date: true, title: true }
    });
    if (!recent.length) {
        return;
    }
    const reactions: Prisma.FeedReactionCreateManyInput[] = [];
    const comments: Prisma.FeedCommentCreateManyInput[] = [];
    const notifications: Prisma.NotificationCreateManyInput[] = [];

    for (const workout of recent) {
        const rng = makeRng(hashSeed(workout.id, "social"));
        const audience = people.filter((person) => person.id !== workout.userId);
        const reactorCount = Math.floor(rng() * 5);
        for (let index = 0; index < reactorCount; index += 1) {
            const actor = audience[Math.floor(makeRng(hashSeed(workout.id, "react", index))() * audience.length)];
            if (!actor || makeRng(hashSeed(workout.id, "soc", actor.id))() > actor.sociability + 0.25) {
                continue;
            }
            reactions.push({
                id: `dev-r-${workout.id}-${actor.index}`,
                userId: actor.id,
                targetType: "workout",
                targetId: workout.id,
                kind: pickWeighted(rng, [["like", 6], ["fire", 3], ["strong", 2], ["clap", 1]]),
                createdAt: new Date(workout.date.getTime() + 3_600_000 + Math.floor(rng() * 20) * 3_600_000)
            });
            notifications.push({
                id: `dev-n-r-${workout.id}-${actor.index}`,
                userId: workout.userId,
                actorId: actor.id,
                type: "reaction",
                targetType: "workout",
                targetId: workout.id,
                preview: `${actor.displayName} відреагував на твоє тренування`,
                readAt: rng() < 0.6 ? new Date(workout.date.getTime() + 86_400_000) : null,
                createdAt: new Date(workout.date.getTime() + 4_000_000)
            });
        }

        if (rng() < 0.28) {
            const actor = audience[Math.floor(rng() * audience.length)];
            if (actor) {
                const rootId = `dev-cm-${workout.id}-${actor.index}`;
                const at = new Date(workout.date.getTime() + 5_400_000 + Math.floor(rng() * 10) * 3_600_000);
                comments.push({
                    id: rootId,
                    userId: actor.id,
                    targetType: "workout",
                    targetId: workout.id,
                    parentId: null,
                    body: pick(rng, COMMENTS_WORKOUT),
                    createdAt: at
                });
                notifications.push({
                    id: `dev-n-c-${rootId}`,
                    userId: workout.userId,
                    actorId: actor.id,
                    type: "comment",
                    targetType: "workout",
                    targetId: workout.id,
                    preview: `${actor.displayName}: ${pick(rng, COMMENTS_WORKOUT)}`.slice(0, 240),
                    readAt: null,
                    createdAt: at
                });
                // The owner answers about half the time — one level deep, as the model allows.
                if (rng() < 0.5) {
                    comments.push({
                        id: `dev-cm-${workout.id}-reply`,
                        userId: workout.userId,
                        targetType: "workout",
                        targetId: workout.id,
                        parentId: rootId,
                        body: pick(rng, REPLY_PHRASES),
                        createdAt: new Date(at.getTime() + 1_800_000)
                    });
                }
            }
        }
    }

    // Records are their own feed item, and they draw a different kind of comment. Without
    // this the record scope of the feed renders but never has anything to interact with,
    // which is precisely the state a dev environment is supposed to make impossible.
    const records = await prisma.personalRecord.findMany({
        where: { id: { startsWith: "dev-pr-" } },
        orderBy: { recordedAt: "desc" },
        take: 200,
        select: { id: true, userId: true, recordedAt: true }
    });
    for (const record of records) {
        const rng = makeRng(hashSeed(record.id, "prsocial"));
        const audience = people.filter((person) => person.id !== record.userId);
        const cheers = Math.floor(rng() * 4);
        for (let index = 0; index < cheers; index += 1) {
            const actor = audience[Math.floor(makeRng(hashSeed(record.id, "pr", index))() * audience.length)];
            if (!actor) {
                continue;
            }
            reactions.push({
                id: `dev-r-pr-${record.id}-${actor.index}`.slice(0, 60),
                userId: actor.id,
                targetType: "record",
                targetId: record.id,
                kind: pickWeighted(rng, [["fire", 5], ["strong", 4], ["like", 3]]),
                createdAt: new Date(record.recordedAt.getTime() + 3_600_000)
            });
        }
        if (rng() < 0.4) {
            const actor = audience[Math.floor(rng() * audience.length)];
            if (actor) {
                comments.push({
                    id: `dev-cm-pr-${record.id}`.slice(0, 60),
                    userId: actor.id,
                    targetType: "record",
                    targetId: record.id,
                    parentId: null,
                    body: pick(rng, COMMENTS_RECORD),
                    createdAt: new Date(record.recordedAt.getTime() + 5_400_000)
                });
            }
        }
    }

    await chunked(reactions, chunk, (batch) => prisma.feedReaction.createMany({ data: batch, skipDuplicates: true }));
    await chunked(comments, chunk, (batch) => prisma.feedComment.createMany({ data: batch, skipDuplicates: true }));
    await chunked(notifications, chunk, (batch) => prisma.notification.createMany({ data: batch, skipDuplicates: true }));
    process.stdout.write(`  social ✓ (${reactions.length} reactions, ${comments.length} comments)\n`);
}

async function seedIdeas(people: Persona[]): Promise<void> {
    const rows: Prisma.FeatureRequestCreateManyInput[] = FEATURE_REQUEST_IDEAS.map((idea, index) => {
        const author = people[(index * 7) % people.length];
        return {
            id: `dev-fr-${index}`,
            userId: author.id,
            type: idea.type,
            title: idea.title,
            description: idea.description,
            status: pick(makeRng(hashSeed("idea", index)), ["new", "new", "planned", "in_progress", "done"])
        };
    });
    await prisma.featureRequest.createMany({ data: rows, skipDuplicates: true });
}

// ---------------------------------------------------------------------------------------
// tick — the part that makes it feel alive
// ---------------------------------------------------------------------------------------

/**
 * Advance the world by however long it has been since the last run.
 *
 * Three things happen, in the order they happen in a real gym:
 *   1. somebody whose training hour has arrived starts a session (status `active`),
 *   2. an open session gets more of its sets ticked off as time passes,
 *   3. a session that has run its course is finished.
 * Then a handful of people react or comment on what has just appeared in the feed.
 *
 * The process starts, does a BOUNDED amount of work, and exits. It is deliberately not a
 * daemon: a long-lived Node process holding ~100 MB on a box that is already swapping is a
 * cost paid every minute of every day, for a job that takes two seconds.
 */
async function tick(): Promise<void> {
    const people = personas(arg("users", DEFAULTS.users));
    const now = new Date();
    const todayIndex = dayIndexOf(now);
    const catalogue = await loadCatalogue();
    let started = 0;
    let advanced = 0;
    let finished = 0;

    const byId = new Map(people.map((person) => [person.id, person]));

    // 1 + 2 + 3 — everybody who should be training today.
    for (const persona of people) {
        if (!trainsOn(persona, todayIndex)) {
            continue;
        }
        const plan = planWorkout(persona, todayIndex, todayIndex, catalogue);
        if (!plan || plan.startAt > now) {
            continue;
        }
        const elapsedMinutes = (now.getTime() - plan.startAt.getTime()) / 60_000;
        const totalSets = plan.exercises.reduce((sum, item) => sum + item.sets.length, 0);
        // One set roughly every three minutes, which is what a real session looks like once
        // rest is counted.
        const doneCount = clamp(Math.floor(elapsedMinutes / 3.2), 0, totalSets);
        if (doneCount <= 0) {
            continue;
        }
        const complete = doneCount >= totalSets;

        const existing = await prisma.workout.findUnique({
            where: { id: plan.id },
            select: { id: true, status: true }
        });

        if (!existing) {
            await writeSession(plan, complete ? doneCount : doneCount, now);
            started += 1;
            continue;
        }
        if (existing.status === WorkoutStatus.completed) {
            continue;
        }
        // Tick off whatever has become due since the last run, in plan order.
        const flatIds = plan.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id));
        const dueIds = flatIds.slice(0, doneCount);
        const { count } = await prisma.workoutSet.updateMany({
            where: { id: { in: dueIds }, isCompleted: false },
            data: { isCompleted: true }
        });
        if (count) {
            advanced += 1;
            await prisma.workout.update({
                where: { id: plan.id },
                data: { lastSetAt: now, updatedAt: now }
            });
        }
        if (complete) {
            await prisma.workout.update({
                where: { id: plan.id },
                data: { status: WorkoutStatus.completed, finishedAt: now, lastSetAt: now }
            });
            finished += 1;
        }
    }

    const social = await tickSocial(byId, now);
    process.stdout.write(
        `dev-life tick: ${started} started, ${advanced} advanced, ${finished} finished, `
        + `${social.reactions} reactions, ${social.comments} comments\n`
    );
}

/** Write a session that is under way: rows exist, only the due sets are ticked. */
async function writeSession(plan: PlannedWorkout, doneCount: number, now: Date): Promise<void> {
    const flat = plan.exercises.flatMap((exercise) => exercise.sets.map((set) => set.id));
    const due = new Set(flat.slice(0, doneCount));
    const complete = doneCount >= flat.length;
    await prisma.workout.create({
        data: {
            id: plan.id,
            userId: plan.userId,
            date: plan.date,
            title: plan.title,
            status: complete ? WorkoutStatus.completed : WorkoutStatus.active,
            workoutType: plan.workoutType,
            startedAt: plan.startAt,
            finishedAt: complete ? now : null,
            firstSetAt: plan.startAt,
            lastSetAt: now,
            notes: plan.notes,
            createdAt: plan.startAt,
            supersetGroups: { create: plan.supersetGroupIds.map((group) => ({ id: group.id, restSeconds: group.restSeconds })) },
            exercises: {
                create: plan.exercises.map((exercise) => ({
                    id: exercise.id,
                    exerciseId: exercise.exerciseId,
                    order: exercise.order,
                    supersetGroupId: exercise.supersetGroupId,
                    sets: {
                        create: exercise.sets.map((set) => ({
                            id: set.id,
                            type: set.type,
                            weight: new Prisma.Decimal(set.weight),
                            repetitions: set.repetitions,
                            durationSeconds: set.durationSeconds,
                            restSeconds: set.restSeconds,
                            isCompleted: due.has(set.id)
                        }))
                    }
                }))
            },
            cardioSessions: plan.cardio
                ? {
                    create: [{
                        id: `dev-c-${plan.id}`,
                        type: plan.cardio.type,
                        durationMinutes: plan.cardio.durationMinutes,
                        distance: plan.cardio.distance === null ? null : new Prisma.Decimal(plan.cardio.distance),
                        calories: plan.cardio.calories
                    }]
                }
                : undefined
        }
    });
}

/** A few interactions on whatever has appeared in the feed in the last day or so. */
async function tickSocial(byId: Map<string, Persona>, now: Date): Promise<{ reactions: number; comments: number }> {
    const since = new Date(now.getTime() - 36 * 3_600_000);
    const fresh = await prisma.workout.findMany({
        where: { id: { startsWith: "dev-w-" }, date: { gte: since } },
        orderBy: { date: "desc" },
        take: 60,
        select: { id: true, userId: true }
    });
    const people = [...byId.values()];
    const reactions: Prisma.FeedReactionCreateManyInput[] = [];
    const comments: Prisma.FeedCommentCreateManyInput[] = [];
    const notifications: Prisma.NotificationCreateManyInput[] = [];
    // Seeded on the CLOCK so consecutive ticks produce different interactions — this is the
    // one place determinism is the wrong answer, because the whole point is that the feed
    // keeps moving.
    const rng = makeRng(hashSeed("tick", Math.floor(now.getTime() / 60_000)));

    for (const workout of fresh) {
        if (rng() > 0.35) {
            continue;
        }
        const actor = people[Math.floor(rng() * people.length)];
        if (!actor || actor.id === workout.userId) {
            continue;
        }
        const stamp = Math.floor(now.getTime() / 60_000);
        reactions.push({
            id: `dev-rt-${workout.id}-${actor.index}-${stamp}`.slice(0, 60),
            userId: actor.id,
            targetType: "workout",
            targetId: workout.id,
            kind: pickWeighted(rng, [["like", 6], ["fire", 3], ["strong", 2]]),
            createdAt: now
        });
        notifications.push({
            id: `dev-nt-${workout.id}-${actor.index}-${stamp}`.slice(0, 60),
            userId: workout.userId,
            actorId: actor.id,
            type: "reaction",
            targetType: "workout",
            targetId: workout.id,
            preview: `${actor.displayName} відреагував на твоє тренування`,
            createdAt: now
        });
        if (rng() < 0.25) {
            comments.push({
                id: `dev-ct-${workout.id}-${actor.index}-${stamp}`.slice(0, 60),
                userId: actor.id,
                targetType: "workout",
                targetId: workout.id,
                parentId: null,
                body: pick(rng, COMMENTS_WORKOUT),
                createdAt: now
            });
        }
    }
    // skipDuplicates carries the idempotency: the unique key on (userId, targetType,
    // targetId) means a second reaction from the same person is simply dropped.
    //
    // Report what LANDED, not what was attempted. Most ticks propose reactions from people
    // who have already reacted, so the attempted count is roughly constant and says nothing
    // — a log line that always reads "20 reactions" is worse than no log line.
    const insertedReactions = await prisma.feedReaction.createMany({ data: reactions, skipDuplicates: true });
    const insertedComments = await prisma.feedComment.createMany({ data: comments, skipDuplicates: true });
    await prisma.notification.createMany({ data: notifications, skipDuplicates: true });
    return { reactions: insertedReactions.count, comments: insertedComments.count };
}

// ---------------------------------------------------------------------------------------
// stats / prune / wipe
// ---------------------------------------------------------------------------------------

async function stats(): Promise<void> {
    const tables = await prisma.$queryRaw<{ name: string; rows: bigint; bytes: bigint }[]>(Prisma.sql`
        SELECT relname AS name, n_live_tup AS rows, pg_total_relation_size(relid) AS bytes
        FROM pg_stat_user_tables ORDER BY bytes DESC
    `);
    const dbBytes = Number((await prisma.$queryRaw<{ size: bigint }[]>(
        Prisma.sql`SELECT pg_database_size(current_database()) AS size`
    ))[0].size);

    const stat: TableStat[] = tables.map((row) => ({
        name: row.name,
        rows: Number(row.rows),
        bytes: Number(row.bytes)
    }));
    const workouts = await prisma.workout.count({ where: { id: { startsWith: "dev-w-" } } });
    const users = await prisma.user.count({ where: { id: { startsWith: "dev-u-" } } });
    const perWorkout = bytesPerWorkout(stat, workouts);

    process.stdout.write("\n  TABLE                       ROWS        SIZE\n");
    for (const table of stat.slice(0, 12)) {
        process.stdout.write(
            `  ${table.name.padEnd(24)}${String(table.rows).padStart(8)}  ${formatBytes(table.bytes).padStart(10)}\n`
        );
    }

    const host = readHostStat();
    const retentionDays = arg("retention", DEFAULTS.retentionDays);
    // Steady-state sessions per day, measured from what is actually there rather than
    // assumed from the population size.
    const recentWorkouts = await prisma.workout.count({
        where: { id: { startsWith: "dev-w-" }, date: { gte: new Date(Date.now() - 14 * DAY_MS) } }
    });
    const workoutsPerDay = Math.max(1, Math.round(recentWorkouts / 14));
    const fixed = stat
        .filter((table) => ["Exercise", "User", "UserProfile", "UserBodyweightEntry", "StrengthStandard", "_prisma_migrations"].includes(table.name))
        .reduce((sum, table) => sum + table.bytes, 0);

    const report = capacityReport(
        host,
        { workoutsPerDay, bytesPerWorkout: perWorkout, retentionDays },
        dbBytes,
        fixed,
        Number(process.env.DEV_LIFE_TICK_PEAK_MB || 78)
    );

    process.stdout.write(
        `\n  dev users ${users} · sessions ${workouts} · ${workoutsPerDay}/day`
        + ` · ${formatBytes(perWorkout)} per session · db ${formatBytes(dbBytes)}\n\n`
    );
    for (const verdict of report.verdicts) {
        const mark = verdict.severity === "ok" ? "ok   " : verdict.severity === "watch" ? "watch" : "UPGRADE";
        process.stdout.write(`  [${mark}] ${verdict.resource.padEnd(7)} ${verdict.headline}\n           ${verdict.detail}\n`);
    }
    process.stdout.write(`\n  → ${report.recommendation}\n\n`);
}

/** Host numbers, read from /proc so this works without any extra dependency. */
function readHostStat(): HostStat {
    const meminfo = safeRead("/proc/meminfo");
    const value = (key: string): number => {
        const match = meminfo.match(new RegExp(`^${key}:\\s+(\\d+) kB`, "m"));
        return match ? Number(match[1]) / 1024 : 0;
    };
    const swapTotal = value("SwapTotal");
    let diskTotalBytes = 0;
    let diskUsedBytes = 0;
    try {
        const stat = fs.statfsSync("/");
        diskTotalBytes = Number(stat.blocks) * Number(stat.bsize);
        diskUsedBytes = diskTotalBytes - Number(stat.bavail) * Number(stat.bsize);
    } catch {
        diskTotalBytes = 38 * GIB;
        diskUsedBytes = 19 * GIB;
    }
    return {
        diskTotalBytes,
        diskUsedBytes,
        memTotalMb: value("MemTotal") || os.totalmem() / MIB,
        memAvailableMb: value("MemAvailable") || os.freemem() / MIB,
        swapUsedMb: Math.max(0, swapTotal - value("SwapFree")),
        vcpu: os.cpus().length || 1,
        loadAvg1: os.loadavg()[0]
    };
}

function safeRead(path: string): string {
    try {
        return fs.readFileSync(path, "utf8");
    } catch {
        return "";
    }
}

/**
 * Drop generated history older than the retention window.
 *
 * This is what keeps the database from growing without bound, and therefore what makes the
 * capacity answer "it settles" rather than "it fills the disk eventually". Cascades handle
 * the children — deleting a Workout takes its exercises, sets and cardio with it.
 */
async function prune(): Promise<void> {
    const retentionDays = arg("retention", DEFAULTS.retentionDays);
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
    const workouts = await prisma.workout.deleteMany({
        where: { id: { startsWith: "dev-w-" }, date: { lt: cutoff } }
    });
    const notifications = await prisma.notification.deleteMany({
        where: { id: { startsWith: "dev-n" }, createdAt: { lt: cutoff } }
    });
    const bodyweight = await prisma.userBodyweightEntry.deleteMany({
        where: { id: { startsWith: "dev-bw-" }, date: { lt: cutoff } }
    });
    process.stdout.write(
        `dev-life prune: ${workouts.count} sessions, ${notifications.count} notifications,`
        + ` ${bodyweight.count} weigh-ins older than ${retentionDays} days\n`
    );
}

/** Remove the whole synthetic population. Scoped to the `dev-` prefix, always. */
async function wipe(): Promise<void> {
    if (!hasFlag("yes")) {
        fail("wipe removes every generated row. Re-run with --yes if that is what you want.");
    }
    const feed = await prisma.feedReaction.deleteMany({ where: { id: { startsWith: "dev-" } } });
    const comments = await prisma.feedComment.deleteMany({ where: { id: { startsWith: "dev-" } } });
    const notifications = await prisma.notification.deleteMany({ where: { id: { startsWith: "dev-" } } });
    const ideas = await prisma.featureRequest.deleteMany({ where: { id: { startsWith: "dev-" } } });
    // Users cascade to profiles, workouts, sets, records and bodyweight entries.
    const users = await prisma.user.deleteMany({ where: { id: { startsWith: "dev-u-" } } });
    process.stdout.write(
        `dev-life wipe: ${users.count} people (with all their sessions), ${feed.count} reactions,`
        + ` ${comments.count} comments, ${notifications.count} notifications, ${ideas.count} ideas\n`
    );
}

// ---------------------------------------------------------------------------------------

async function main(): Promise<void> {
    const command = process.argv[2];
    if (!command || command === "help" || command === "--help") {
        process.stdout.write(
            "dev-life <populate|tick|stats|prune|wipe>\n"
            + "  --users=N       population size (default 80)\n"
            + "  --days=N        days of history to backfill (default 120)\n"
            + "  --retention=N   days of history to keep when pruning (default 150)\n"
            + "  --chunk=N       rows per insert batch (default 500)\n"
        );
        return;
    }
    // `stats` only reads, but it reads the DEV database and nothing else — the same guard
    // applies so there is exactly one rule to remember.
    assertDevDatabase();
    const commands: Record<string, () => Promise<void>> = { populate, tick, stats, prune, wipe };
    const run = commands[command];
    if (!run) {
        fail(`Unknown command "${command}".`);
    }
    const startedAt = Date.now();
    await run();
    if (command !== "stats") {
        // Reported because the capacity answer depends on it: this process runs on a box
        // that is also serving production, and "how much does one tick cost" should be a
        // measurement rather than the 130 MB somebody once guessed. Node exposes no true
        // high-water mark, but it rarely returns memory to the OS, so RSS at exit is
        // within a few MB of the peak.
        const rssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
        process.stdout.write(`  (${((Date.now() - startedAt) / 1000).toFixed(1)}s, ${rssMb} MB rss)\n`);
    }
}

main()
    .catch((error) => {
        process.stderr.write(`dev-life failed: ${(error as Error).message}\n`);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
