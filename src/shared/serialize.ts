/**
 * The wire shapes the scoring kernel consumes.
 *
 * /export and /scoring must feed the kernel BYTE-EQUIVALENT data, or the two will
 * disagree about somebody's level while both look correct. They therefore share these
 * functions rather than each maintaining its own mapping — the failure mode of two
 * near-identical serializers is that one gains a field or a rounding and nobody notices
 * until a number moves.
 *
 * TIMEZONE. dateInput reads the host's local calendar, so the date STRING a workout gets
 * depends on the process timezone: a workout stored at 22:00Z becomes "2026-07-20" in
 * UTC and "2026-07-21" in Kyiv. That has always been true of /export, and changing it
 * would shift dates for existing workouts, so it is preserved rather than corrected.
 * Pin the backend to the gym's timezone; see the note at the top of the scoring kernel.
 */

export function numberValue(value: unknown, fallback: number): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}

export function dateInput(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type WorkoutRow = {
    id: string;
    userId: string;
    date: Date;
    title: string;
    status: string;
    workoutType: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    durationOverride: number | null;
    notes: string | null;
    exercises: Array<{
        id: string;
        exerciseId: string;
        order: number;
        notes: string | null;
        sets: Array<{
            id: string;
            type: string;
            weight: unknown;
            repetitions: number;
            durationSeconds: number | null;
            rpe: unknown;
            restSeconds: number;
            isCompleted: boolean;
            notes: string | null;
        }>;
    }>;
    cardioSessions: Array<{
        id: string;
        type: string;
        durationMinutes: number;
        distance: unknown;
        calories: number | null;
        averageHeartRate: number | null;
        intensity: string | null;
        notes: string | null;
    }>;
};

/**
 * Callers MUST pass workouts ordered `date DESC`. The kernel breaks tied one-rep-max
 * records by visit order, so ascending input silently resolves every tie to the earlier
 * date — moving displayed PR dates, the first-pr and pr-25 unlock dates, and the XP
 * ledger. This is the single easiest thing to get wrong here.
 */
/**
 * Scalars every workout row carries, in BOTH shapes.
 *
 * This is the single most load-bearing decision in the windowed payload. Because a
 * summary carries the same aggregates as a hydrated row, one renderer serves both —
 * the history list, the activity feed and the day sheet read only these numbers and
 * never touch `exercises`. Without them, repointing any peer surface at summaries
 * would make its renderer throw for every other caller too.
 */
function workoutAggregates(item: WorkoutRow) {
    let setCount = 0;
    let workingSetCount = 0;
    let totalVolume = 0;
    for (const exercise of item.exercises) {
        for (const set of exercise.sets) {
            if (!set.isCompleted) {
                continue;
            }
            setCount += 1;
            if (set.type !== "warmup") {
                workingSetCount += 1;
            }
            totalVolume += numberValue(set.weight, 0) * set.repetitions;
        }
    }
    const cardioMinutes = item.cardioSessions.reduce((sum, session) => sum + session.durationMinutes, 0);
    // Mirrors the kernel's duration(): a manual override wins over the clock.
    const clockMinutes = item.startedAt && item.finishedAt
        ? Math.max(0, Math.round((item.finishedAt.getTime() - item.startedAt.getTime()) / 60000))
        : 0;
    return {
        exerciseCount: item.exercises.length,
        setCount,
        workingSetCount,
        totalVolume: Math.round(totalVolume * 10) / 10,
        cardioMinutes,
        cardioCount: item.cardioSessions.length,
        durationMinutes: item.durationOverride != null ? Math.max(0, Math.round(item.durationOverride)) : clockMinutes
    };
}

/**
 * A peer's workout without its sets.
 *
 * `exercises` and `cardioSessions` are ABSENT, not empty. An empty array would let
 * every unguarded consumer quietly compute zero — a teammate showing 0 kg lifted looks
 * like a bad workout, not like a bug. A missing key throws on first dereference, which
 * is the only way a mistake here gets noticed.
 */
export function serializeWorkoutSummary(item: WorkoutRow) {
    return {
        id: item.id,
        userId: item.userId,
        date: dateInput(item.date),
        title: item.title,
        status: item.status,
        workoutType: item.workoutType,
        notes: item.notes || "",
        ...workoutAggregates(item)
    };
}

export function serializeWorkout(item: WorkoutRow) {
    return {
        hydrated: true as const,
        ...workoutAggregates(item),
        id: item.id,
        userId: item.userId,
        date: dateInput(item.date),
        title: item.title,
        status: item.status,
        workoutType: item.workoutType,
        startedAt: item.startedAt?.toISOString() || null,
        finishedAt: item.finishedAt?.toISOString() || null,
        durationOverride: item.durationOverride ?? null,
        notes: item.notes || "",
        exercises: item.exercises.map((exercise) => ({
            id: exercise.id,
            exerciseId: exercise.exerciseId,
            order: exercise.order,
            notes: exercise.notes || "",
            sets: exercise.sets.map((set) => ({
                id: set.id,
                type: set.type,
                weight: numberValue(set.weight, 0),
                repetitions: set.repetitions,
                durationSeconds: set.durationSeconds ?? null,
                rpe: numberValue(set.rpe, 0),
                restSeconds: set.restSeconds,
                isCompleted: set.isCompleted,
                notes: set.notes || ""
            }))
        })),
        cardioSessions: item.cardioSessions.map((session) => ({
            id: session.id,
            type: session.type,
            durationMinutes: session.durationMinutes,
            distance: numberValue(session.distance, 0),
            calories: session.calories || 0,
            averageHeartRate: session.averageHeartRate || 0,
            intensity: session.intensity || "medium",
            notes: session.notes || ""
        }))
    };
}
