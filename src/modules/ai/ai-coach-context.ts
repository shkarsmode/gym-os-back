import { PrismaService } from "../../prisma/prisma.service";
import { COACH_HISTORY_WEEKS, COACH_MAX_EXERCISE_TRACKS } from "./ai.constants";

// ---------------------------------------------------------------------------
// The training packet handed to the coach model.
//
// Every number here is computed deterministically from the database. The model is
// never given raw sets and is never asked to do arithmetic: it receives finished
// metrics and only interprets them. That is what keeps the advice grounded — a
// language model asked to add up 900 sets will confidently get it wrong, and a
// wrong volume number poisons every conclusion drawn from it.
//
// It is also a token budget: a year of training is tens of thousands of sets, but
// this packet stays a few kilobytes no matter how long the user has trained.
// ---------------------------------------------------------------------------

export interface CoachContext {
    generatedAt: string;
    profile: {
        displayName: string;
        age: number | null;
        gender: string;
        heightCm: number | null;
        bodyweightKg: number | null;
        goal: string | null;
        experience: string | null;
        memberForDays: number;
    };
    totals: {
        workouts: number;
        workoutsInPeriod: number;
        completedSets: number;
        totalVolumeKg: number;
        periodWeeks: number;
        firstWorkoutDate: string | null;
        lastWorkoutDate: string | null;
        daysSinceLastWorkout: number | null;
    };
    frequency: {
        sessionsPerWeek: number;
        weeklySessions: { week: string; sessions: number; volumeKg: number }[];
        weekdayPattern: { weekday: string; sessions: number }[];
        longestGapDays: number;
        currentStreakWeeks: number;
    };
    muscleVolume: {
        group: string;
        volumeKg: number;
        sets: number;
        setsPerWeek: number;
        sharePercent: number;
        trendPercent: number | null;
    }[];
    balance: {
        pushPullRatio: number | null;
        upperLowerRatio: number | null;
        quadHamstringRatio: number | null;
        neglected: string[];
    };
    exercises: {
        name: string;
        muscleGroup: string;
        sessions: number;
        lastPerformed: string;
        bestWeightKg: number;
        bestEstimated1RM: number;
        firstEstimated1RM: number;
        changePercent: number | null;
        weeksSinceBest: number;
        stalled: boolean;
        recentTopSets: { date: string; weightKg: number; reps: number }[];
    }[];
    setQuality: {
        workingSetShare: number;
        averageReps: number | null;
        averageRpe: number | null;
        averageRestSeconds: number | null;
        repRangeSplit: { strength1to5: number; hypertrophy6to12: number; endurance13plus: number };
    };
    bodyweight: {
        currentKg: number | null;
        changeKg: number | null;
        trend: "up" | "down" | "flat" | null;
        points: { date: string; kg: number }[];
    };
    cardio: { sessions: number; minutes: number; minutesPerWeek: number };
    standards: {
        exercise: string;
        bestWeightKg: number;
        level: string;
        nextLevel: string | null;
        kgToNextLevel: number | null;
    }[];
    recentWorkouts: {
        date: string;
        type: string;
        exercises: number;
        sets: number;
        volumeKg: number;
        durationMinutes: number | null;
    }[];
}

