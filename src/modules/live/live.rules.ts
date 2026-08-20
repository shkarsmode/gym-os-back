// Pure rules for the live layer, kept out of the service so they can be tested without
// a database, a socket or a clock.

/**
 * The cheers you may send.
 *
 * A closed set rather than free text on purpose: this string is rendered straight into
 * somebody else's screen, and an open field pointed at another person's device is an
 * invitation to put something other than encouragement in it.
 */
export const CHEER_EMOJI = ["💪", "🔥", "👏", "🚀", "🤘", "❤️"];

/**
 * Sending a few in a row is the point — one lonely emoji is not encouragement, and a
 * handful arriving together reads as somebody actually cheering. So the limit is a
 * BUCKET rather than a flat cooldown: a burst goes straight through, and only sustained
 * tapping is slowed to a trickle.
 */
export const CHEER_BURST = 8;
export const CHEER_WINDOW_MS = 20000;
export const CHEER_MIN_GAP_MS = 350;

/**
 * Whether this cheer should be delivered live, given when the same person's previous
 * cheers at the same session were sent.
 *
 * The recipient is mid-set with their phone on a bench, so a flurry is welcome and a
 * strobe they cannot stop is not. Limited per (cheerer, session), which means a room
 * full of people all get through — only one person leaning on the button is throttled.
 *
 * The cheer is still RECORDED when this returns false. Only the animation is skipped.
 */
export function allowCheer(recent: number[], now: number): boolean {
    const withinWindow = recent.filter((stamp) => now - stamp < CHEER_WINDOW_MS);
    const last = withinWindow[withinWindow.length - 1];
    if (last !== undefined && now - last < CHEER_MIN_GAP_MS) {
        return false;
    }
    return withinWindow.length < CHEER_BURST;
}

/** The timestamps worth remembering after this one — everything still inside the window. */
export function trimCheerHistory(recent: number[], now: number): number[] {
    return recent.filter((stamp) => now - stamp < CHEER_WINDOW_MS);
}

/**
 * What to show next to somebody in the presence strip.
 *
 * Only a session with a ticked set has a clock worth showing. The other two states are
 * moments where a nudge lands best — someone who has arrived but not lifted, and someone
 * whose session is in today's calendar and has not begun — and putting a running timer
 * next to either of them would be inventing a number.
 */
export type PresenceState = "training" | "warmup" | "planned";

export function presenceState(status: string, firstSetAt: Date | null | undefined): PresenceState {
    if (status === "active") {
        return firstSetAt ? "training" : "warmup";
    }
    return "planned";
}

export const GYM_CLOCK_MAX_MS = 5 * 60 * 60 * 1000;

/**
 * Whether a session is one somebody can still be cheered through.
 *
 * Being "active" is not enough on its own: nothing expires that status server-side, so a
 * workout somebody opened weeks ago and walked away from stays active indefinitely. It
 * has to be TODAY's session — or one whose clock is genuinely still running, which is how
 * a session that crossed midnight stays cheerable.
 */
export function isCheerable(status: string, date: Date, now: Date, lastSetAt?: Date | null): boolean {
    if (status === "active") {
        if (sameLocalDay(date, now)) {
            return true;
        }
        return Boolean(lastSetAt) && now.getTime() - (lastSetAt as Date).getTime() < GYM_CLOCK_MAX_MS;
    }
    // A session planned for next Tuesday is not somebody to cheer on right now.
    return status === "planned" && sameLocalDay(date, now);
}

function sameLocalDay(left: Date, right: Date): boolean {
    return left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate();
}

/**
 * One row per person for the presence strip.
 *
 * Somebody can legitimately have more than one qualifying session at once — a planned
 * one for today plus a running one, or two rows left active because nothing on the server
 * enforces a single open session. Rendering both puts the same face in the strip twice,
 * which reads as a bug to anyone looking at it.
 *
 * The most advanced state wins, because that is the truthful one: if a set has been
 * ticked, the person IS training, whatever else is sitting in their calendar.
 */
const STATE_RANK: Record<string, number> = { training: 3, warmup: 2, planned: 1 };

export function onePerPerson<T extends { userId: string; state: string; firstSetAt?: string | null }>(rows: T[]): T[] {
    const best = new Map<string, T>();
    for (const row of rows) {
        const held = best.get(row.userId);
        if (!held || beats(row, held)) {
            best.set(row.userId, row);
        }
    }
    return [...best.values()];
}

function beats(candidate: { state: string; firstSetAt?: string | null }, held: { state: string; firstSetAt?: string | null }): boolean {
    const rank = (STATE_RANK[candidate.state] || 0) - (STATE_RANK[held.state] || 0);
    if (rank !== 0) {
        return rank > 0;
    }
    // Same state: the one started more recently is the session they are actually in.
    return String(candidate.firstSetAt || "") > String(held.firstSetAt || "");
}
