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

/** How long one person must wait before their cheer at the same session animates again. */
export const CHEER_COOLDOWN_MS = 3000;

/**
 * Whether this cheer should be delivered live.
 *
 * The recipient is mid-set with their phone on a bench. A tap that reaches them is a
 * flurry of emoji across the screen, which is the point — and the same mechanism held
 * down turns into a strobe on someone else's device that they cannot stop. The cooldown
 * is per (cheerer, session), so a room full of people cheering still all get through;
 * only one person spamming is slowed.
 *
 * The cheer is still RECORDED when this returns false. Only the animation is skipped.
 */
export function cheerCooldown(lastAt: number | undefined, now: number): boolean {
    if (!lastAt) {
        return true;
    }
    return now - lastAt >= CHEER_COOLDOWN_MS;
}
