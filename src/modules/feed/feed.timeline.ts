// Pure timeline/pagination logic for Стрічка, kept out of FeedService so it can be
// tested without a database. Everything here is a total function over plain data.

export type FeedItemType = "workout" | "achievement" | "record";

// A page boundary is a POSITION, not an instant. Two items can share a timestamp —
// achievements especially, since their unlock dates are computed deterministically —
// and a plain `key < cursor` silently drops every one of them that ties with the last
// item of the previous page.
export interface FeedCursor {
    at: Date;
    type: string;
    id: string;
}

export interface FeedRow {
    id: string;
    type: FeedItemType;
    userId: string;
    createdAt: Date;
    payload: Record<string, unknown>;
}

export const REACTABLE_TYPES = new Set(["workout", "record", "achievement", "comment"]);

// The session's calendar date carrying the clock time it was finished.
//
// A session belongs on the timeline at the moment it was TRAINED, not the moment it
// happened to be saved: ordering by finishedAt put a retroactively entered July session
// between two August ones, buried a Wednesday session seven rows below a Tuesday one
// because it had been planned on Monday, and made cards read "вчора" for a workout done
// three days earlier. The date decides the position; the time only breaks ties inside a
// day.
//
// MIRRORS the SQL expression in FeedService.workoutTimeline —
// `("date"::date + COALESCE("finishedAt", "updatedAt")::time)`. Keep the two in step.
export function timelineAt(date: Date, clock: Date): Date {
    const value = new Date(date);
    value.setUTCHours(clock.getUTCHours(), clock.getUTCMinutes(), clock.getUTCSeconds(), clock.getUTCMilliseconds());
    return value;
}

// Row-wise "strictly after the cursor position" for a Prisma source keyed on `field`.
// Items that tie with the boundary instant survive unless they also sort at-or-before it
// by id, so a batch of achievements sharing one unlockedAt can no longer vanish.
//
// Only the source that MINTED the cursor can use the id tiebreak — ids are not comparable
// across tables — so every other source keeps the plain strict comparison.
export function keysetWhere(field: string, cursor: FeedCursor, type: string): Record<string, unknown> {
    if (cursor.type !== type || !cursor.id) {
        return { [field]: { lt: cursor.at } };
    }
    return {
        OR: [
            { [field]: { lt: cursor.at } },
            { [field]: cursor.at, id: { lt: cursor.id } }
        ]
    };
}

export function encodeFeedCursor(position: FeedCursor): string {
    return Buffer.from(
        JSON.stringify({ t: position.at.toISOString(), y: position.type, i: position.id }),
        "utf8"
    ).toString("base64url");
}

// A malformed cursor restarts the list rather than erroring: the client cannot recover
// from a 500 here, but it can recover from an empty cursor.
export function decodeFeedCursor(cursor?: string): FeedCursor | null {
    if (!cursor) {
        return null;
    }
    try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        const date = new Date(parsed.t);
        if (!Number.isFinite(date.getTime())) {
            return null;
        }
        // `y`/`i` are absent in cursors minted before the keyset upgrade. Such a cursor
        // still paginates — it just keeps the old strict-timestamp behaviour for one page.
        return {
            at: date,
            type: typeof parsed.y === "string" ? parsed.y : "",
            id: typeof parsed.i === "string" ? parsed.i : ""
        };
    } catch (error) {
        return null;
    }
}

// Merge the per-source rows into one page. Each source is asked for `take + 1` rows, so
// more rows than a page means at least one more page exists.
export function mergeFeedRows(rows: FeedRow[], take: number): { page: FeedRow[]; nextCursor: string | null } {
    const sorted = [...rows].sort((left, right) => {
        const diff = right.createdAt.getTime() - left.createdAt.getTime();
        // Ties are ordered by id descending, exactly as each source's SQL does, so the
        // cursor minted from the last row selects the same boundary the sources will.
        return diff !== 0 ? diff : (left.id < right.id ? 1 : left.id > right.id ? -1 : 0);
    });
    const page = sorted.slice(0, take);
    const last = page[page.length - 1];
    return {
        page,
        nextCursor: sorted.length > take && last
            ? encodeFeedCursor({ at: last.createdAt, type: last.type, id: last.id })
            : null
    };
}

interface SetLike {
    weight: unknown;
    repetitions: number;
    isCompleted: boolean;
}

interface ExerciseLike {
    exercise?: { name?: string | null } | null;
    sets: SetLike[];
}

interface WorkoutLike {
    title: string;
    workoutType: string;
    date: Date;
    durationOverride: number | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    exercises: ExerciseLike[];
    cardioSessions: Array<{ durationMinutes: number | null }>;
}

// The card payload for one completed session.
//
// Counts and volume read the completed sets only. That is not a filter in practice —
// finishing a workout marks every one of its sets done (see WorkoutsService.finish and
// the one-off backfill in PrismaService) — but keeping the filter means a row that
// somehow escapes the invariant under-reports rather than inventing volume.
export function workoutFeedPayload(workout: WorkoutLike): Record<string, unknown> {
    const sets = workout.exercises.flatMap((item) => item.sets.filter((set) => set.isCompleted));
    return {
        title: workout.title,
        workoutType: workout.workoutType,
        date: workout.date,
        exerciseCount: workout.exercises.length,
        setCount: sets.length,
        volumeKg: roundKg(sets.reduce((sum, set) => sum + Number(set.weight) * set.repetitions, 0)),
        cardioMinutes: workout.cardioSessions.reduce((sum, item) => sum + (item.durationMinutes || 0), 0),
        durationMinutes: workout.durationOverride
            ?? (workout.startedAt && workout.finishedAt
                ? Math.round((workout.finishedAt.getTime() - workout.startedAt.getTime()) / 60000)
                : null),
        // A short preview so a card can show what was trained without a second request;
        // the full breakdown lives in the detail view.
        exercises: workout.exercises.slice(0, 4).map((item) => ({
            name: item.exercise?.name || "Вправа",
            sets: item.sets.filter((set) => set.isCompleted).length
        }))
    };
}

function roundKg(value: number): number {
    return Math.round(value * 10) / 10;
}
