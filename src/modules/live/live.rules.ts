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

/** Whether a session is one somebody can still be cheered through. */
export function isCheerable(status: string, date: Date, now: Date): boolean {
    if (status === "active") {
        return true;
    }
    // A session planned for next Tuesday is not somebody to cheer on right now.
    return status === "planned" && sameLocalDay(date, now);
}

function sameLocalDay(left: Date, right: Date): boolean {
    return left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate();
}