type SetRow = {
    weight: number;
    repetitions: number;
    rpe: number | null;
    restSeconds: number;
    type: string;
    isCompleted: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["неділя", "понеділок", "вівторок", "середа", "четвер", "пʼятниця", "субота"];

// Epley, matching lib/scoring.js on the client so the coach and the UI never
// disagree about what a set is "worth".
function estimate1RM(weight: number, reps: number): number {
    if (weight <= 0 || reps <= 0) {
        return 0;
    }
    return round(weight * (1 + reps / 30), 1);
}

function round(value: number, digits = 1): number {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
}

function decimal(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function isoDay(date: Date): string {
    return date.toISOString().slice(0, 10);
}

// ISO-ish week key (Monday-anchored) used to bucket sessions and volume.
function weekKey(date: Date): string {
    const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = copy.getUTCDay() || 7;
    copy.setUTCDate(copy.getUTCDate() - day + 1);
    return isoDay(copy);
}

export async function buildCoachContext(prisma: PrismaService, userId: string): Promise<CoachContext> {
    const now = new Date();
    const periodStart = new Date(now.getTime() - COACH_HISTORY_WEEKS * 7 * MS_PER_DAY);

    const [user, workouts, allWorkoutCount, bodyweightEntries, standards] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
        prisma.workout.findMany({
            where: { userId, status: "completed", date: { gte: periodStart } },
            orderBy: { date: "asc" },
            include: {
                exercises: { include: { sets: true, exercise: { select: { name: true, primaryMuscleGroup: true } } } },
                cardioSessions: true
            }
        }),
        prisma.workout.count({ where: { userId, status: "completed" } }),
        prisma.userBodyweightEntry.findMany({ where: { userId }, orderBy: { date: "asc" }, take: 200 }),
        prisma.strengthStandard.findMany({ take: 600, include: { exercise: { select: { name: true } } } })
    ]);

    const profileRow = user?.profile || null;
    const bodyweightKg = bodyweightEntries.length
        ? decimal(bodyweightEntries[bodyweightEntries.length - 1].bodyweight)
        : profileRow?.bodyweight
            ? decimal(profileRow.bodyweight)
            : null;

    // ---- flatten once; every aggregate below reads from these ----
    const completedSets: { set: SetRow; date: Date; exercise: string; muscle: string }[] = [];
    const perWeek = new Map<string, { sessions: number; volume: number }>();
    const perWeekday = new Map<number, number>();
    const perMuscle = new Map<string, { volume: number; sets: number; recentVolume: number; earlierVolume: number }>();
    const perExercise = new Map<string, {
        muscle: string;
        sessions: Set<string>;
        best: { weight: number; reps: number; e1rm: number; date: Date } | null;
        first: { e1rm: number; date: Date } | null;
        topSets: { date: string; weightKg: number; reps: number; e1rm: number }[];
        lastDate: Date;
    }>();

    const midpoint = new Date(now.getTime() - (COACH_HISTORY_WEEKS / 2) * 7 * MS_PER_DAY);
    let totalVolume = 0;
    let workingSets = 0;
    let repsSum = 0;
    let repsCount = 0;
    let rpeSum = 0;
    let rpeCount = 0;
    let restSum = 0;
    let restCount = 0;
    const repRange = { strength1to5: 0, hypertrophy6to12: 0, endurance13plus: 0 };

    for (const workout of workouts) {
        const date = new Date(workout.date);
        const key = weekKey(date);
        const week = perWeek.get(key) || { sessions: 0, volume: 0 };
        week.sessions += 1;
        perWeek.set(key, week);
        perWeekday.set(date.getUTCDay(), (perWeekday.get(date.getUTCDay()) || 0) + 1);

        for (const workoutExercise of workout.exercises) {
            const name = workoutExercise.exercise?.name || "Невідома вправа";
            const muscle = workoutExercise.exercise?.primaryMuscleGroup || "Інше";
            const done = workoutExercise.sets.filter((set) => set.isCompleted);
            if (!done.length) {
                continue;
            }

            const track = perExercise.get(name) || {
                muscle,
                sessions: new Set<string>(),
                best: null,
                first: null,
                topSets: [],
                lastDate: date
            };
            track.sessions.add(isoDay(date));
            track.lastDate = date;

            let sessionTop: { weight: number; reps: number; e1rm: number } | null = null;

            for (const raw of done) {
                const weight = decimal(raw.weight);
                const reps = Number(raw.repetitions) || 0;
                const volume = weight * reps;
                totalVolume += volume;
                week.volume += volume;

                const bucket = perMuscle.get(muscle) || { volume: 0, sets: 0, recentVolume: 0, earlierVolume: 0 };
                bucket.volume += volume;
                bucket.sets += 1;
                if (date >= midpoint) {
                    bucket.recentVolume += volume;
                } else {
                    bucket.earlierVolume += volume;
                }
                perMuscle.set(muscle, bucket);

                if (raw.type === "working") {
                    workingSets += 1;
                }
                if (reps > 0) {
                    repsSum += reps;
                    repsCount += 1;
                    if (reps <= 5) {
                        repRange.strength1to5 += 1;
                    } else if (reps <= 12) {
                        repRange.hypertrophy6to12 += 1;
                    } else {
                        repRange.endurance13plus += 1;
                    }
                }
                if (raw.rpe !== null && raw.rpe !== undefined) {
                    const rpe = decimal(raw.rpe);
                    if (rpe > 0) {
                        rpeSum += rpe;
                        rpeCount += 1;
                    }
                }
                if (Number.isFinite(raw.restSeconds)) {
                    restSum += Number(raw.restSeconds);
                    restCount += 1;
                }

                completedSets.push({
                    set: {
                        weight,
                        repetitions: reps,
                        rpe: raw.rpe === null || raw.rpe === undefined ? null : decimal(raw.rpe),
                        restSeconds: Number(raw.restSeconds) || 0,
                        type: String(raw.type),
                        isCompleted: true
                    },
                    date,
                    exercise: name,
                    muscle
                });

                const e1rm = estimate1RM(weight, reps);
                if (!sessionTop || e1rm > sessionTop.e1rm) {
                    sessionTop = { weight, reps, e1rm };
                }
                if (!track.best || e1rm > track.best.e1rm) {
                    track.best = { weight, reps, e1rm, date };
                }
                if (!track.first) {
                    track.first = { e1rm, date };
                }
            }

            if (sessionTop) {
                track.topSets.push({ date: isoDay(date), weightKg: sessionTop.weight, reps: sessionTop.reps, e1rm: sessionTop.e1rm });
            }
            perExercise.set(name, track);
        }
    }

    // ---- frequency ----
    const weeklySessions = [...perWeek.entries()]
        .sort((left, right) => (left[0] < right[0] ? -1 : 1))
        .map(([week, value]) => ({ week, sessions: value.sessions, volumeKg: round(value.volume) }));
    const activeWeeks = weeklySessions.length || 1;
    const sessionsPerWeek = round(workouts.length / Math.max(1, Math.min(COACH_HISTORY_WEEKS, activeWeeks)), 2);

    const dates = workouts.map((workout) => new Date(workout.date));
    let longestGapDays = 0;
    for (let index = 1; index < dates.length; index += 1) {
        const gap = Math.round((dates[index].getTime() - dates[index - 1].getTime()) / MS_PER_DAY);
        longestGapDays = Math.max(longestGapDays, gap);
    }
    // Consecutive most-recent weeks that contain at least one session.
    let currentStreakWeeks = 0;
    for (let index = 0; index < COACH_HISTORY_WEEKS; index += 1) {
        const key = weekKey(new Date(now.getTime() - index * 7 * MS_PER_DAY));
        if (perWeek.has(key)) {
            currentStreakWeeks += 1;
        } else if (index > 0) {
            break;
        }
    }

    // ---- muscle split ----
    const muscleVolume = [...perMuscle.entries()]
        .map(([group, value]) => ({
            group,
            volumeKg: round(value.volume),
            sets: value.sets,
            setsPerWeek: round(value.sets / Math.max(1, activeWeeks), 1),
            sharePercent: totalVolume > 0 ? round((value.volume / totalVolume) * 100, 1) : 0,
            trendPercent: value.earlierVolume > 0
                ? round(((value.recentVolume - value.earlierVolume) / value.earlierVolume) * 100)
                : null
        }))
        .sort((left, right) => right.volumeKg - left.volumeKg);

    const volumeOf = (groups: string[]) => muscleVolume
        .filter((item) => groups.some((group) => item.group.toLowerCase().includes(group)))
        .reduce((sum, item) => sum + item.volumeKg, 0);
    const pushVolume = volumeOf(["груди", "трицепс", "плеч"]);
    const pullVolume = volumeOf(["спина", "біцепс"]);
    const upperVolume = pushVolume + pullVolume;
    const lowerVolume = volumeOf(["квадрицепс", "стегн", "литк", "сідни"]);
    const quadVolume = volumeOf(["квадрицепс"]);
    const hamVolume = volumeOf(["задня поверхня стегна", "стегн"]);

    // ---- exercise tracks ----
    const exercises = [...perExercise.entries()]
        .map(([name, track]) => {
            const best = track.best;
            const weeksSinceBest = best ? Math.floor((now.getTime() - best.date.getTime()) / (7 * MS_PER_DAY)) : 0;
            const firstE1rm = track.first?.e1rm || 0;
            const bestE1rm = best?.e1rm || 0;
            return {
                name,
                muscleGroup: track.muscle,
                sessions: track.sessions.size,
                lastPerformed: isoDay(track.lastDate),
                bestWeightKg: round(best?.weight || 0),
                bestEstimated1RM: round(bestE1rm),
                firstEstimated1RM: round(firstE1rm),
                changePercent: firstE1rm > 0 ? round(((bestE1rm - firstE1rm) / firstE1rm) * 100) : null,
                weeksSinceBest,
                // "Stalled" is a fact about the log, not an opinion: trained often
                // enough to progress, yet no new best in a month.
                stalled: track.sessions.size >= 3 && weeksSinceBest >= 4,
                recentTopSets: track.topSets.slice(-6).map((item) => ({ date: item.date, weightKg: round(item.weightKg), reps: item.reps }))
            };
        })
        .sort((left, right) => right.sessions - left.sessions)
        .slice(0, COACH_MAX_EXERCISE_TRACKS);

    // ---- strength standards (bodyweight-adjusted level per lift) ----
    const standardRows = standards.filter((row) => row.exercise?.name);
    const standardsOut: CoachContext["standards"] = [];
    if (bodyweightKg) {
        const gender = profileRow?.gender || "male";
        for (const exercise of exercises) {
            const matching = standardRows
                .filter((row) => row.exercise.name.toLowerCase() === exercise.name.toLowerCase()
                    && (!row.gender || row.gender === gender)
                    && decimal(row.bodyweightMin) <= bodyweightKg
                    && decimal(row.bodyweightMax) >= bodyweightKg)
                .sort((left, right) => decimal(left.requiredWeight) - decimal(right.requiredWeight));
            if (!matching.length) {
                continue;
            }
            let level = "below_beginner";
            let next: typeof matching[number] | null = matching[0];
            for (const row of matching) {
                if (exercise.bestWeightKg >= decimal(row.requiredWeight)) {
                    level = row.level;
                    next = null;
                } else {
                    next = next && decimal(next.requiredWeight) > decimal(row.requiredWeight) ? next : row;
                    break;
                }
            }
            standardsOut.push({
                exercise: exercise.name,
                bestWeightKg: exercise.bestWeightKg,
                level,
                nextLevel: next ? next.level : null,
                kgToNextLevel: next ? round(decimal(next.requiredWeight) - exercise.bestWeightKg) : null
            });
        }
    }

    // ---- bodyweight ----
    const bwPoints = bodyweightEntries.slice(-12).map((entry) => ({ date: isoDay(new Date(entry.date)), kg: round(decimal(entry.bodyweight)) }));
    const bwChange = bwPoints.length >= 2 ? round(bwPoints[bwPoints.length - 1].kg - bwPoints[0].kg) : null;

    // ---- cardio ----
    const cardioSessions = workouts.flatMap((workout) => workout.cardioSessions);
    const cardioMinutes = cardioSessions.reduce((sum, session) => sum + (Number(session.durationMinutes) || 0), 0);

    const lastWorkout = workouts[workouts.length - 1] || null;
    const firstWorkout = workouts[0] || null;

    return {
        generatedAt: now.toISOString(),
        profile: {
            displayName: user?.displayName || "Учасник",
            age: profileRow?.birthYear ? now.getUTCFullYear() - Number(profileRow.birthYear) : null,
            gender: profileRow?.gender || "male",
            heightCm: profileRow?.height ?? null,
            bodyweightKg: bodyweightKg === null ? null : round(bodyweightKg),
            goal: profileRow?.trainingGoal ?? null,
            experience: profileRow?.trainingExperience ?? null,
            memberForDays: user ? Math.max(0, Math.round((now.getTime() - new Date(user.createdAt).getTime()) / MS_PER_DAY)) : 0
        },
        totals: {
            workouts: allWorkoutCount,
            workoutsInPeriod: workouts.length,
            completedSets: completedSets.length,
            totalVolumeKg: round(totalVolume),
            periodWeeks: COACH_HISTORY_WEEKS,
            firstWorkoutDate: firstWorkout ? isoDay(new Date(firstWorkout.date)) : null,
            lastWorkoutDate: lastWorkout ? isoDay(new Date(lastWorkout.date)) : null,
            daysSinceLastWorkout: lastWorkout
                ? Math.max(0, Math.round((now.getTime() - new Date(lastWorkout.date).getTime()) / MS_PER_DAY))
                : null
        },
        frequency: {
            sessionsPerWeek,
            weeklySessions,
            weekdayPattern: [...perWeekday.entries()]
                .sort((left, right) => right[1] - left[1])
                .map(([day, sessions]) => ({ weekday: WEEKDAYS[day] || String(day), sessions })),
            longestGapDays,
            currentStreakWeeks
        },
        muscleVolume,
        balance: {
            pushPullRatio: pullVolume > 0 ? round(pushVolume / pullVolume, 2) : null,
            upperLowerRatio: lowerVolume > 0 ? round(upperVolume / lowerVolume, 2) : null,
            quadHamstringRatio: hamVolume > 0 ? round(quadVolume / hamVolume, 2) : null,
            neglected: muscleVolume.filter((item) => item.setsPerWeek < 4).map((item) => item.group)
        },
        exercises,
        setQuality: {
            workingSetShare: completedSets.length ? round((workingSets / completedSets.length) * 100) : 0,
            averageReps: repsCount ? round(repsSum / repsCount, 1) : null,
            averageRpe: rpeCount ? round(rpeSum / rpeCount, 1) : null,
            averageRestSeconds: restCount ? Math.round(restSum / restCount) : null,
            repRangeSplit: repRange
        },
        bodyweight: {
            currentKg: bwPoints.length ? bwPoints[bwPoints.length - 1].kg : (bodyweightKg === null ? null : round(bodyweightKg)),
            changeKg: bwChange,
            trend: bwChange === null ? null : bwChange > 0.7 ? "up" : bwChange < -0.7 ? "down" : "flat",
            points: bwPoints
        },
        cardio: {
            sessions: cardioSessions.length,
            minutes: cardioMinutes,
            minutesPerWeek: round(cardioMinutes / Math.max(1, activeWeeks))
        },
        standards: standardsOut,
        recentWorkouts: workouts.slice(-8).map((workout) => {
            const sets = workout.exercises.flatMap((item) => item.sets.filter((set) => set.isCompleted));
            return {
                date: isoDay(new Date(workout.date)),
                type: workout.workoutType,
                exercises: workout.exercises.length,
                sets: sets.length,
                volumeKg: round(sets.reduce((sum, set) => sum + decimal(set.weight) * (Number(set.repetitions) || 0), 0)),
                durationMinutes: workout.durationOverride
                    ?? (workout.startedAt && workout.finishedAt
                        ? Math.round((new Date(workout.finishedAt).getTime() - new Date(workout.startedAt).getTime()) / 60000)
                        : null)
            };
        })
    };
}
