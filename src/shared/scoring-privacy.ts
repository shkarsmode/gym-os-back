/**
 * Redaction of the scoring payload for members who keep their training private.
 *
 * The rule applied field by field: anything measured in KILOGRAMS, REPETITIONS or SETS
 * is detail and goes; anything measured in SESSIONS, DAYS or MINUTES is a general
 * statistic and stays. That keeps a private member present in the feed and on the
 * leaderboard — which is what the product asks for — while removing what they asked to
 * hide.
 *
 * Two of the removals are less obvious than the rest and both were found by attacking the
 * design rather than reading it:
 *
 *  1. The TEAM totals are sums over everyone. Zeroing one member's volume while leaving
 *     the team total intact means their number can be recovered exactly by subtracting
 *     everybody else's. So the detail-derived team sums are recomputed from the members
 *     this viewer may actually see.
 *
 *  2. `mostUsedExerciseId` and `mostTrainedMuscleGroup` are not numbers, but they are
 *     derived from the exercise list — they say WHAT somebody trains, which is the first
 *     thing "hide my exercises" is meant to cover.
 *
 * A knowingly accepted residual: `xp` and `level` stay visible, and XP is partly earned
 * from volume, so watching a private member's XP move across a session bounds that
 * session's volume. Hiding them would remove that member from the leaderboard entirely,
 * which contradicts the explicit requirement that general statistics stay visible. The
 * bound is coarse (XP from volume is capped per session) and the trade is deliberate.
 */

/** Per-user fields that are measured in kg, reps or sets, or say what someone trains. */
const HIDDEN_STAT_FIELDS = [
    "totalSets",
    "workingSets",
    "warmupSets",
    "totalVolume",
    "weekVolume",
    "weekSets",
    "cardioDistance",
    "personalRecords",
    "notesCount",
    "mostUsedExerciseId",
    "mostTrainedMuscleGroup"
] as const;

/** Team sums that must be rebuilt from visible members so they cannot be un-summed. */
const TEAM_SUM_FIELDS = [
    ["totalSets", "totalSets"],
    ["workingSets", "workingSets"],
    ["totalVolume", "totalVolume"],
    ["cardioDistance", "cardioDistance"]
] as const;

interface ScoringUser {
    stats?: Record<string, unknown>;
    records?: unknown[];
    achievements?: unknown[];
    xpLedger?: unknown[];
    xp?: number;
    level?: number;
}

export interface ScoringPayload {
    users: Record<string, ScoringUser>;
    team?: Record<string, unknown>;
}

/**
 * @param canSeeDetail owner id -> may this caller see their detail
 * @param callerId     the caller, who always sees everything of their own
 */
export function redactScoring(
    payload: ScoringPayload,
    callerId: string,
    canSeeDetail: (ownerId: string) => boolean
): ScoringPayload {
    const users: Record<string, ScoringUser> = {};
    let anyHidden = false;

    for (const [id, entry] of Object.entries(payload.users || {})) {
        const own = id === callerId;
        // Peer XP ledgers were already dropped before this existed: only your own is ever
        // rendered, and it is a large slice of the payload.
        const base: ScoringUser = own ? entry : { ...entry, xpLedger: [] };
        if (own || canSeeDetail(id)) {
            users[id] = base;
            continue;
        }
        anyHidden = true;
        users[id] = {
            ...base,
            // The records themselves are explicitly on the hidden list.
            records: [],
            stats: redactStats(base.stats)
        };
    }

    if (!anyHidden || !payload.team) {
        return { ...payload, users };
    }

    const visible = Object.entries(users).filter(([id]) => id === callerId || canSeeDetail(id));
    const team: Record<string, unknown> = { ...payload.team };
    for (const [teamField, statField] of TEAM_SUM_FIELDS) {
        team[teamField] = round(visible.reduce(
            (sum, [, entry]) => sum + numberOf(entry.stats?.[statField]),
            0
        ));
    }
    // Not a sum, and derived from the exercise list of everyone including the hidden.
    team.mostUsedExerciseId = null;
    team.mostTrainedMuscleGroup = null;
    return { ...payload, users, team };
}

function redactStats(stats: Record<string, unknown> | undefined): Record<string, unknown> {
    const kept: Record<string, unknown> = { ...(stats || {}) };
    for (const field of HIDDEN_STAT_FIELDS) {
        // DELETED, not zeroed. A zero is a claim that somebody lifted nothing, which is
        // both false and indistinguishable from a bug; an absent key makes a consumer
        // that has not been taught about privacy fail visibly instead of quietly.
        delete kept[field];
    }
    return kept;
}

function numberOf(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number): number {
    return Math.round(value * 10) / 10;
}
