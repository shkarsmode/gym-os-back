/**
 * Keyset cursors for paging workouts.
 *
 * WHY A COMPOSITE (date, id) AND NOT JUST date:
 *
 * `Workout.date` is not unique — the quota permits two workouts a day, and in practice
 * people log a morning and an evening session. A cursor on `date` alone cannot express
 * "the rows after this one" when several share the timestamp, so a page boundary
 * landing inside such a group either skips rows or returns them twice. Neither shows an
 * error; the user just finds a workout missing from their history, or listed twice.
 *
 * WHY THE RAW DateTime AND NOT THE "YYYY-MM-DD" STRING:
 *
 * The column is `DateTime`, not `@db.Date`, and nothing truncates it on write. Encoding
 * the day string coerces the cursor to T00:00:00Z, so any row stored at another instant
 * fails the `(date = cursor.date AND id < cursor.id)` branch and is then re-matched by
 * the `date < cursor.date` branch — reappearing on the next page. That is precisely the
 * duplicate the composite cursor exists to prevent, reintroduced by the encoding.
 *
 * Cursors are opaque to clients: base64url of the JSON pair. They are a position, not
 * an identifier — never persist one or use it as a key.
 */

export interface WorkoutCursor {
    /** ISO instant of Workout.date, full precision. */
    d: string;
    /** Workout.id, the tie-break within an identical instant. */
    i: string;
}

export function encodeCursor(row: { date: Date; id: string }): string {
    const payload: WorkoutCursor = { d: row.date.toISOString(), i: row.id };
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Returns null for anything unusable rather than throwing. A stale or hand-edited
 * cursor should restart the list, not 500 — the client cannot recover from an error
 * here, but it can recover from an empty cursor.
 */
export function decodeCursor(value: unknown): WorkoutCursor | null {
    if (typeof value !== "string" || !value) {
        return null;
    }
    try {
        const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
        if (!parsed || typeof parsed.d !== "string" || typeof parsed.i !== "string") {
            return null;
        }
        if (Number.isNaN(new Date(parsed.d).getTime())) {
            return null;
        }
        return { d: parsed.d, i: parsed.i };
    } catch (error) {
        return null;
    }
}

/**
 * The Prisma `where` for "strictly after this cursor", descending.
 *
 * Expressed as the two-branch form rather than a row-value comparison because Prisma
 * has no row-value syntax. Both branches are required: the first walks earlier
 * instants, the second walks the remaining rows sharing this exact instant.
 *
 * Backed by @@index([userId, date]); add ([userId, date, id]) before this runs against
 * a table large enough to care, or the id tie-break sorts in memory.
 */
export function cursorFilter(cursor: WorkoutCursor | null) {
    if (!cursor) {
        return {};
    }
    const at = new Date(cursor.d);
    return {
        OR: [
            { date: { lt: at } },
            { date: at, id: { lt: cursor.i } }
        ]
    };
}

/**
 * The ordering every paged workout query must use. Both keys, in this order, or the
 * cursor describes a position in a sequence the query does not actually produce.
 */
export const WORKOUT_PAGE_ORDER = [
    { date: "desc" as const },
    { id: "desc" as const }
];
