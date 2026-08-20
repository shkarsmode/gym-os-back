// Pure rules for the access-request lifecycle, kept out of the service so the parts that
// decide what a person may do can be tested without a database.

export type GrantStatus = "pending" | "accepted" | "rejected";

/** A rejection this far in the future is a block. Storage still sees three statuses. */
export const BLOCK_UNTIL = new Date("9999-12-31T00:00:00.000Z");

/**
 * How long after a refusal the same person may ask again.
 *
 * Escalating, because the failure mode being prevented is somebody asking over and over
 * after being told no. The first refusal is usually not a statement about the person, so
 * it costs a day; being refused repeatedly is.
 *
 * `rejectedCount` is the count AFTER this rejection is recorded — the value the write has
 * just produced, not the one read before it. Passing the pre-write count silently shifts
 * every step by one and makes the first refusal a month.
 */
export function cooldownAfterReject(rejectedCount: number): number {
    const days = [1, 7, 30];
    const index = Math.min(Math.max(rejectedCount, 1), days.length) - 1;
    return days[index];
}

export function cooldownUntil(rejectedCount: number, now: Date): Date {
    const until = new Date(now);
    until.setDate(until.getDate() + cooldownAfterReject(rejectedCount));
    return until;
}

export function isBlocked(cooldown: Date | null | undefined): boolean {
    if (!cooldown) {
        return false;
    }
    // Anything absurdly far out is a block rather than a wait.
    return cooldown.getTime() > Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
}

export interface GrantLike {
    status: string;
    cooldownUntil?: Date | null;
    rejectedCount?: number;
}

export type RequestVerdict =
    | { allowed: true }
    | { allowed: false; reason: "already_pending" | "already_accepted" | "cooling_down" };

/**
 * Whether this viewer may ask this owner for access right now.
 *
 * Note what the refusals deliberately do NOT carry: how many times the owner has said no,
 * or when the cooldown ends. A viewer who can read the exact expiry can subtract it and
 * learn both the decision and how emphatic it was — including that they have been
 * blocked, which is precisely the thing a block should not announce.
 */
export function canRequest(grant: GrantLike | null, now: Date): RequestVerdict {
    if (!grant) {
        return { allowed: true };
    }
    if (grant.status === "pending") {
        return { allowed: false, reason: "already_pending" };
    }
    if (grant.status === "accepted") {
        return { allowed: false, reason: "already_accepted" };
    }
    if (grant.cooldownUntil && grant.cooldownUntil.getTime() > now.getTime()) {
        return { allowed: false, reason: "cooling_down" };
    }
    return { allowed: true };
}

/**
 * What the VIEWER is told about their own request.
 *
 * A rejection is reported as "no answer yet" rather than as a refusal. That is a
 * deliberate product choice, not an oversight: telling somebody in a small gym that a
 * specific person declined them turns a quiet setting into a social event, and the owner
 * chose privacy precisely to avoid one. The request simply stops being actionable.
 */
export function viewerFacingStatus(grant: GrantLike | null): "none" | "pending" | "accepted" {
    if (!grant) {
        return "none";
    }
    if (grant.status === "accepted") {
        return "accepted";
    }
    // pending and rejected both read as pending to the person who asked.
    return "pending";
}

/** Transitions the OWNER may make, given the row's current state. */
export function ownerMayTransition(from: string, to: GrantStatus | "revoked"): boolean {
    if (to === "accepted") {
        return from === "pending";
    }
    if (to === "rejected") {
        // Rejecting covers both refusing a request and blocking outright.
        return from === "pending" || from === "accepted";
    }
    if (to === "revoked") {
        return from === "accepted";
    }
    return false;
}
